// DOM Elements - Screens
// const loginScreen = document.getElementById('login-screen');
// const registerScreen = document.getElementById('register-screen');
const dashboardScreen = document.getElementById('dashboard-screen');

// Header Items
const navHomeBtn = document.getElementById('nav-home-btn');

// DOM Elements - Dashboard Views
const viewProfile = document.getElementById('view-profile');
const viewImport = document.getElementById('view-import');
const viewWords = document.getElementById('view-words');
const viewStudy = document.getElementById('view-study');
const viewStudySession = document.getElementById('view-study-session');
const viewExam = document.getElementById('view-exam');
const viewSettings = document.getElementById('view-settings');

// Menu Buttons
const navSettingsBtn = document.getElementById('nav-settings-btn');

// Forms & Inputs
const loginError = null; // Removed
const regError = null; // Removed
const excelFileInput = document.getElementById('excel-file-input');
const importStatus = document.getElementById('import-status');
const wordsTableBody = document.getElementById('words-table-body');

// Modal Elements (Removed legacy modal logic to edit-word.js)

// --- STATE ---
let allWordsCache = [];

// --- UTILS ---
function normalizeGerman(str) {
    if (!str) return "";
    let clean = str.toLowerCase();

    // 1. Handle variants after comma (like "Wort, die Wörter" or "Hause, nach")
    if (clean.includes(',')) {
        clean = clean.split(',')[0];
    }

    // 2. Remove content in parentheses (like "Wort (-er)")
    clean = clean.replace(/\s*\(.*?\)/g, '');

    // 3. Remove all articles and common particles with boundary checks
    clean = clean.replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen|sich)\b/gi, '');

    // 4. Remove all non-alphanumeric except German characters (äöüß)
    clean = clean.replace(/[^a-z0-9äöüß]/gi, '');

    return clean.trim();
}

// Duplicate detection key: includes noun/non-noun distinction
// "der Morgen" and "morgen" are DIFFERENT words (noun vs adverb/verb)
function getDuplicateKey(str) {
    if (!str) return "";
    const raw = str.trim();
    // Check if the word starts with a German article (= it's a noun)
    const hasArticle = /^(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/i.test(raw);
    const normalized = normalizeGerman(raw);
    // Nouns and non-nouns get different keys even if base word is the same
    return hasArticle ? normalized + '::noun' : normalized;
}

// --- DATABASE HANDLER ---
class WordLabDB {
    constructor() { this.db = firebase.database(); }
    get userId() { return firebase.auth().currentUser ? firebase.auth().currentUser.uid : null; }

    subscribeToWords(callback) {
        if (!this.userId) return;
        this.db.ref(`users/${this.userId}/words`).on('value', snap => callback(snap.val()));
    }

    async updateWord(id, updates) {
        await this.db.ref(`users/${this.userId}/words/${id}`).update(updates);
    }

    async updateProgress(wordId, typeKey, newProgress) {
        await this.db.ref(`users/${this.userId}/words/${wordId}/${typeKey}`).set(newProgress);
    }

    async saveSettings(settings) {
        if (!this.userId) return;
        await this.db.ref(`users/${this.userId}/settings/study`).set(settings);
    }

    async getSettings() {
        if (!this.userId) return null;
        const snap = await this.db.ref(`users/${this.userId}/settings/study`).once('value');
        return snap.val();
    }

    async deleteWord(id) {
        await this.db.ref(`users/${this.userId}/words/${id}`).remove();
    }

    async resetProgressOnly() {
        if (!this.userId) return;
        if (confirm("Вы уверены? Это сбросит прогресс изучения для ВСЕХ слов и обнулит всё время обучения, но сами слова останутся.")) {
            const words = await this.getAllWords();
            const updates = {};
            const defaultProgress = {
                interval: 0,
                nextDate: Date.now(),
                state: "new",
                excellentStreak: 0,
                isActive: false,
                is_ideal: false,
                lastRating: null,
                lastReviewed: null
            };
            Object.keys(words).forEach(id => {
                updates[`users/${this.userId}/words/${id}/progress_global`] = defaultProgress;
                updates[`users/${this.userId}/words/${id}/progress_groups`] = defaultProgress;
            });

            // Also clear stats/daily (Total time)
            updates[`users/${this.userId}/stats/daily`] = null;

            await this.db.ref().update(updates);
            alert("Прогресс и статистика времени сброшены.");
            // Redirect to profile
            if (window.switchView) window.switchView(document.getElementById('view-profile'));
        }
    }

    async clearAllWords() {
        if (!this.userId) return;
        if (confirm("Вы уверены? Это удалит ТИТАНИЧЕСКОЕ количество слов (весь ваш словарь) безвозвратно.")) {
            await this.db.ref(`users/${this.userId}/words`).remove();
            alert("Словарь очищен.");
            // Redirect to dictionary
            if (window.switchView) window.switchView(document.getElementById('view-words'));
        }
    }

    async resetAllProgress() {
        if (!this.userId) return;
        if (confirm("Вы уверены? Это действие удалит ВСЕ ваши слова и данные аккаунта в базе данных.")) {
            await this.db.ref(`users/${this.userId}`).remove();
            window.location.reload();
        }
    }

    async getAllWords() {
        const snap = await this.db.ref(`users/${this.userId}/words`).once('value');
        const words = snap.val() || {};
        await this.autoOrganizeExistingWords(words);
        return words;
    }

    async autoOrganizeExistingWords(words) {
        if (!words || Object.keys(words).length === 0) return;
        const updates = {};
        const wordsSorted = Object.values(words).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        // Build a complete map of how many words are in each auto-folder
        const autoFolderCounts = {};
        wordsSorted.forEach(w => {
            if (w.folder && w.folder.startsWith('Папка ')) {
                const num = parseInt(w.folder.replace('Папка ', ''));
                if (!isNaN(num)) {
                    if (!autoFolderCounts[num]) autoFolderCounts[num] = 0;
                    autoFolderCounts[num]++;
                }
            }
        });

        // Find the current auto-folder to use (the last one that's not full)
        let currentAutoIdx = 1;
        let wordsInCurrentAuto = 0;

        const autoFolderNumbers = Object.keys(autoFolderCounts).map(k => parseInt(k));
        if (autoFolderNumbers.length > 0) {
            currentAutoIdx = Math.max(...autoFolderNumbers);
            wordsInCurrentAuto = autoFolderCounts[currentAutoIdx] || 0;

            // If the last auto-folder is full, start a new one
            if (wordsInCurrentAuto >= 100) {
                currentAutoIdx++;
                wordsInCurrentAuto = 0;
            }
        }

        wordsSorted.forEach(w => {
            if (!w.folder) {
                if (wordsInCurrentAuto >= 100) {
                    currentAutoIdx++;
                    wordsInCurrentAuto = 0;
                }
                const folderName = `Папка ${currentAutoIdx}`;
                updates[`users/${this.userId}/words/${w.id}/folder`] = folderName;
                w.folder = folderName; // Update local cache too
                wordsInCurrentAuto++;
            }
        });

        if (Object.keys(updates).length > 0) {
            await this.db.ref().update(updates);
        }
    }

    async processSmartImport(rows) {
        const existingWords = await this.getAllWords();
        const existingIds = new Set(Object.keys(existingWords));
        const updates = {};
        const newIdsInFile = new Set();
        let stats = { updated: 0, created: 0, deleted: 0 };
        let startIndex = 0;
        if (rows.length > 0 && String(rows[0][0]).toLowerCase().includes('id')) startIndex = 1;

        // Auto-folder tracking for new/empty folder words
        // Build a complete map of how many words are in each auto-folder
        const autoFolderCounts = {};
        const wordsSorted = Object.values(existingWords).sort((a, b) => parseInt(a.id) - parseInt(b.id));

        wordsSorted.forEach(w => {
            if (w.folder && w.folder.startsWith('Папка ')) {
                const num = parseInt(w.folder.replace('Папка ', ''));
                if (!isNaN(num)) {
                    if (!autoFolderCounts[num]) autoFolderCounts[num] = 0;
                    autoFolderCounts[num]++;
                }
            }
        });

        // Find the current auto-folder to use (the last one that's not full)
        let autoFolderIndex = 1;
        let wordsInCurrentAutoFolder = 0;

        // Find the highest auto-folder number
        const autoFolderNumbers = Object.keys(autoFolderCounts).map(k => parseInt(k));
        if (autoFolderNumbers.length > 0) {
            autoFolderIndex = Math.max(...autoFolderNumbers);
            wordsInCurrentAutoFolder = autoFolderCounts[autoFolderIndex] || 0;

            // If the last auto-folder is full, start a new one
            if (wordsInCurrentAutoFolder >= 100) {
                autoFolderIndex++;
                wordsInCurrentAutoFolder = 0;
            }
        }

        for (let i = startIndex; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row) || row.length < 2) continue;
            const id = String(row[0] || "").trim();
            if (!id) continue;
            newIdsInFile.add(id);
            // Score handling: 0-10 range. 10 = Active.
            let rawScore = String(row[1] || "").trim();
            let scoreVal = 0;

            if (rawScore.toLowerCase() === 'yes') scoreVal = 10;
            else if (rawScore.toLowerCase() === 'no') scoreVal = 0;
            else {
                scoreVal = parseFloat(rawScore);
                if (isNaN(scoreVal)) scoreVal = 0;
            }
            // Clamp 0-10
            scoreVal = Math.max(0, Math.min(10, scoreVal));

            const isActive = scoreVal >= 10;
            const is_ideal = isActive;
            const excellentStreak = scoreVal;
            let wordFolder = String(row[8] || "").trim();
            // is_ideal from column J (index 9)
            const rawIdeal = String(row[9] || "").trim().toLowerCase();
            let importedIdeal = null; // null means "don't override from import"
            if (rawIdeal === 'true') importedIdeal = true;
            else if (rawIdeal === 'false') importedIdeal = false;

            // Only auto-assign folder if it's empty AND it's a new word OR existing word without folder
            const existingWord = existingWords[id];
            if (!wordFolder) {
                // Check if this is an existing word that already has a folder
                if (existingWord && existingWord.folder) {
                    // Keep the existing folder
                    wordFolder = existingWord.folder;
                } else {
                    // Assign to auto-folder
                    if (wordsInCurrentAutoFolder >= 100) {
                        autoFolderIndex++;
                        wordsInCurrentAutoFolder = 0;
                    }
                    wordFolder = `Папка ${autoFolderIndex}`;
                    wordsInCurrentAutoFolder++;
                }
            }

            // Cleaning helpers
            const cleanParens = (val) => String(val || "").replace(/[()]/g, '').replace(/\s+/g, ' ').trim(); // Remove parens, normalize spaces
            const cleanTr = (val) => String(val || "").replace(/\s*\(pl\)/gi, '').replace(/\s*\(plural\)/gi, '').trim();

            const wordData = {
                word: String(row[2] || "").trim(),
                translation: cleanTr(row[3]),
                info1: cleanParens(row[4]),
                info2: cleanParens(row[5]),
                ex1: cleanParens(row[6]),
                ex2: cleanParens(row[7]),
                folder: wordFolder
            };
            const dbPath = `users/${this.userId}/words/${id}`;
            if (existingIds.has(id)) {
                // Check if anything actually changed
                const existing = existingWords[id];
                let hasChanges = false;

                // Helper to normalize for comparison (treat null/undefined as empty string)
                const norm = (val) => String(val || "").trim();

                if (norm(existing.word) !== wordData.word) { updates[`${dbPath}/word`] = wordData.word; hasChanges = true; }
                if (norm(existing.translation) !== wordData.translation) { updates[`${dbPath}/translation`] = wordData.translation; hasChanges = true; }
                if (norm(existing.info1) !== wordData.info1) { updates[`${dbPath}/info1`] = wordData.info1; hasChanges = true; }
                if (norm(existing.info2) !== wordData.info2) { updates[`${dbPath}/info2`] = wordData.info2; hasChanges = true; }
                if (norm(existing.ex1) !== wordData.ex1) { updates[`${dbPath}/ex1`] = wordData.ex1; hasChanges = true; }
                if (norm(existing.ex2) !== wordData.ex2) { updates[`${dbPath}/ex2`] = wordData.ex2; hasChanges = true; }
                if (norm(existing.folder) !== wordData.folder) { updates[`${dbPath}/folder`] = wordData.folder; hasChanges = true; }

                const existingScore = existing.progress_global ? (existing.progress_global.excellentStreak || 0) : 0;
                // Update score if changed. Since import implies new state, we trust the file's score.
                if (existingScore !== excellentStreak) {
                    updates[`${dbPath}/progress_global/excellentStreak`] = excellentStreak;
                    updates[`${dbPath}/progress_global/isActive`] = excellentStreak >= 10;
                    updates[`${dbPath}/progress_global/is_ideal`] = importedIdeal !== null ? importedIdeal : (excellentStreak >= 10);
                    hasChanges = true;
                }
                // Update is_ideal if explicitly provided in import and differs
                if (importedIdeal !== null) {
                    const existingIdeal = existing.progress_global ? (existing.progress_global.is_ideal || false) : false;
                    if (existingIdeal !== importedIdeal) {
                        updates[`${dbPath}/progress_global/is_ideal`] = importedIdeal;
                        hasChanges = true;
                    }
                }

                if (hasChanges) stats.updated++;
            } else {
                const defaultProgress = { interval: 0, nextDate: Date.now(), state: "new" };
                updates[dbPath] = {
                    id: id,
                    ...wordData,
                    progress_global: { ...defaultProgress, isActive: isActive, is_ideal: importedIdeal !== null ? importedIdeal : is_ideal, excellentStreak: excellentStreak },
                    progress_groups: defaultProgress
                };
                stats.created++;
            }
        }
        // Deletion logic removed to support safe partial imports.
        // Words not present in the import file are preserved.

        if (Object.keys(updates).length > 0) await this.db.ref().update(updates);
        return stats;
    }

    // --- FOLDERS ---
    subscribeToFolders(callback) {
        if (!this.userId) return;
        this.db.ref(`users/${this.userId}/folders`).on('value', snap => callback(snap.val()));
    }

    async saveFolder(folder) {
        if (!this.userId || !folder.id) return;
        await this.db.ref(`users/${this.userId}/folders/${folder.id}`).set(folder);
    }

    async deleteFolder(folderId) {
        if (!this.userId) return;
        await this.db.ref(`users/${this.userId}/folders/${folderId}`).remove();
    }
}
const db = new WordLabDB();

// --- NAVIGATION ---
// --- NAVIGATION ---
const navTabs = {
    profile: document.getElementById('nav-profile-btn'),
    study: document.getElementById('nav-study-btn'),
    dictionary: document.getElementById('nav-dictionary-btn'),
    import: document.getElementById('nav-import-btn')
};

// Get viewGroupEdit reference
const viewGroupEdit = document.getElementById('view-group-edit');
const groupEditHeader = document.getElementById('group-edit-header');

function updateNavIndicator() {
    const activeTab = document.querySelector('.nav-tab.active');
    const indicator = document.querySelector('.nav-indicator');
    if (activeTab && indicator) {
        indicator.style.width = `${activeTab.offsetWidth}px`;
        indicator.style.height = `${activeTab.offsetHeight}px`;
        indicator.style.left = `${activeTab.offsetLeft}px`;
        indicator.style.top = `${activeTab.offsetTop}px`;
        indicator.style.opacity = '1';
    } else if (indicator) {
        indicator.style.opacity = '0';
    }
}
window.addEventListener('resize', updateNavIndicator);

async function switchView(targetView) {
    if (!targetView) return;

    // Save current view to localStorage (skip transient views)
    const transientViews = ['view-study-session', 'view-exam', 'view-group-edit'];
    if (!transientViews.includes(targetView.id)) {
        localStorage.setItem('lastActiveView', targetView.id);
    }

    // Hide all views
    [viewProfile, viewImport, viewWords, viewStudy, viewStudySession, viewSettings, viewGroupEdit, viewExam].forEach(v => v && v.classList.add('hidden'));
    targetView.classList.remove('hidden');
    targetView.classList.add('fade-in');
    // Remove fade-in after animation to prevent persistent stacking context (fixes mobile filter clipping)
    setTimeout(() => {
        targetView.classList.remove('fade-in');
    }, 500);

    const appContainer = document.querySelector('.app-container');
    // Wide mode for Words, Settings, IMPORT, STUDY, GROUP EDIT, and PROFILE
    // Wide mode for Words, Settings, IMPORT, STUDY, GROUP EDIT, and PROFILE, EXAM
    if (targetView === viewWords || targetView === viewSettings || targetView === viewImport || targetView === viewStudy || targetView === viewGroupEdit || targetView === viewProfile || targetView === viewExam) {
        appContainer.classList.add('wide-mode');
    } else {
        appContainer.classList.remove('wide-mode');
    }

    const globalHeader = document.getElementById('global-header');

    // Header Logic
    if (targetView === viewGroupEdit || targetView === viewExam) {
        if (globalHeader) globalHeader.classList.add('hidden');
        if (groupEditHeader && targetView === viewGroupEdit) {
            groupEditHeader.classList.remove('hidden');
        } else if (groupEditHeader) {
            groupEditHeader.classList.add('hidden');
        }
    } else {
        if (globalHeader) globalHeader.classList.remove('hidden');
        if (groupEditHeader) groupEditHeader.classList.add('hidden');
    }

    // Update Nav Tabs Active State
    Object.values(navTabs).forEach(btn => btn && btn.classList.remove('active'));
    if (navSettingsMobileBtn) navSettingsMobileBtn.classList.remove('active');

    if (targetView === viewStudy || targetView === viewStudySession) {
        if (navTabs.study) navTabs.study.classList.add('active');
    } else if (targetView === viewProfile) {
        if (navTabs.profile) navTabs.profile.classList.add('active');
    } else if (targetView === viewWords) {
        if (navTabs.dictionary) navTabs.dictionary.classList.add('active');
    } else if (targetView === viewImport) {
        if (navTabs.import) navTabs.import.classList.add('active');
    } else if (targetView === viewSettings) {
        if (navSettingsMobileBtn) navSettingsMobileBtn.classList.add('active');
    }

    // Move the liquid glass indicator
    setTimeout(updateNavIndicator, 0);

    // Disable scroll on Study SESSION (cards) view for mobile
    // Keep scroll on Study (mode selector) view
    if (targetView === viewStudySession || targetView === viewExam) {
        document.body.classList.add('no-scroll');
    } else {
        document.body.classList.remove('no-scroll');
        // Stop time tracking when leaving session
        if (window.StudyModule) {
            await window.StudyModule.stopTracking(); // Ensure time is saved to DB
        }
    }

    // Always refresh profile data when entering the profile view
    if (targetView === viewProfile && window.ProfileModule) {
        window.ProfileModule.loadStats();
    }
}

// Export switchView globally for StudyModule
window.switchView = switchView;


// Nav Tab Click Handlers
if (navTabs.profile) navTabs.profile.onclick = () => switchView(viewProfile);
if (navTabs.study) navTabs.study.onclick = () => {
    if (window.StudyModule) {
        window.StudyModule.renderStudyDashboard();
        switchView(viewStudy);
    }
};
if (navTabs.dictionary) navTabs.dictionary.onclick = () => { applyDictionaryFilters(); switchView(viewWords); };
if (navTabs.import) navTabs.import.onclick = () => switchView(viewImport);

// Keep existing secondary navs
if (navHomeBtn) navHomeBtn.onclick = () => {
    if (window.StudyModule) {
        window.StudyModule.renderStudyDashboard();
        switchView(viewStudy);
    }
};
navSettingsBtn.onclick = () => switchView(viewSettings);


// Mobile Settings Button
const navSettingsMobileBtn = document.getElementById('nav-settings-mobile-btn');
if (navSettingsMobileBtn) {
    navSettingsMobileBtn.onclick = () => switchView(viewSettings);
}

// Study functionality is now handled by StudyModule






// --- AUTH ---
let authHandled = false;
let isFirstDataLoad = true;
const loadingScreen = document.getElementById('loading-screen');

firebase.auth().onAuthStateChanged((user) => {
    authHandled = true;
    if (user) {
        // Reset state
        allWordsCache = [];

        // Initialize modules immediately
        if (window.StudyModule) {
            window.StudyModule.init(db, allWordsCache);
        }
        if (window.SettingsModule) {
            window.SettingsModule.init(db);
            window.SettingsModule.loadAvatar(user.uid);
        }
        if (window.ProfileModule) {
            window.ProfileModule.init(db, user, allWordsCache);
        }

        // Prepare dashboard Views (hidden behind loader for now)
        if (dashboardScreen) dashboardScreen.classList.remove('hidden');

        const lastViewId = localStorage.getItem('lastActiveView');
        let targetView = viewStudy;
        if (lastViewId) {
            const savedView = document.getElementById(lastViewId);
            if (savedView) targetView = savedView;
        }
        switchView(targetView);

        // LOAD DATA
        db.subscribeToWords(async (w) => {
            if (!w) {
                allWordsCache = [];
            } else {
                allWordsCache = Object.values(w).sort((a, b) => parseInt(a.id) - parseInt(b.id));

                // --- MIGRATION + TIME DECAY: populate/update is_ideal ---
                const now = Date.now();
                const migrationUpdates = {};
                allWordsCache.forEach(word => {
                    const p = word.progress_global;
                    if (!p) return;
                    if (p.is_ideal === undefined) {
                        // First-time migration:
                        // 1. Active words (10 pts, passed exam) → is_ideal = true (permanent)
                        // 2. Last action was «Отлично» (6) or «Помню» (5) AND nextDate not expired → true
                        // 3. Everything else → false
                        let wasIdeal = false;
                        if (p.isActive) {
                            wasIdeal = true;
                        } else if ((p.lastRating === 5 || p.lastRating === 6) && p.nextDate && p.nextDate > now) {
                            wasIdeal = true;
                        }
                        migrationUpdates[`users/${db.userId}/words/${word.id}/progress_global/is_ideal`] = wasIdeal;
                        p.is_ideal = wasIdeal;
                    } else if (p.is_ideal === true && !p.isActive && p.nextDate && p.nextDate <= now) {
                        // Time-based decay: word is no longer ideal if it's overdue and not Active
                        migrationUpdates[`users/${db.userId}/words/${word.id}/progress_global/is_ideal`] = false;
                        p.is_ideal = false;
                    }
                });
                if (Object.keys(migrationUpdates).length > 0) {
                    try {
                        await db.db.ref().update(migrationUpdates);
                        console.log(`[is_ideal] Updated ${Object.keys(migrationUpdates).length} words`);
                    } catch (e) {
                        console.error('[is_ideal] update error:', e);
                    }
                }
            }

            // Update Module caches
            if (window.StudyModule) window.StudyModule.updateWordsCache(allWordsCache);
            if (window.ProfileModule) window.ProfileModule.updateStats(allWordsCache);

            // Render current view
            if (!viewStudy.classList.contains('hidden') && window.StudyModule) {
                window.StudyModule.renderStudyDashboard();
            } else if (!viewWords.classList.contains('hidden')) {
                applyDictionaryFilters();
            } else if (!viewProfile.classList.contains('hidden') && window.ProfileModule) {
                window.ProfileModule.loadStats();
            }

            // HIDE LOADER on first data load
            if (isFirstDataLoad) {
                isFirstDataLoad = false;
                if (loadingScreen) {
                    loadingScreen.style.opacity = '0';
                    loadingScreen.style.transition = 'opacity 0.4s ease';
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                    }, 400);
                }
            }
        });

    } else {
        // Not logged in - Redirect
        setTimeout(() => {
            if (!firebase.auth().currentUser) {
                if (loadingScreen) loadingScreen.style.display = 'none';
                window.location.href = 'auth.html';
            }
        }, 300);
    }
});

// --- COLUMNS FILTER ---
// Load from localStorage or default
const defaultColumns = {
    id: true,
    active: true,
    is_ideal: true,
    word: true,
    translation: true,
    info1: true,
    info2: true,
    ex1: true,
    ex2: true,
    interval: true,
    folder: true,
    nextDate: true
};
let savedCols = localStorage.getItem('visibleColumns');
const visibleColumns = savedCols ? JSON.parse(savedCols) : defaultColumns;

// Ensure 'is_ideal' column exists in saved settings (migration for existing users)
if (visibleColumns.is_ideal === undefined) {
    visibleColumns.is_ideal = true;
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

// Ensure 'folder' column exists in saved settings (migration for existing users)
if (visibleColumns.folder === undefined) {
    visibleColumns.folder = true;
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

// Ensure 'active' column exists (migration)
if (visibleColumns.active === undefined) {
    visibleColumns.active = true;
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns));
}

// Sync UI with state on load
updateColumnFilterUI();

function toggleColumn(colKey) {
    visibleColumns[colKey] = !visibleColumns[colKey];
    localStorage.setItem('visibleColumns', JSON.stringify(visibleColumns)); // Save
    renderTable(getFilteredWords());
    updateColumnFilterUI();
}

function updateColumnFilterUI() {
    const checkboxes = document.querySelectorAll('#dict-filter-columns-menu input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (visibleColumns[cb.value] !== undefined) {
            cb.checked = visibleColumns[cb.value];
        }
    });
}
// Expose for onclick
window.toggleColumn = toggleColumn;


// Helper to get currently filtered words without re-applying logic if possible, 
// but since we don't cache filtered result separately, we just call applyDictionaryFilters' logic or separate it.
// To keep it simple, we'll extract the filter logic or just use global cache if no filters active. 
// BUT applyDictionaryFilters calls renderTable at the end. 
// A better way: separate 'getFilteredWords' and 'renderTable'.
// For now, let's just re-run applyDictionaryFilters which calls renderTable.
function refreshTable() {
    applyDictionaryFilters();
}

function renderTable(arr) {
    const tableHead = document.querySelector('#words-table thead');
    const dictToolbar = document.querySelector('.dict-toolbar');
    const dictEmptyView = document.getElementById('dict-empty-state-view');
    const dictMainContainer = document.getElementById('dict-main-container');
    const dictTableContainer = document.querySelector('.table-container');

    // Проверяем: словарь полностью пуст или просто поиск ничего не нашёл
    const isDictionaryEmpty = allWordsCache.length === 0;
    const isSearchEmpty = arr.length === 0 && !isDictionaryEmpty;

    if (isDictionaryEmpty) {
        // Словарь полностью пуст - скрываем всё
        if (dictMainContainer) dictMainContainer.classList.add('hidden');
        if (dictToolbar) dictToolbar.classList.add('hidden');
        if (dictEmptyView) {
            dictEmptyView.classList.remove('hidden');
            dictEmptyView.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-state-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                    </div>
                    <div>
                        <h3 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 700;">Здесь пока ничего нет</h3>
                        <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 1.5rem;">Добавьте свое первое слово, чтобы начать обучение</p>
                    </div>
                    <button onclick="window.openEditModal()" class="btn-primary" style="width: auto; padding: 0.8rem 2.5rem; font-weight: 600;">Добавить слово</button>
                </div>
            `;
        }
        return;
    }

    if (isSearchEmpty) {
        // Поиск не дал результатов - показываем сообщение, но оставляем toolbar видимым
        if (dictToolbar) dictToolbar.classList.remove('hidden');
        if (dictMainContainer) {
            dictMainContainer.classList.remove('hidden');
            // Скрываем таблицу, показываем сообщение
            wordsTableBody.innerHTML = '';
            if (tableHead) tableHead.style.display = 'none';
            if (dictTableContainer) dictTableContainer.classList.add('hidden');
        }
        if (dictEmptyView) {
            dictEmptyView.classList.remove('hidden');
            dictEmptyView.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-state-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <path d="m21 21-4.35-4.35"></path>
                            <line x1="11" y1="8" x2="11" y2="14"></line>
                            <line x1="8" y1="11" x2="14" y2="11"></line>
                        </svg>
                    </div>
                    <div>
                        <h3 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 700;">По вашему запросу ничего не найдено</h3>
                        <p style="color: var(--text-muted); font-size: 1rem;">Попробуйте изменить параметры поиска или фильтры</p>
                    </div>
                </div>
            `;
        }
        return;
    }

    // Есть результаты - показываем таблицу
    if (dictToolbar) dictToolbar.classList.remove('hidden');
    if (dictMainContainer) dictMainContainer.classList.remove('hidden');
    if (dictEmptyView) dictEmptyView.classList.add('hidden');
    if (dictTableContainer) dictTableContainer.classList.remove('hidden');

    if (tableHead) tableHead.style.display = '';
    wordsTableBody.innerHTML = '';

    // Update Header Visibility - INDICES MUST MATCH HTML TH ORDER!
    const headRow = document.querySelector('#words-table tr');
    if (headRow) {
        const ths = headRow.querySelectorAll('th');
        // Order in HTML:
        // 0: ID
        // 1: Active
        // 2: is_ideal
        // 3: Word
        // 4: Translation
        // 5: Info1
        // 6: Info2
        // 7: Ex1
        // 8: Ex2
        // 9: Folder
        // 10: Interval
        // 11: NextDate
        if (ths[0]) ths[0].style.display = visibleColumns.id ? '' : 'none';
        if (ths[1]) ths[1].style.display = visibleColumns.active ? '' : 'none';
        if (ths[2]) ths[2].style.display = visibleColumns.is_ideal ? '' : 'none';
        if (ths[3]) ths[3].style.display = visibleColumns.word ? '' : 'none';
        if (ths[4]) ths[4].style.display = visibleColumns.translation ? '' : 'none';

        if (ths[5]) ths[5].style.display = visibleColumns.info1 ? '' : 'none';
        if (ths[6]) ths[6].style.display = visibleColumns.info2 ? '' : 'none';
        if (ths[7]) ths[7].style.display = visibleColumns.ex1 ? '' : 'none';
        if (ths[8]) ths[8].style.display = visibleColumns.ex2 ? '' : 'none';

        if (ths[9]) ths[9].style.display = visibleColumns.folder ? '' : 'none';

        if (ths[10]) ths[10].style.display = visibleColumns.interval ? '' : 'none';
        if (ths[11]) ths[11].style.display = visibleColumns.nextDate ? '' : 'none';
    }

    // --- DUPLICATE DETECTION --
    // Scan all words (not just filtered) to find duplicates in the entire dictionary
    // STRICT RULE: Only column "German word" checked. Exact match using normalized strings.
    const duplicateIds = new Set();
    const wordCounts = {};

    allWordsCache.forEach(w => {
        const key = getDuplicateKey(w.word);
        if (key) {
            if (!wordCounts[key]) wordCounts[key] = [];
            wordCounts[key].push(w.id);
        }
    });

    Object.values(wordCounts).forEach(ids => {
        if (ids.length > 1) ids.forEach(id => duplicateIds.add(String(id)));
    });
    // -------------------------

    arr.forEach(w => {
        const tr = document.createElement('tr');

        // Check for duplicate
        if (duplicateIds.has(String(w.id))) {
            tr.style.backgroundColor = "rgba(255, 235, 59, 0.07)";
        }

        // Check for overdue
        const now = Date.now();
        const nextDate = w.progress_global?.nextDate;
        const isOverdue = nextDate && nextDate <= now;

        // Date Display
        // If overdue or not present, hide instead of showing '-'
        const d = (nextDate && !isOverdue) ? new Date(nextDate).toLocaleDateString() : '';

        // Interval Display
        // If overdue, show '0 дн.'
        // Else use existing logic
        let intervalDisplay;
        if (isOverdue) {
            intervalDisplay = '0 дн.';
        } else {
            const intervalValue = w.progress_global?.interval || 0;
            intervalDisplay = intervalValue === 0 ? '1 час' : `${intervalValue} дн.`;
        }

        // Helper for style
        const displayStyle = (key) => visibleColumns[key] ? '' : 'display: none;';

        // We MUST render all TD elements so nth-child CSS matches. We hide them via style.
        const isActive = w.progress_global && w.progress_global.isActive;
        const score = w.progress_global ? (w.progress_global.excellentStreak || 0) : 0;
        const isIdeal = w.progress_global && w.progress_global.is_ideal;

        let activeDisplay = '';
        if (isActive) {
            // Active word: Show Lightning (Clean fill, no stroke for sharper look)
            activeDisplay = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="var(--secondary)"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>`;
        } else if (score > 0) {
            // Show Score only if > 0
            const color = score >= 9 ? 'var(--accent-bright)' : 'var(--text-main)';
            const scoreFormatted = String(score).replace('.', ',');
            activeDisplay = `<span style="font-size: 0.85rem; font-weight: 600; color: ${color};">${scoreFormatted}</span>`;
        }

        // is_ideal display: star icon for true, empty for false
        // (CSS will add '-' on desktop via :empty::after, and hidden on mobile via :empty)
        const idealDisplay = isIdeal
            ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="var(--secondary)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
            : '';

        tr.innerHTML = `
            <td class="id-cell" style="${displayStyle('id')}">${w.id}</td>
            <td style="${displayStyle('active')}; text-align: center;">${activeDisplay}</td>
            <td style="${displayStyle('is_ideal')}; text-align: center;">${idealDisplay}</td>
            <td style="${displayStyle('word')}"><strong>${w.word}</strong></td>
            <td style="${displayStyle('translation')}" title="${w.translation}"><strong>${w.translation}</strong></td>
            
            <td class="info-cell" style="${displayStyle('info1')}">${w.info1 || ''}</td>
            <td class="info-cell" style="${displayStyle('info2')}">${w.info2 || ''}</td>
            <td class="example-cell" style="${displayStyle('ex1')}">${w.ex1 || ''}</td>
            <td class="example-cell" style="${displayStyle('ex2')}">${w.ex2 || ''}</td>
            
            <td class="folder-cell" style="${displayStyle('folder')}; opacity: 0.6; font-size: 0.75rem; color: var(--text-muted); font-weight: 400; vertical-align: middle; min-width: 100px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${w.folder || ''}">${w.folder || ''}</td>
            
            <td style="${displayStyle('interval')}"><span class="level-badge">${intervalDisplay}</span></td>
            <td class="date-info" style="${displayStyle('nextDate')}">${d}</td>
            
            <td style="text-align:center; padding: 0.5rem 0.2rem; min-width: 60px;">
                <div style="display: inline-flex; align-items: center; justify-content: center;" class="card-mobile-actions">
                    <button class="btn-icon btn-edit" data-id="${w.id}" title="Редактировать">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" data-id="${w.id}" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>`;

        tr.querySelector('.btn-edit').onclick = () => openEditModal(w);
        tr.querySelector('.btn-delete').onclick = async () => {
            if (confirm(`Удалить слово "${w.word}"?`)) {
                await db.deleteWord(w.id);
            }
        };
        wordsTableBody.appendChild(tr);
    });
}
// Need a way to get filtered words in toggleColumn 
// Refactor applyDictionaryFilters to support return only
function getFilteredWords() {
    return applyDictionaryFilters(true);
}
// Open Modal logic has been migrated entirely to edit-word.js

// Auth related event listeners moved to auth.js

if (excelFileInput) {
    excelFileInput.onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const statusElements = [
            document.getElementById('import-status'),
            document.getElementById('import-status-desktop'),
            document.getElementById('import-status-mobile')
        ].filter(el => el);

        statusElements.forEach(el => el.textContent = 'Importing...');

        try {
            const data = await new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = ev => res(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }).Sheets[XLSX.read(new Uint8Array(ev.target.result), { type: 'array' }).SheetNames[0]], { header: 1 }));
                r.onerror = rej; r.readAsArrayBuffer(f);
            });
            const s = await db.processSmartImport(data);
            const msg = `<span style="color: var(--success);">✔ Импорт завершен: Добавлено: ${s.created}, Обновлено: ${s.updated}, Удалено: ${s.deleted}</span>`;
            statusElements.forEach(el => {
                el.innerHTML = msg;
                el.classList.remove('hidden');
            });
        } catch (err) {
            console.error(err);
            statusElements.forEach(el => el.textContent = err.message);
        }
        excelFileInput.value = '';
    };
}

// Settings are now handled by the SettingsModule

// --- DICTIONARY FILTERING ---
const dictSearchInput = document.getElementById('dict-search');

// --- Interval Filter UI ---
const dictFilterIntervalBtn = document.getElementById('dict-filter-interval-btn');
const dictFilterIntervalMenu = document.getElementById('dict-filter-interval-menu');
const dictFilterIntervalLabel = document.getElementById('interval-btn-label');

const dictFilterScoreBtn = document.getElementById('dict-filter-score-btn');
const dictFilterScoreMenu = document.getElementById('dict-filter-score-menu');
const dictFilterScoreLabel = document.getElementById('score-btn-label');


// --- Toggle Menus ---
if (dictFilterIntervalBtn) {
    dictFilterIntervalBtn.onclick = (e) => {
        e.stopPropagation();
        dictFilterIntervalMenu.classList.toggle('hidden');
        if (dictFilterScoreMenu) dictFilterScoreMenu.classList.add('hidden');
        if (dictFilterColumnsMenu) dictFilterColumnsMenu.classList.add('hidden');
        if (dictFilterSortMenu) dictFilterSortMenu.classList.add('hidden');
    };
}

// --- Toggle Score Menu ---
if (dictFilterScoreBtn) {
    dictFilterScoreBtn.onclick = (e) => {
        e.stopPropagation();
        dictFilterScoreMenu.classList.toggle('hidden');
        if (dictFilterIntervalMenu) dictFilterIntervalMenu.classList.add('hidden');
        if (dictFilterColumnsMenu) dictFilterColumnsMenu.classList.add('hidden');
        if (dictFilterSortMenu) dictFilterSortMenu.classList.add('hidden');
    };
}

// --- COLUMNS UI HANDLERS ---
const dictFilterColumnsBtn = document.getElementById('dict-filter-columns-btn');
const dictFilterColumnsMenu = document.getElementById('dict-filter-columns-menu');

if (dictFilterColumnsBtn) {
    dictFilterColumnsBtn.onclick = (e) => {
        e.stopPropagation();
        dictFilterColumnsMenu.classList.toggle('hidden');
        if (dictFilterIntervalMenu) dictFilterIntervalMenu.classList.add('hidden');
        if (dictFilterScoreMenu) dictFilterScoreMenu.classList.add('hidden');
        if (dictFilterSortMenu) dictFilterSortMenu.classList.add('hidden');
    };
}

// --- SORTING UI HANDLERS ---
const dictFilterSortBtn = document.getElementById('dict-filter-sort-btn');
const dictFilterSortMenu = document.getElementById('dict-filter-sort-menu');
const dictFilterSortLabel = document.getElementById('sort-btn-label');
const dictFilterDuplicatesBtn = document.getElementById('dict-filter-duplicates-btn');
let currentSortOrder = localStorage.getItem('dictSortOrder') || 'oldest';
let showOnlyDuplicates = false;

// Update label on init
if (dictFilterSortLabel) updateSortLabel(currentSortOrder);

// Also check the radio button in the menu if it exists
if (dictFilterSortMenu) {
    const radio = dictFilterSortMenu.querySelector(`input[value="${currentSortOrder}"]`);
    if (radio) radio.checked = true;
}

if (dictFilterSortBtn) {
    dictFilterSortBtn.onclick = (e) => {
        e.stopPropagation();
        dictFilterSortMenu.classList.toggle('hidden');
        if (dictFilterIntervalMenu) dictFilterIntervalMenu.classList.add('hidden');
        if (dictFilterScoreMenu) dictFilterScoreMenu.classList.add('hidden');
        if (dictFilterColumnsMenu) dictFilterColumnsMenu.classList.add('hidden');
    };
}

// Global handler for radio buttons in Sort Menu
window.setSortOrder = (order) => {
    currentSortOrder = order;
    localStorage.setItem('dictSortOrder', order);
    applyDictionaryFilters();
    updateSortLabel(order);
    // Close menu slightly delayed for better UX
    setTimeout(() => {
        if (dictFilterSortMenu) dictFilterSortMenu.classList.add('hidden');
    }, 150);
};

function updateSortLabel(order) {
    if (!dictFilterSortLabel) return;
    const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 2px; display: inline-block; vertical-align: middle;"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>`;

    switch (order) {
        case 'newest':
            dictFilterSortLabel.innerHTML = `Новые ${arrowIcon}`;
            break;
        case 'oldest':
            dictFilterSortLabel.innerHTML = `Старые ${arrowIcon}`;
            break;
        case 'alphabet':
            dictFilterSortLabel.textContent = 'А-Я';
            break;
        case 'interval':
            dictFilterSortLabel.innerHTML = `Интервал ${arrowIcon}`;
            break;
        default:
            dictFilterSortLabel.textContent = 'Сортировка';
    }
}

// Table Header Sort Helper
window.sortWords = (col) => {
    if (col === 'interval') {
        setSortOrder('interval');
    } else if (col === 'folder') {
        // Simple folder sort could be added here if needed
    }
};

// Duplicates Filter Handler
window.toggleDuplicatesFilter = () => {
    showOnlyDuplicates = !showOnlyDuplicates;

    if (dictFilterDuplicatesBtn) {
        dictFilterDuplicatesBtn.classList.toggle('filter-active', showOnlyDuplicates);
    }

    applyDictionaryFilters();
};

// Close menus when clicking outside
window.addEventListener('click', (e) => {
    if (dictFilterIntervalMenu && !dictFilterIntervalMenu.classList.contains('hidden')) {
        if (!dictFilterIntervalMenu.contains(e.target) && !dictFilterIntervalBtn.contains(e.target)) {
            dictFilterIntervalMenu.classList.add('hidden');
        }
    }
    if (dictFilterScoreMenu && !dictFilterScoreMenu.classList.contains('hidden')) {
        if (!dictFilterScoreMenu.contains(e.target) && !dictFilterScoreBtn.contains(e.target)) {
            dictFilterScoreMenu.classList.add('hidden');
        }
    }
    if (dictFilterColumnsMenu && !dictFilterColumnsMenu.classList.contains('hidden')) {
        if (!dictFilterColumnsMenu.contains(e.target) && !dictFilterColumnsBtn.contains(e.target)) {
            dictFilterColumnsMenu.classList.add('hidden');
        }
    }
    if (dictFilterSortMenu && !dictFilterSortMenu.classList.contains('hidden')) {
        if (!dictFilterSortMenu.contains(e.target) && !dictFilterSortBtn.contains(e.target)) {
            dictFilterSortMenu.classList.add('hidden');
        }
    }
});

// --- Interval Logic (Event Delegation) ---
// We attach listener to the menu container to catch bubbling events from new/replaced checkboxes
if (dictFilterIntervalMenu) {
    dictFilterIntervalMenu.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            // Logic for mutual exclusivity of 'all' vs others
            const checkboxes = dictFilterIntervalMenu.querySelectorAll('input[type="checkbox"]');

            if (e.target.value === 'all') {
                if (e.target.checked) {
                    // Uncheck all others
                    checkboxes.forEach(c => { if (c !== e.target) c.checked = false; });
                }
            } else {
                // Uncheck 'all' if specific selected
                const allCb = dictFilterIntervalMenu.querySelector('input[value="all"]');
                if (e.target.checked && allCb) allCb.checked = false;
            }
            updateIntervalLabel();
            applyDictionaryFilters();
        }
    });
}

function updateIntervalLabel() {
    if (!dictFilterIntervalMenu) return;
    const checkboxes = dictFilterIntervalMenu.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(c => c.checked);
    if (checked.some(c => c.value === 'all') || checked.length === 0) {
        dictFilterIntervalLabel.textContent = 'Интервалы: Все';
    } else {
        dictFilterIntervalLabel.textContent = `Интервалы: ${checked.length} выбр.`;
    }
}

// --- Score Logic (Event Delegation) ---
if (dictFilterScoreMenu) {
    dictFilterScoreMenu.addEventListener('change', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
            const checkboxes = dictFilterScoreMenu.querySelectorAll('input[type="checkbox"]');
            if (e.target.value === 'all') {
                if (e.target.checked) {
                    checkboxes.forEach(c => { if (c !== e.target) c.checked = false; });
                }
            } else {
                const allCb = dictFilterScoreMenu.querySelector('input[value="all"]');
                if (e.target.checked && allCb) allCb.checked = false;
            }
            updateScoreLabel();
            applyDictionaryFilters();
        }
    });
}

function updateScoreLabel() {
    if (!dictFilterScoreMenu) return;
    const checkboxes = dictFilterScoreMenu.querySelectorAll('input[type="checkbox"]');
    const checked = Array.from(checkboxes).filter(c => c.checked);
    if (checked.some(c => c.value === 'all') || checked.length === 0) {
        dictFilterScoreLabel.textContent = 'Баллы: Все';
    } else {
        dictFilterScoreLabel.textContent = `Баллы: ${checked.length} выбр.`;
    }
}


function applyDictionaryFilters(returnOnly) {
    // If called from event listener, returnOnly is an Event object (truthy). 
    // We must ensure returnOnly is strictly true boolean if we want to return.
    const shouldReturn = returnOnly === true;

    let result = [...allWordsCache];
    let relevanceScores = new Map();

    // 1. Search (Adaptive Fuzzy with Ranking)
    const q = dictSearchInput ? dictSearchInput.value.toLowerCase().trim() : '';
    if (q) {
        const normalize = (str) => (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9äöüßа-яё\s]/g, "");
        const nQ = normalize(q);
        const queryWords = nQ.split(/\s+/).filter(w => w.length > 0);

        if (queryWords.length > 0) {
            result = result.filter(w => {
                const nWord = normalize(w.word);
                const nTr = normalize(w.translation);
                const targetText = normalize(`${w.word} ${w.translation} ${w.info1 || ''} ${w.info2 || ''}`);
                const targetWords = targetText.split(/\s+/).filter(tw => tw.length > 0);

                let totalScore = 0;
                let matchesAll = queryWords.every(qw => {
                    let wordScore = 0;
                    let matched = false;

                    // 1. Exact Word Match (Highest)
                    if (nWord === qw) { wordScore = 1500; matched = true; }
                    // 2. Word starts with query
                    else if (nWord.startsWith(qw)) { wordScore = 800; matched = true; }
                    // 3. Word contains query
                    else if (nWord.includes(qw)) { wordScore = 400; matched = true; }
                    // 4. Exact Translation match
                    else if (nTr === qw) { wordScore = 300; matched = true; }
                    // 5. Translation contains query
                    else if (nTr.includes(qw)) { wordScore = 150; matched = true; }
                    // 6. Other fields substring
                    else if (targetText.includes(qw)) { wordScore = 50; matched = true; }

                    // 7. Fuzzy match (Lowest)
                    if (!matched && qw.length >= 3) {
                        const threshold = qw.length > 6 ? 2 : 1;
                        const fuzzyMatchFound = targetWords.some(tw => {
                            if (Math.abs(tw.length - qw.length) > threshold) return false;
                            const dist = levenshteinDistance(tw, qw);
                            if (dist <= threshold) {
                                wordScore = 20 - dist;
                                return true;
                            }
                            return false;
                        });
                        if (fuzzyMatchFound) matched = true;
                    }

                    if (matched) totalScore += wordScore;
                    return matched;
                });

                if (matchesAll) relevanceScores.set(w.id, totalScore);
                return matchesAll;
            });
        }
    }

    // 2. Interval Filter
    if (dictFilterIntervalMenu) {
        const checkboxes = dictFilterIntervalMenu.querySelectorAll('input[type="checkbox"]');
        const checkedIntervals = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
        const showAllIntervals = checkedIntervals.includes('all') || checkedIntervals.length === 0;

        if (!showAllIntervals) {
            const now = Date.now();
            result = result.filter(w => {
                const intervalValue = w.progress_global ? (w.progress_global.interval || 0) : 0;
                const nextDate = w.progress_global?.nextDate;
                const isOverdue = nextDate && nextDate <= now;

                if (isOverdue || !w.progress_global) {
                    // All due items (New and Overdue) are displayed as "0 дн." in the table.
                    // In the filter menu, "0 дн (Новые)" corresponds to value "new".
                    return checkedIntervals.includes('new');
                }

                // Not due, use the stored interval value. 
                // value "0" in the menu is for "1 час", which is interval 0 and not due.
                return checkedIntervals.includes(String(intervalValue));
            });
        }
    }

    // 3. Score Filter
    if (dictFilterScoreMenu) {
        const checkboxes = dictFilterScoreMenu.querySelectorAll('input[type="checkbox"]');
        const checkedScores = Array.from(checkboxes).filter(c => c.checked).map(c => parseFloat(c.value));
        const showAllScores = checkedScores.includes(NaN) || checkedScores.length === 0; // 'all' is NaN when parseFloat

        if (!showAllScores) {
            result = result.filter(w => {
                const isActive = w.progress_global?.isActive || false;
                const score = w.progress_global ? (w.progress_global.excellentStreak || 0) : 0;

                if (checkedScores.includes(10) && isActive) return true;
                if (!isActive && checkedScores.includes(score)) return true;
                return false;
            });
        }
    }

    // 2.5 Duplicates Filter
    if (showOnlyDuplicates) {
        const duplicateIds = new Set();
        const wordCounts = {};

        // Recalculate duplicates based on STRICT German word rule
        allWordsCache.forEach(w => {
            const key = getDuplicateKey(w.word);
            if (key) {
                if (!wordCounts[key]) wordCounts[key] = [];
                wordCounts[key].push(w.id);
            }
        });

        Object.values(wordCounts).forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicateIds.add(String(id)));
        });

        result = result.filter(w => duplicateIds.has(String(w.id)));
    }

    // 3. Sorting
    if (showOnlyDuplicates) {
        // Grouping Sort: Sort by normalized German word to bring duplicates together

        result.sort((a, b) => {
            const keyA = normalizeGerman(a.word);
            const keyB = normalizeGerman(b.word);

            if (keyA < keyB) return -1;
            if (keyA > keyB) return 1;

            // Secondary sort by ID to ensure stable order
            return parseInt(a.id) - parseInt(b.id);
        });
    } else if (q && relevanceScores.size > 0) {
        // Search Relevance Sort
        result.sort((a, b) => {
            const scoreA = relevanceScores.get(a.id) || 0;
            const scoreB = relevanceScores.get(b.id) || 0;
            if (scoreB !== scoreA) return scoreB - scoreA;
            // Tied relevance: use currentSortOrder
            return applySecondarySort(a, b);
        });
    } else {
        result.sort((a, b) => applySecondarySort(a, b));
    }

    // Helper to apply user-selected sort
    function applySecondarySort(a, b) {
        if (currentSortOrder === 'newest') return parseInt(b.id) - parseInt(a.id);
        if (currentSortOrder === 'oldest') return parseInt(a.id) - parseInt(b.id);
        if (currentSortOrder === 'alphabet') return (a.word || "").localeCompare(b.word || "");
        if (currentSortOrder === 'interval') {
            const now = Date.now();
            const getEff = (w) => {
                if (!w.progress_global) return -1;
                const isOverdue = w.progress_global.nextDate && w.progress_global.nextDate <= now;
                return isOverdue ? 0 : (w.progress_global.interval || 0);
            };
            const effA = getEff(a), effB = getEff(b);
            if (effA !== effB) return effA - effB;
            return parseInt(a.id) - parseInt(b.id);
        }
        return 0;
    }


    if (shouldReturn) return result;
    renderTable(result);
}

// Attach Listeners
if (dictSearchInput) dictSearchInput.addEventListener('input', () => applyDictionaryFilters());

// Load UI state for columns on init
if (savedCols) updateColumnFilterUI();

// Also update Interval UI label on load
updateIntervalLabel();

// --- EXPORT TO EXCEL ---
// --- EXPORT TO EXCEL ---
function exportWordsToExcel() {
    // ALWAYS export ALL words, sorted by ID, regardless of current filters
    const allWords = [...allWordsCache].sort((a, b) => parseInt(a.id) - parseInt(b.id));

    if (!allWords || allWords.length === 0) {
        alert("Нет слов для экспорта.");
        return;
    }

    // Format data for Excel
    // Columns: [ID, Active, Word, Translation, Info1, Info2, Ex1, Ex2, Папка, Идеально]
    const data = allWords.map(w => {
        const pg = w.progress_global;
        let s = pg ? (pg.excellentStreak || 0) : 0;
        // Ensure sync: if Active -> at least 10
        if (pg && pg.isActive && s < 10) s = 10;

        return {
            "ID": w.id,
            "Активные слова": s,
            "Немецкое слово": w.word,
            "Перевод": w.translation,
            "Формы глагола": w.info1,
            "Дополнительно": w.info2,
            "Пример 1": w.ex1,
            "Пример 2": w.ex2,
            "Папка": w.folder || "",
            "Идеально": (pg && pg.is_ideal) ? "true" : "false"
        };
    });

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data);

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dictionary");

    // Generate file name with date
    const date = new Date().toISOString().split('T')[0];
    const fileName = `WordLab_Full_Export_${date}_(${allWords.length}).xlsx`;

    // Save file
    XLSX.writeFile(wb, fileName);
}
// Attach to global scope to call from onclick
window.exportWordsToExcel = exportWordsToExcel;

// --- MOBILE FILTER DRAWER LOGIC ---
const mobileFilterToggle = document.getElementById('dict-mobile-filter-toggle');
const mobileFilterClose = document.getElementById('dict-mobile-filter-close');
const filtersGroup = document.getElementById('dict-filters-group');

if (mobileFilterToggle && filtersGroup) {
    const updateScrollLock = () => {
        if (filtersGroup.classList.contains('show-filters')) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
    };

    // Toggle Drawer
    mobileFilterToggle.onclick = (e) => {
        e.stopPropagation();
        filtersGroup.classList.toggle('show-filters');
        updateScrollLock();
    };

    // Close Button
    if (mobileFilterClose) {
        mobileFilterClose.onclick = (e) => {
            e.stopPropagation();
            filtersGroup.classList.remove('show-filters');
            updateScrollLock();
        };
    }

    // Close when clicking outside
    window.addEventListener('click', (e) => {
        if (filtersGroup.classList.contains('show-filters')) {
            if (!filtersGroup.contains(e.target) && !mobileFilterToggle.contains(e.target)) {
                filtersGroup.classList.remove('show-filters');
                updateScrollLock();
            }
        }
    });
}

// --- HELPERS ---
function levenshteinDistance(s1, s2) {
    if (!s1 || !s2) return Math.max((s1 || "").length, (s2 || "").length);
    const m = s1.length, n = s2.length;
    // Basic dp matrix
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j],    // deletion
                    dp[i][j - 1],    // insertion
                    dp[i - 1][j - 1] // substitution
                ) + 1;
            }
        }
    }
    return dp[m][n];
}