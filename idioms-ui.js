// Idioms UI Module - Handles dictionary tabs, idiom rendering, profile counters, study integration

class IdiomsUI {
    constructor() {
        this.idiomDb = null;
        this.idiomsCache = [];
        this.idiomFoldersCache = [];
        this.activeTab = 'words'; // 'words' or 'idioms'
        this.editingIdiomId = null;
    }

    init(mainDb) {
        this.idiomDb = new IdiomDB(mainDb);
        this.initDictionaryTabs();
        this.initIdiomSubscription();
        this.initEditModal();

        // Migrate legacy IDs to 100001+ range (runs once, safe to call every time)
        this.idiomDb.migrateIdiomIds().then(result => {
            if (result.migrated > 0) {
                console.log(`[IdiomsUI] Migrated ${result.migrated} idiom IDs to 100001+ range`);
            }
        }).catch(err => console.error('[IdiomsUI] ID migration error:', err));
    }

    // --- DATA SUBSCRIPTION ---
    initIdiomSubscription() {
        this.idiomDb.subscribeToIdioms((data) => {
            if (!data) {
                this.idiomsCache = [];
            } else {
                this.idiomsCache = Object.values(data).sort((a, b) => {
                    const numA = parseInt(String(a.id).replace('i_', ''));
                    const numB = parseInt(String(b.id).replace('i_', ''));
                    return numA - numB;
                });
            }

            // Update views if visible
            if (this.activeTab === 'idioms') {
                if (typeof this.applyIdiomFilters === 'function') {
                    this.applyIdiomFilters();
                } else {
                    this.renderIdiomTable(this.idiomsCache); // Fallback
                }
            }

            // Always update dictionary tab counters
            if (window.updateDictionaryTabCounters) {
                window.updateDictionaryTabCounters();
            }

            // Update profile if visible
            const viewProfile = document.getElementById('view-profile');
            if (viewProfile && !viewProfile.classList.contains('hidden') && window.ProfileModule) {
                this.updateProfileCounters();
            }

            // Update study dashboard
            if (window.StudyModule) {
                const viewStudy = document.getElementById('view-study');
                if (viewStudy && !viewStudy.classList.contains('hidden')) {
                    this.renderStudyIdiomCards();
                }
            }
        });

        this.idiomDb.subscribeToIdiomFolders((folders) => {
            this.idiomFoldersCache = folders ? Object.values(folders) : [];
            if (window.StudyModule) {
                const viewStudy = document.getElementById('view-study');
                if (viewStudy && !viewStudy.classList.contains('hidden')) {
                    this.renderStudyIdiomCards();
                }
            }
        });
    }

    // --- DICTIONARY TABS ---
    initDictionaryTabs() {
        const tabWords = document.getElementById('dict-tab-words');
        const tabIdioms = document.getElementById('dict-tab-idioms');

        if (tabWords) {
            tabWords.onclick = () => this.switchDictTab('words');
        }
        if (tabIdioms) {
            tabIdioms.onclick = () => this.switchDictTab('idioms');
        }
    }

    switchDictTab(tab) {
        this.activeTab = tab;

        const tabWords = document.getElementById('dict-tab-words');
        const tabIdioms = document.getElementById('dict-tab-idioms');
        const wordsTableContainer = document.querySelector('.table-container.wide-table');
        const idiomsTableContainer = document.getElementById('idioms-table-container');
        const dictEmptyView = document.getElementById('dict-empty-state-view');
        const addWordBtn = document.querySelector('.dict-actions button[onclick*="openEditModal"]');
        const addIdiomBtn = document.getElementById('btn-add-idiom');
        const exportWordsBtn = document.querySelector('.dict-actions .btn-export');
        const exportIdiomsBtn = document.getElementById('btn-export-idioms');
        const dictFilterScoreBtn = document.getElementById('dict-filter-score-btn');
        const dictFilterColumnsBtn = document.getElementById('dict-filter-columns-btn');

        // Update tab active states
        if (tabWords) tabWords.classList.toggle('active', tab === 'words');
        if (tabIdioms) tabIdioms.classList.toggle('active', tab === 'idioms');

        if (tab === 'words') {
            if (wordsTableContainer) wordsTableContainer.classList.remove('hidden');
            if (idiomsTableContainer) idiomsTableContainer.classList.add('hidden');
            if (addWordBtn) addWordBtn.style.display = '';
            if (addIdiomBtn) addIdiomBtn.style.display = 'none';
            if (exportWordsBtn) exportWordsBtn.style.display = '';
            if (exportIdiomsBtn) exportIdiomsBtn.style.display = 'none';
            if (dictFilterScoreBtn) {
                const wrapper = dictFilterScoreBtn.closest('.filter-group-wrapper');
                if (wrapper) wrapper.style.removeProperty('display');
                else dictFilterScoreBtn.style.removeProperty('display');
            }
            if (dictFilterColumnsBtn) dictFilterColumnsBtn.style.display = '';
            if (dictEmptyView) dictEmptyView.classList.add('hidden');
            // Refresh words table
            if (window.applyDictionaryFilters) window.applyDictionaryFilters();
        } else {
            if (wordsTableContainer) wordsTableContainer.classList.add('hidden');
            if (idiomsTableContainer) idiomsTableContainer.classList.remove('hidden');
            if (addWordBtn) addWordBtn.style.display = 'none';
            if (addIdiomBtn) addIdiomBtn.style.display = '';
            if (exportWordsBtn) exportWordsBtn.style.display = 'none';
            if (exportIdiomsBtn) exportIdiomsBtn.style.display = '';
            if (dictFilterScoreBtn) {
                const wrapper = dictFilterScoreBtn.closest('.filter-group-wrapper');
                if (wrapper) wrapper.style.setProperty('display', 'none', 'important');
                else dictFilterScoreBtn.style.setProperty('display', 'none', 'important');
            }
            if (dictFilterColumnsBtn) dictFilterColumnsBtn.style.display = '';
            if (dictEmptyView) dictEmptyView.classList.add('hidden');
            // Render idioms table
            this.applyIdiomFilters();
        }
    }

    applyIdiomFilters(returnOnly) {
        let result = [...this.idiomsCache];

        // 1. Search
        const dictSearchInput = document.getElementById('dict-search');
        const q = dictSearchInput ? dictSearchInput.value.toLowerCase().trim() : '';

        if (q) {
            result = result.filter(idiom => {
                const searchable = `${idiom.idiom} ${idiom.translation} ${idiom.meaning || ''} ${idiom.info || ''} ${idiom.example || ''}`.toLowerCase();
                return searchable.includes(q);
            });
        }

        // 2. Interval Filter
        const dictFilterIntervalMenu = document.getElementById('dict-filter-interval-menu');
        if (dictFilterIntervalMenu) {
            const checkboxes = dictFilterIntervalMenu.querySelectorAll('input[type="checkbox"]');
            const checkedIntervals = Array.from(checkboxes).filter(c => c.checked).map(c => c.value);
            const showAllIntervals = checkedIntervals.includes('all') || checkedIntervals.length === 0;

            if (!showAllIntervals) {
                const now = Date.now();
                result = result.filter(i => {
                    const intervalValue = i.progress_global ? (i.progress_global.interval || 0) : 0;
                    const nextDate = i.progress_global?.nextDate;
                    const isOverdue = nextDate && nextDate <= now;

                    if (isOverdue || !i.progress_global) {
                        return checkedIntervals.includes('new');
                    }
                    return checkedIntervals.includes(String(intervalValue));
                });
            }
        }

        // 3. Duplicates Filter
        // We will read toggle active class to know if duplicates filter is enabled
        const dictFilterDuplicatesBtn = document.getElementById('dict-filter-duplicates-btn');
        const showOnlyDuplicates = dictFilterDuplicatesBtn ? dictFilterDuplicatesBtn.classList.contains('filter-active') : false;
        
        if (showOnlyDuplicates) {
            const duplicateIds = new Set();
            const counts = {};
            this.idiomsCache.forEach(i => {
                const key = window.getDuplicateKey ? window.getDuplicateKey(i.idiom || '') : (i.idiom || '').toLowerCase().replace(/[^a-zäöüßа-яё]/g, '');
                if (key) {
                    if (!counts[key]) counts[key] = [];
                    counts[key].push(i.id);
                }
            });
            Object.values(counts).forEach(ids => {
                if (ids.length > 1) ids.forEach(id => duplicateIds.add(String(id)));
            });
            result = result.filter(i => duplicateIds.has(String(i.id)));
        }

        // 4. Sorting
        const currentSortOrder = localStorage.getItem('dictSortOrder') || window.currentSortOrder || 'oldest';
        
        if (showOnlyDuplicates) {
            // Group duplicates together
            result.sort((a, b) => {
                const keyA = window.normalizeGerman ? window.normalizeGerman(a.idiom) : (a.idiom||"").toLowerCase();
                const keyB = window.normalizeGerman ? window.normalizeGerman(b.idiom) : (b.idiom||"").toLowerCase();
                if (keyA < keyB) return -1;
                if (keyA > keyB) return 1;
                return parseInt(String(a.id).replace('i_', '')) - parseInt(String(b.id).replace('i_', ''));
            });
        } else {
            result.sort((a, b) => {
                const idA = parseInt(String(a.id).replace('i_', ''));
                const idB = parseInt(String(b.id).replace('i_', ''));

                if (currentSortOrder === 'newest') return idB - idA;
                if (currentSortOrder === 'oldest') return idA - idB;
                if (currentSortOrder === 'alphabet') return (a.idiom || "").localeCompare(b.idiom || "");
                if (currentSortOrder === 'interval') {
                    const now = Date.now();
                    const getEff = (i) => {
                        if (!i.progress_global) return -1;
                        const isOverdue = i.progress_global.nextDate && i.progress_global.nextDate <= now;
                        return isOverdue ? 0 : (i.progress_global.interval || 0);
                    };
                    const effA = getEff(a), effB = getEff(b);
                    if (effA !== effB) return effA - effB;
                    return idA - idB;
                }
                if (currentSortOrder === 'date_asc') {
                    const dA = a.progress_global?.nextDate || 0;
                    const dB = b.progress_global?.nextDate || 0;
                    if (dA !== dB) return dA - dB;
                    return idA - idB;
                }
                if (currentSortOrder === 'date_desc') {
                    const dA = a.progress_global?.nextDate || 0;
                    const dB = b.progress_global?.nextDate || 0;
                    if (dA !== dB) return dB - dA;
                    return idB - idA;
                }
                return 0; // default for unknown sorts
            });
        }

        const countEl = document.getElementById('mobile-filter-results-count');
        if (countEl && this.activeTab === 'idioms') {
            countEl.textContent = `Найдено: ${result.length}`;
        }

        // Return if it's called just to compute
        if (returnOnly === true) return result;
        
        this.renderIdiomTable(result);

        // Always update dictionary tab counters when filters change
        if (window.updateDictionaryTabCounters) {
            window.updateDictionaryTabCounters();
        }
    }

    renderIdiomTable(arr) {
        const container = document.getElementById('idioms-table-container');
        const dictEmptyView = document.getElementById('dict-empty-state-view');
        if (!container) return;

        const hasWordsInDB = window.AppDB && window.AppDB.allWordsCache && window.AppDB.allWordsCache.length > 0;
        const isIdiomsEmpty = this.idiomsCache.length === 0;
        const isTotalDatabaseEmpty = !isIdiomsEmpty ? false : (hasWordsInDB ? false : true);
        
        const isSearchEmpty = arr.length === 0 && !isIdiomsEmpty;

        if (isTotalDatabaseEmpty) {
            container.classList.add('hidden');
            if (dictEmptyView) {
                dictEmptyView.classList.remove('hidden');
                dictEmptyView.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                        </div>
                        <div>
                            <h3 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 700;">Здесь пока ничего нет</h3>
                            <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 1.5rem;">Добавьте свое первое слово или идиому, чтобы начать обучение</p>
                        </div>
                        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                            <button onclick="window.openEditModal()" class="btn-primary" style="width: auto; padding: 0.8rem 2.5rem; font-weight: 600;">Добавить слово</button>
                            <button onclick="window.IdiomsUI.openIdiomEditModal()" class="btn-secondary" style="width: auto; padding: 0.8rem 2.5rem; font-weight: 600; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">Добавить идиому</button>
                        </div>
                    </div>
                `;
            }
            return;
        }

        // If not total empty, ensure empty view is hidden if it was showing the 'Total Empty' state
        if (dictEmptyView && !isSearchEmpty) {
             dictEmptyView.classList.add('hidden');
        }

        const dictSearchInput = document.getElementById('dict-search');
        const dictFilterIntervalMenu = document.getElementById('dict-filter-interval-menu');
        const dictFilterDuplicatesBtn = document.getElementById('dict-filter-duplicates-btn');

        const isSearchActive = dictSearchInput && dictSearchInput.value.trim() !== '';
        // Note: Idioms currently don't use score filter in UI, but share interval and duplicates
        const isIntervalActive = dictFilterIntervalMenu && Array.from(dictFilterIntervalMenu.querySelectorAll('input[type="checkbox"]')).some(c => c.checked && c.value !== 'all');
        const isDuplicateActive = dictFilterDuplicatesBtn && dictFilterDuplicatesBtn.classList.contains('filter-active');

        const hasAnyFilterActive = isSearchActive || isIntervalActive || isDuplicateActive;

        if (isSearchEmpty && hasAnyFilterActive) {
            container.classList.add('hidden');
            if (dictEmptyView) {
                dictEmptyView.classList.remove('hidden');
                dictEmptyView.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
                        </div>
                        <div>
                            <h3 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 700;">По вашему запросу ничего не найдено</h3>
                            <p style="color: var(--text-muted); font-size: 1rem;">Попробуйте изменить параметры поиска</p>
                        </div>
                    </div>
                `;
            }
            return;
        }

        container.classList.remove('hidden');
        if (dictEmptyView) dictEmptyView.classList.add('hidden');

        const tbody = document.getElementById('idioms-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Update table headers visibility
        const tableHead = document.querySelector('#idioms-table thead');
        if (tableHead && window.visibleIdiomColumns) {
            const ths = tableHead.querySelectorAll('th');
            if (ths[0]) ths[0].style.display = window.visibleIdiomColumns.id ? '' : 'none';
            if (ths[1]) ths[1].style.display = window.visibleIdiomColumns.ideal ? '' : 'none';
            if (ths[2]) ths[2].style.display = window.visibleIdiomColumns.idiom ? '' : 'none';
            if (ths[3]) ths[3].style.display = window.visibleIdiomColumns.translation ? '' : 'none';
            if (ths[4]) ths[4].style.display = window.visibleIdiomColumns.meaning ? '' : 'none';
            if (ths[5]) ths[5].style.display = window.visibleIdiomColumns.info ? '' : 'none';
            if (ths[6]) ths[6].style.display = window.visibleIdiomColumns.example ? '' : 'none';
            if (ths[7]) ths[7].style.display = window.visibleIdiomColumns.folder ? '' : 'none';
            if (ths[8]) ths[8].style.display = window.visibleIdiomColumns.interval ? '' : 'none';
            if (ths[9]) ths[9].style.display = window.visibleIdiomColumns.nextDate ? '' : 'none';
        }

        const displayStyle = (key) => window.visibleIdiomColumns && window.visibleIdiomColumns[key] ? '' : (window.visibleIdiomColumns ? 'display: none;' : '');

        // --- DUPLICATE HIGHLIGHT ---
        const duplicateIds = new Set();
        const counts = {};
        this.idiomsCache.forEach(i => {
            const key = window.getDuplicateKey ? window.getDuplicateKey(i.idiom || '') : (i.idiom || '').toLowerCase().replace(/[^a-zäöüßа-яё]/g, '');
            if (key) {
                if (!counts[key]) counts[key] = [];
                counts[key].push(i.id);
            }
        });
        Object.values(counts).forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicateIds.add(String(id)));
        });
        // -------------------------

        arr.forEach((idiom, index) => {
            const tr = document.createElement('tr');
            tr.id = `idiom-row-${idiom.id}`;
            
            if (duplicateIds.has(String(idiom.id))) {
                tr.style.backgroundColor = "rgba(255, 235, 59, 0.07)";
            }

            const pg = idiom.progress_global || {};
            const isIdeal = pg.is_ideal;
            const now = Date.now();
            const nextDate = pg.nextDate;
            const isOverdue = nextDate && nextDate <= now;

            // Interval display
            let intervalDisplay;
            const val = pg.interval || 0;
            if (val < 1) {
                intervalDisplay = `${Math.round(val * 24)} час.`;
            } else {
                const displayVal = Number.isInteger(val) ? val : parseFloat(val.toFixed(1));
                intervalDisplay = `${displayVal} дн.`;
            }

            const d = (nextDate && !isOverdue) ? new Date(nextDate).toLocaleDateString() : '-';

            const idealDisplay = isIdeal
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="var(--secondary)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
                : '';

            tr.innerHTML = `
                <td class="id-cell" style="${displayStyle('id')}">${this.idiomsCache.indexOf(idiom) + 1}</td>
                <td class="idiom-ideal-cell" style="${displayStyle('ideal')}">${idealDisplay}</td>
                <td class="idiom-text-cell" style="${displayStyle('idiom')}"><strong>${idiom.idiom || ''}</strong></td>
                <td class="idiom-translation-cell" style="${displayStyle('translation')}"><strong>${idiom.translation || ''}</strong></td>
                <td class="idiom-meaning-cell" style="${displayStyle('meaning')}">${idiom.meaning || ''}</td>
                <td class="idiom-info-cell" style="${displayStyle('info')}">${idiom.info || ''}</td>
                <td class="idiom-example-cell" style="${displayStyle('example')}">${idiom.example || ''}</td>
                <td class="idiom-folder-cell" style="${displayStyle('folder')}" title="${idiom.folder || ''}">${idiom.folder || ''}</td>
                <td class="idiom-interval-cell" style="${displayStyle('interval')}"><span class="level-badge">${intervalDisplay}</span></td>
                <td class="idiom-date-cell" style="${displayStyle('nextDate')}">${d}</td>
                <td class="idiom-freq-cell"></td>
                <td class="idiom-actions-cell">
                    <button class="btn-icon btn-edit-idiom" data-id="${idiom.id}" title="Редактировать">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete-idiom" data-id="${idiom.id}" title="Удалить">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                    </button>
                </td>`;

            tr.querySelector('.btn-edit-idiom').onclick = (e) => {
                e.stopPropagation();
                this.openIdiomEditModal(idiom);
            };
            tr.querySelector('.btn-delete-idiom').onclick = async (e) => {
                e.stopPropagation();
                alert('Delete idiom clicked: ' + idiom.id);
                if (confirm(`Удалить идиому "${idiom.idiom}"?`)) {
                    await this.idiomDb.deleteIdiom(idiom.id);
                }
            };

            tbody.appendChild(tr);
        });

        // Update mobile count
        const countEl = document.getElementById('mobile-filter-results-count');
        if (countEl && this.activeTab === 'idioms') {
            countEl.textContent = `Найдено: ${arr.length}`;
        }
    }

    // --- IDIOM EDIT MODAL ---
    initEditModal() {
        const form = document.getElementById('idiom-edit-form');
        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();
            await this.saveIdiomFromModal();
        };

        const btnExit = document.getElementById('btn-exit-idiom-edit');
        if (btnExit) {
            btnExit.onclick = () => this.closeIdiomEditModal();
        }

        const btnSaveHeader = document.getElementById('btn-save-idiom-edit-header');
        if (btnSaveHeader) {
            btnSaveHeader.onclick = async (e) => {
                e.preventDefault();
                await this.saveIdiomFromModal();
            };
        }

        // Auto-resize textareas on input
        const editView = document.getElementById('view-idiom-edit');
        if (editView) {
            editView.querySelectorAll('textarea.edit-word-input').forEach(ta => {
                ta.addEventListener('input', () => {
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                });
            });
        }
    }

    openIdiomEditModal(idiom) {
        const viewWordEdit = document.getElementById('view-idiom-edit');
        if (!viewWordEdit) return;

        const titleEl = document.getElementById('idiom-edit-title-text');
        const idEl = document.getElementById('idiom-edit-id-text');

        if (idiom) {
            this.editingIdiomId = idiom.id;
            if (titleEl) titleEl.textContent = 'Редактировать';
            if (idEl) idEl.textContent = `#${idiom.id}`;

            document.getElementById('ie-idiom').value = idiom.idiom || '';
            document.getElementById('ie-translation').value = idiom.translation || '';
            document.getElementById('ie-meaning').value = idiom.meaning || '';
            document.getElementById('ie-info').value = idiom.info || '';
            document.getElementById('ie-example').value = idiom.example || '';
            document.getElementById('ie-folder').value = idiom.folder || '';
        } else {
            this.editingIdiomId = null;
            if (titleEl) titleEl.textContent = 'Новая идиома';
            if (idEl) idEl.textContent = '';

            document.getElementById('ie-idiom').value = '';
            document.getElementById('ie-translation').value = '';
            document.getElementById('ie-meaning').value = '';
            document.getElementById('ie-info').value = '';
            document.getElementById('ie-example').value = '';
            document.getElementById('ie-folder').value = '';
        }

        // Show the edit view
        const allViews = document.querySelectorAll('.view-section');
        allViews.forEach(v => v.classList.add('hidden'));
        viewWordEdit.classList.remove('hidden');

        const globalHeader = document.getElementById('global-header');
        if (globalHeader) globalHeader.classList.add('hidden');

        // Auto-resize all textareas after content is set
        setTimeout(() => {
            viewWordEdit.querySelectorAll('textarea.edit-word-input').forEach(ta => {
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
            });
        }, 0);
    }

    closeIdiomEditModal() {
        const viewIdiomEdit = document.getElementById('view-idiom-edit');
        if (viewIdiomEdit) viewIdiomEdit.classList.add('hidden');

        // Return to dictionary view
        const viewWords = document.getElementById('view-words');
        if (viewWords) viewWords.classList.remove('hidden');

        const globalHeader = document.getElementById('global-header');
        if (globalHeader) globalHeader.classList.remove('hidden');

        this.switchDictTab('idioms');
    }

    async saveIdiomFromModal() {
        const idiomText = document.getElementById('ie-idiom').value.trim();
        const translation = document.getElementById('ie-translation').value.trim();
        const meaning = document.getElementById('ie-meaning').value.trim();
        const info = document.getElementById('ie-info').value.trim();
        const example = document.getElementById('ie-example').value.trim();
        const folder = document.getElementById('ie-folder').value.trim();

        if (!idiomText || !translation) {
            alert('Заполните идиому и перевод.');
            return;
        }

        if (this.editingIdiomId) {
            // Update
            await this.idiomDb.updateIdiom(this.editingIdiomId, {
                idiom: idiomText,
                translation: translation,
                meaning: meaning,
                info: info,
                example: example,
                folder: folder
            });
        } else {
            // Create
            const newId = this.idiomDb.getNextIdiomId(this.idiomsCache);
            const newIdiom = {
                id: newId,
                idiom: idiomText,
                translation: translation,
                meaning: meaning,
                info: info,
                example: example,
                folder: folder || 'Папка идиом 1',
                progress_global: {
                    interval: 0,
                    nextDate: Date.now(),
                    state: 'new',
                    is_ideal: false
                }
            };
            await this.idiomDb.saveIdiom(newIdiom);
        }

        this.closeIdiomEditModal();
    }

    // --- PROFILE COUNTERS ---
    updateProfileCounters() {
        const container = document.querySelector('.stats-grid-container');
        if (!container) return;

        // Remove old idiom stats if they exist
        const oldIdiomStats = document.getElementById('idiom-stats-row');
        if (oldIdiomStats) oldIdiomStats.remove();

        const totalIdioms = this.idiomsCache.length;
        let idealIdioms = 0;
        this.idiomsCache.forEach(idiom => {
            const p = idiom.progress_global;
            if (p && p.is_ideal) idealIdioms++;
        });

        // Create idiom stats row
        const row = document.createElement('div');
        row.id = 'idiom-stats-row';
        row.className = 'stats-grid-container';
        row.style.marginTop = '0.75rem';
        row.innerHTML = `
            <div class="stat-box">
                <div class="stat-value" style="color: var(--primary);">${totalIdioms}</div>
                <div class="stat-label" style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary); opacity: 0.8;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    Идиомы
                </div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${idealIdioms}</div>
                <div class="stat-label" style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--secondary); opacity: 0.8;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    Идеально (идиомы)
                </div>
            </div>
        `;

        container.parentNode.insertBefore(row, container.nextSibling);
    }

    // --- STUDY DASHBOARD INTEGRATION ---
    renderStudyIdiomCards() {
        // "Все идиомы" card
        const totalEl = document.getElementById('idiom-dash-total');
        const dueEl = document.getElementById('idiom-dash-due');
        const allIdiomsCard = document.getElementById('all-idioms-card');

        if (!allIdiomsCard) return;

        if (this.idiomsCache.length === 0) {
            allIdiomsCard.style.display = 'none';
            return;
        }

        allIdiomsCard.style.display = '';

        const now = Date.now();
        const startOfToday = (window.DateUtils && window.DateUtils.getLogicalDayStart) ? window.DateUtils.getLogicalDayStart() : now - 24*3600*1000;
        
        const dueIdioms = this.idiomsCache.filter(idiom => {
            const pg = idiom.progress_global;
            if (!pg) return true;
            // Count as due if not active AND (has no date OR date is past OR interval is 0/new)
            return !pg.isActive && (!pg.nextDate || pg.nextDate <= now || pg.interval === 0);
        });

        const learnedToday = this.idiomsCache.filter(idiom => {
            const pg = idiom.progress_global;
            return pg && pg.lastReviewed && pg.lastReviewed >= startOfToday;
        }).length;

        if (totalEl) totalEl.textContent = this.idiomsCache.length;
        if (dueEl) dueEl.textContent = dueIdioms.length;
        
        // Find or create learned today element if it exists in the UI (optional sync)
        const learnedEl = allIdiomsCard.querySelector('.stat-learned-today'); // Assuming selector if I adjust template
        if (learnedEl) learnedEl.textContent = learnedToday;

        // Bind click to the whole card
        allIdiomsCard.style.cursor = 'pointer';
        allIdiomsCard.onclick = () => this.startIdiomSession('__all__');

        // Render idiom folders
        this.renderIdiomFolders();
    }

    renderIdiomFolders() {
        const container = document.getElementById('idiom-folders-list');
        if (!container) return;

        // Get unique idiom folders from idioms data
        const folderMap = {};
        this.idiomsCache.forEach(idiom => {
            const folder = idiom.folder || 'Без папки';
            if (!folderMap[folder]) folderMap[folder] = [];
            folderMap[folder].push(idiom);
        });

        const folderNames = Object.keys(folderMap).sort();

        if (folderNames.length === 0) {
            container.innerHTML = '';
            return;
        }

        const now = Date.now();
        const startOfToday = (window.DateUtils && window.DateUtils.getLogicalDayStart) ? window.DateUtils.getLogicalDayStart() : now - 24*3600*1000;

        container.innerHTML = folderNames.map(name => {
            const idioms = folderMap[name];
            const total = idioms.length;
            const due = idioms.filter(i => {
                const pg = i.progress_global;
                return !pg || (!pg.isActive && (!pg.nextDate || pg.nextDate <= now || pg.interval === 0));
            }).length;
            
            const learnedToday = idioms.filter(i => {
                const pg = i.progress_global;
                return pg && pg.lastReviewed && pg.lastReviewed >= startOfToday;
            }).length;

            const ideal = idioms.filter(i => i.progress_global?.is_ideal).length;
            const progressPct = total === 0 ? 0 : Math.round((ideal / total) * 100);

            return `
                <div class="group-card idiom-folder-card ${due === 0 ? 'completed' : ''}" data-folder="${name}" style="cursor: pointer;">
                    <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; position: relative;">
                        <!-- Header -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                            <div style="flex: 1; min-width: 0; padding-right: 1rem;">
                                <h3 style="margin: 0; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${name}">${name}</h3>
                                <div style="font-size: 0.8rem; color: var(--text-muted); opacity: 0.6; margin-top:0.2rem;">Папка идиом</div>
                            </div>
                            <button class="btn-icon btn-edit-folder" style="color: var(--text-muted); padding: 0.5rem;" title="Редактировать папку">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="8" y1="6" x2="21" y2="6"></line>
                                    <line x1="8" y1="12" x2="21" y2="12"></line>
                                    <line x1="8" y1="18" x2="21" y2="18"></line>
                                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        
                        <!-- Stats Grid -->
                        <div class="group-stats-grid">
                            <div class="group-stat-item">
                                <div class="group-stat-value" style="color: var(--text-main);">${total}</div>
                                <div class="group-stat-label">Всего</div>
                            </div>
                            <div class="group-stat-item">
                                <div class="group-stat-value" style="color: ${due > 0 ? 'var(--accent-2)' : 'rgba(255,255,255,0.3)'};">${due}</div>
                                <div class="group-stat-label">К повтору</div>
                            </div>
                            <div class="group-stat-item">
                                <div class="group-stat-value" style="color: ${learnedToday > 0 ? 'var(--secondary)' : 'rgba(255,255,255,0.3)'};">${learnedToday}</div>
                                <div class="group-stat-label">Пройдено</div>
                            </div>
                        </div>
                        
                        <!-- Progress Bar -->
                        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 0.75rem; color: var(--text-muted);">Прогресс</span>
                                <span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary);">${progressPct}%</span>
                            </div>
                            <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                                <div style="height: 100%; width: ${progressPct}%; background: linear-gradient(90deg, var(--secondary), var(--accent-bright)); border-radius: 3px; transition: width 0.3s ease;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind click handlers
        container.querySelectorAll('.idiom-folder-start').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const folder = btn.dataset.folder;
                this.startIdiomSession(folder);
            };
        });

        container.querySelectorAll('.idiom-folder-card').forEach(card => {
            card.onclick = () => {
                const folder = card.dataset.folder;
                this.startIdiomSession(folder);
            };

            const btnEdit = card.querySelector('.btn-edit-folder');
            if (btnEdit) {
                btnEdit.onclick = (e) => {
                    e.stopPropagation();
                    const folder = card.dataset.folder;
                    if (window.StudyModule) window.StudyModule.openFolderEditor(folder);
                };
            }
        });
    }

    // --- IDIOM STUDY SESSION ---
    startIdiomSession(folderName) {
        // Save Last Opened Context
        const meta = {
            mode: folderName === '__all__' ? 'idiom_global' : 'idiom_folder',
            groupIndex: folderName,
            timestamp: Date.now(),
            isIdiom: true
        };
        localStorage.setItem('last_opened_session', JSON.stringify(meta));

        const now = Date.now();
        const savedKey = `study_session_${meta.mode}_${folderName}`;
        let sessionData = null;
        const savedData = localStorage.getItem(savedKey);

        if (savedData) {
            try {
                const state = JSON.parse(savedData);
                const queue = state.queueIds
                    .map(id => this.idiomsCache.find(i => i.id === id))
                    .filter(i => !!i);

                if (queue.length > 0 && state.currentIndex < queue.length) {
                    sessionData = {
                        queue: queue,
                        currentIndex: state.currentIndex
                    };
                }
            } catch (e) {
                console.error("Failed to restore idiom session", e);
            }
        }

        let sessionIdioms = [];
        let startIndex = 0;

        if (sessionData) {
            sessionIdioms = sessionData.queue;
            startIndex = sessionData.currentIndex;
        } else {
            if (folderName === '__all__') {
                sessionIdioms = this.idiomsCache.filter(i => {
                    const pg = i.progress_global;
                    return !pg || !pg.nextDate || pg.nextDate <= now;
                });
            } else {
                sessionIdioms = this.idiomsCache.filter(i => {
                    if (i.folder !== folderName) return false;
                    const pg = i.progress_global;
                    return !pg || !pg.nextDate || pg.nextDate <= now;
                });
            }

            if (sessionIdioms.length === 0) {
                alert('Нет идиом для повторения в этой папке.');
                return;
            }

            // Shuffle
            for (let i = sessionIdioms.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [sessionIdioms[i], sessionIdioms[j]] = [sessionIdioms[j], sessionIdioms[i]];
            }
        }

        if (sessionIdioms.length === 0) {
            alert('Нет идиом для повторения в этой папке.');
            return;
        }

        // Shuffle
        for (let i = sessionIdioms.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [sessionIdioms[i], sessionIdioms[j]] = [sessionIdioms[j], sessionIdioms[i]];
        }

        // Use the existing study session for idioms
        if (window.StudyModule) {
            // Map idioms to word-like format for the session engine
            const mappedWords = sessionIdioms.map(idiom => ({
                id: idiom.id,
                word: idiom.idiom,
                translation: idiom.translation,
                info1: idiom.meaning || '',
                info2: idiom.info || '',
                ex1: idiom.example || '',
                ex2: '',
                folder: idiom.folder,
                progress_global: idiom.progress_global || { interval: 0, nextDate: Date.now(), state: 'new', is_ideal: false, excellentStreak: 0 },
                _isIdiom: true // internal marker
            }));

            // Store original idiom session data
            window.StudyModule._idiomSession = true;
            window.StudyModule._idiomDbRef = this.idiomDb;

            const sessionTitle = folderName === '__all__' ? 'Все идиомы' : folderName;
            
            // Start session using StudyModule engine
            window.StudyModule.currentSession = {
                mode: folderName === '__all__' ? 'idiom_global' : 'idiom_folder',
                groupIndex: folderName,
                key: 'progress_global',
                queue: mappedWords,
                currentIndex: startIndex,
                currentWord: null,
                history: []
            };

            if (window.StudyModule.sessionGroupTitle) {
                window.StudyModule.sessionGroupTitle.textContent = sessionTitle;
            }

            window.StudyModule.updateStatsUI(mappedWords);

            if (window.switchView) window.switchView(window.StudyModule.viewStudySession);
            
            window.StudyModule.startTracking();
            window.StudyModule.showNextCard();
        }
    }

    // --- EXPORT ---
    exportIdioms() {
        this.idiomDb.exportIdiomsToExcel(this.idiomsCache);
    }
}

window.IdiomsUI = new IdiomsUI();

// --- COLUMNS TOGGLE FOR IDIOMS ---
window.visibleIdiomColumns = JSON.parse(localStorage.getItem('visibleIdiomColumns')) || {
    id: true, ideal: true, idiom: true, translation: true, 
    meaning: true, info: true, example: true, folder: true, interval: true, nextDate: true
};

window.toggleIdiomColumn = function(colKey) {
    window.visibleIdiomColumns[colKey] = !window.visibleIdiomColumns[colKey];
    localStorage.setItem('visibleIdiomColumns', JSON.stringify(window.visibleIdiomColumns));
    
    // Update checkboxes UI
    const checkboxes = document.querySelectorAll('#dict-filter-idioms-columns-menu input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (window.visibleIdiomColumns[cb.value] !== undefined) {
            cb.checked = window.visibleIdiomColumns[cb.value];
        }
    });

    if (window.IdiomsUI) {
        window.IdiomsUI.applyIdiomFilters();
    }
};

// Sync UI on load
setTimeout(() => {
    const checkboxes = document.querySelectorAll('#dict-filter-idioms-columns-menu input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (window.visibleIdiomColumns[cb.value] !== undefined) {
            cb.checked = window.visibleIdiomColumns[cb.value];
        }
    });
}, 500);
