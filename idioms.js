// Idioms Module - Database layer for idiom management (Separate from words)

class IdiomDB {
    constructor(mainDb) {
        this.db = mainDb.db; // Firebase database reference
        this.mainDb = mainDb;
    }

    get userId() {
        return firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
    }

    // --- IDIOM CRUD ---
    subscribeToIdioms(callback) {
        if (!this.userId) return;
        this.db.ref(`users/${this.userId}/idioms`).on('value', snap => callback(snap.val()));
    }

    async getAllIdioms() {
        if (!this.userId) return {};
        const snap = await this.db.ref(`users/${this.userId}/idioms`).once('value');
        return snap.val() || {};
    }

    async saveIdiom(idiom) {
        if (!this.userId || !idiom.id) return;
        await this.db.ref(`users/${this.userId}/idioms/${idiom.id}`).set(idiom);
    }

    async updateIdiom(id, updates) {
        if (!this.userId) return;
        await this.db.ref(`users/${this.userId}/idioms/${id}`).update(updates);
    }

    async deleteIdiom(id) {
        if (!this.userId) return;
        await this.db.ref(`users/${this.userId}/idioms/${id}`).remove();
    }

    // --- IDIOM FOLDERS ---
    subscribeToIdiomFolders(callback) {
        if (!this.userId) return;
        this.db.ref(`users/${this.userId}/idiomFolders`).on('value', snap => callback(snap.val()));
    }

    async saveIdiomFolder(folder) {
        if (!this.userId || !folder.id) return;
        await this.db.ref(`users/${this.userId}/idiomFolders/${folder.id}`).set(folder);
    }

    async deleteIdiomFolder(folderId) {
        if (!this.userId) return;
        await this.db.ref(`users/${this.userId}/idiomFolders/${folderId}`).remove();
    }

    // --- IMPORT ---
    // Auto-detect: is this an idiom table or a word table?
    // Idiom columns: ID | Идиома | Перевод | Смысловой перевод | Дополнительно | Пример | Папка | Интервал | След.повтор
    // Word columns: ID | Активное | Слово | Перевод | Формы глагола | Дополнительно | Пример1 | Пример2 | Папка | Идеально
    static detectTableType(rows) {
        if (!rows || rows.length === 0) return 'unknown';

        // Check header row first
        const header = rows[0];
        if (header && Array.isArray(header)) {
            const headerStr = header.map(h => String(h || '').toLowerCase().trim()).join(' ');
            if (headerStr.includes('идиом')) return 'idioms';
            if (headerStr.includes('idiom')) return 'idioms';
            if (headerStr.includes('смысловой')) return 'idioms';
            if (headerStr.includes('meaning')) return 'idioms';
        }

        // Heuristic: check data rows
        // Words have column B as "yes/no" or a number (active score)
        // Idioms don't have that column — column B is the idiom text itself
        let startIndex = 0;
        if (header && String(header[0]).toLowerCase().includes('id')) startIndex = 1;

        let wordLike = 0;
        let idiomLike = 0;
        const checkRows = Math.min(rows.length, startIndex + 5);

        for (let i = startIndex; i < checkRows; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row) || row.length < 3) continue;

            const colB = String(row[1] || '').trim().toLowerCase();

            // Words: column B is "yes", "no", or a number 0-10
            if (colB === 'yes' || colB === 'no' || (!isNaN(parseFloat(colB)) && colB.length <= 3)) {
                wordLike++;
            } else {
                // Column B has text content (likely idiom text)
                idiomLike++;
            }
        }

        if (idiomLike > wordLike) return 'idioms';
        if (wordLike > 0) return 'words';
        return 'unknown';
    }

    async processSmartIdiomImport(rows) {
        const existingIdioms = await this.getAllIdioms();
        const existingIds = new Set(Object.keys(existingIdioms));
        const updates = {};
        let stats = { updated: 0, created: 0, deleted: 0 };

        let startIndex = 0;
        if (rows.length > 0 && String(rows[0][0]).toLowerCase().includes('id')) startIndex = 1;

        // Auto-folder tracking
        const autoFolderCounts = {};
        Object.values(existingIdioms).forEach(idiom => {
            if (idiom.folder && idiom.folder.startsWith('Папка идиом ')) {
                const num = parseInt(idiom.folder.replace('Папка идиом ', ''));
                if (!isNaN(num)) {
                    if (!autoFolderCounts[num]) autoFolderCounts[num] = 0;
                    autoFolderCounts[num]++;
                }
            }
        });

        let autoFolderIndex = 1;
        let wordsInCurrentAutoFolder = 0;
        const autoFolderNumbers = Object.keys(autoFolderCounts).map(k => parseInt(k));
        if (autoFolderNumbers.length > 0) {
            autoFolderIndex = Math.max(...autoFolderNumbers);
            wordsInCurrentAutoFolder = autoFolderCounts[autoFolderIndex] || 0;
            if (wordsInCurrentAutoFolder >= 50) {
                autoFolderIndex++;
                wordsInCurrentAutoFolder = 0;
            }
        }

        // Columns: ID | Идиома | Перевод | Смысловой перевод | Дополнительно | Пример | Папка
        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row) || row.length < 2) continue;

            let id = String(row[0] || '').trim();
            if (!id) continue;

            // Handle legacy i_ prefix by removing it, or keep numeric IDs as is
            id = id.replace('i_', '');
            
            let numericId = parseInt(id);
            if (!isNaN(numericId) && numericId < 100000) {
                // If it's a small ID from import, we offset it to the idiom range
                id = String(numericId + 100000);
            }

            let idiomFolder = String(row[6] || '').trim();
            const existingIdiom = existingIdioms[id];

            if (!idiomFolder) {
                if (existingIdiom && existingIdiom.folder) {
                    idiomFolder = existingIdiom.folder;
                } else {
                    if (wordsInCurrentAutoFolder >= 50) {
                        autoFolderIndex++;
                        wordsInCurrentAutoFolder = 0;
                    }
                    idiomFolder = `Папка идиом ${autoFolderIndex}`;
                    wordsInCurrentAutoFolder++;
                }
            }

            const idiomData = {
                id: id,
                idiom: String(row[1] || '').trim(),
                translation: String(row[2] || '').trim(),
                meaning: String(row[3] || '').trim(),
                info: String(row[4] || '').trim(),
                example: String(row[5] || '').trim(),
                folder: idiomFolder
            };

            const dbPath = `users/${this.userId}/idioms/${id}`;

            if (existingIds.has(id)) {
                // Update existing
                const existing = existingIdioms[id];
                const norm = (val) => String(val || '').trim();
                let hasChanges = false;

                if (norm(existing.idiom) !== idiomData.idiom) { updates[`${dbPath}/idiom`] = idiomData.idiom; hasChanges = true; }
                if (norm(existing.translation) !== idiomData.translation) { updates[`${dbPath}/translation`] = idiomData.translation; hasChanges = true; }
                if (norm(existing.meaning) !== idiomData.meaning) { updates[`${dbPath}/meaning`] = idiomData.meaning; hasChanges = true; }
                if (norm(existing.info) !== idiomData.info) { updates[`${dbPath}/info`] = idiomData.info; hasChanges = true; }
                if (norm(existing.example) !== idiomData.example) { updates[`${dbPath}/example`] = idiomData.example; hasChanges = true; }
                if (norm(existing.folder) !== idiomData.folder) { updates[`${dbPath}/folder`] = idiomData.folder; hasChanges = true; }

                if (hasChanges) stats.updated++;
            } else {
                // Create new
                // For new idioms, interval is 0 and nextDate is NOW
                const defaultProgress = {
                    interval: 0,
                    nextDate: Date.now(),
                    state: 'new',
                    is_ideal: false
                };

                updates[dbPath] = {
                    ...idiomData,
                    progress_global: defaultProgress
                };
                stats.created++;
            }
        }

        if (Object.keys(updates).length > 0) {
            await this.db.ref().update(updates);
        }
        return stats;
    }

    // --- EXPORT ---
    exportIdiomsToExcel(idiomsCache) {
        const allIdioms = [...idiomsCache].sort((a, b) => {
            const numA = parseInt(String(a.id).replace('i_', ''));
            const numB = parseInt(String(b.id).replace('i_', ''));
            return numA - numB;
        });

        if (!allIdioms || allIdioms.length === 0) {
            alert('Нет идиом для экспорта.');
            return;
        }

        // Export only the static data columns to match vocabulary export and user request
        const data = allIdioms.map(idiom => {
            return {
                'ID': idiom.id,
                'Идиома': idiom.idiom || '',
                'Перевод': idiom.translation || '',
                'Смысловой перевод': idiom.meaning || '',
                'Дополнительно': idiom.info || '',
                'Пример': idiom.example || '',
                'Папка': idiom.folder || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Idioms');

        const date = new Date().toISOString().split('T')[0];
        const fileName = `WordLab_Idioms_Export_${date}_(${allIdioms.length}).xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    // Generate next idiom ID (always 100,000+)
    getNextIdiomId(idiomsCache) {
        let maxNum = 100000;
        idiomsCache.forEach(idiom => {
            const num = parseInt(String(idiom.id).replace('i_', ''));
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        return String(maxNum + 1);
    }

    // Migrate all existing idiom IDs to start from 100001
    async migrateIdiomIds() {
        if (!this.userId) return { migrated: 0 };

        const snap = await this.db.ref(`users/${this.userId}/idioms`).once('value');
        const data = snap.val();
        if (!data) return { migrated: 0 };

        const idioms = Object.values(data);

        // Check if migration is needed: any ID < 100000 or has 'i_' prefix
        const needsMigration = idioms.some(i => {
            const id = String(i.id || '');
            if (id.startsWith('i_')) return true;
            const num = parseInt(id);
            return !isNaN(num) && num < 100000;
        });

        if (!needsMigration) return { migrated: 0 };

        // Sort by old ID so ordering is preserved
        idioms.sort((a, b) => {
            const na = parseInt(String(a.id).replace('i_', '')) || 0;
            const nb = parseInt(String(b.id).replace('i_', '')) || 0;
            return na - nb;
        });

        const updates = {};
        let counter = 100001;

        idioms.forEach(idiom => {
            const oldId = String(idiom.id);
            const newId = String(counter++);

            if (oldId !== newId) {
                // Write new record
                updates[`users/${this.userId}/idioms/${newId}`] = { ...idiom, id: newId };
                // Delete old record
                updates[`users/${this.userId}/idioms/${oldId}`] = null;
            }
        });

        if (Object.keys(updates).length > 0) {
            await this.db.ref().update(updates);
        }

        return { migrated: idioms.length };
    }
}

// Export globally
window.IdiomDB = IdiomDB;
