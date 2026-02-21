document.addEventListener('DOMContentLoaded', () => {
    // --- Mobile Elements ---
    const viewWordEdit = document.getElementById('view-word-edit');
    const globalHeader = document.getElementById('global-header');
    const btnExitWordEdit = document.getElementById('btn-exit-word-edit');
    const editWordForm = document.getElementById('edit-word-form');

    // Mobile Header Buttons instead of bottom buttons
    const btnSaveWordEditHeader = document.getElementById('btn-save-word-edit-header');
    const btnDeleteWordEditHeader = document.getElementById('btn-delete-word-edit-header');

    const mInputs = {
        id: document.getElementById('nw-edit-id'),
        word: document.getElementById('nw-edit-word'),
        translation: document.getElementById('nw-edit-translation'),
        info1: document.getElementById('nw-edit-info1'),
        info2: document.getElementById('nw-edit-info2'),
        ex1: document.getElementById('nw-edit-ex1'),
        ex2: document.getElementById('nw-edit-ex2'),
        folder: document.getElementById('nw-edit-folder')
    };

    const titleText = document.getElementById('edit-word-title-text');
    const idText = document.getElementById('edit-word-id-text');

    // --- Desktop Elements ---
    const editModal = document.getElementById('edit-modal');
    const closeDesktopModalBtn = document.getElementById('close-modal-btn');
    const desktopEditForm = document.getElementById('edit-form');
    const deleteDesktopWordBtn = document.getElementById('delete-word-btn');
    const desktopModalNumber = document.getElementById('edit-modal-number');
    const desktopModalId = document.getElementById('edit-modal-id');

    const dInputs = {
        id: document.getElementById('edit-id'),
        word: document.getElementById('edit-word'),
        translation: document.getElementById('edit-translation'),
        info1: document.getElementById('edit-info1'),
        info2: document.getElementById('edit-info2'),
        ex1: document.getElementById('edit-ex1'),
        ex2: document.getElementById('edit-ex2'),
        folder: document.getElementById('edit-folder')
    };

    let sourceViewId = 'view-words'; // Default fallback
    let lastEditedWordId = null;
    let lastScrollPos = 0;

    function isMobile() {
        return window.innerWidth <= 768;
    }

    // Modal Closing Logic (Desktop)
    function closeEditModal() {
        if (editModal) editModal.classList.add('hidden');
        if (globalHeader) globalHeader.style.pointerEvents = 'auto';
    }

    if (closeDesktopModalBtn) {
        closeDesktopModalBtn.addEventListener('click', closeEditModal);
    }

    function adjustTextareaHeight(el) {
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }

    // Attach auto-resize to all mobile inputs
    Object.values(mInputs).forEach(input => {
        if (input && input.tagName === 'TEXTAREA') {
            input.addEventListener('input', () => adjustTextareaHeight(input));
        }
    });

    // Override Global openEditModal
    window.openEditModal = function (w = null) {
        // Track where we are currently to return later
        const currentActiveView = document.querySelector('.view-section:not(.hidden)');
        if (currentActiveView && currentActiveView.id !== 'view-word-edit') {
            sourceViewId = currentActiveView.id;
        }

        lastEditedWordId = w ? w.id : null;
        lastScrollPos = window.scrollY;

        if (isMobile()) {
            // MOBILE MODE: Fullscreen view
            if (typeof hideAllViews === 'function') {
                hideAllViews();
            } else {
                document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
            }
            if (globalHeader) globalHeader.classList.add('hidden');
            if (viewWordEdit) viewWordEdit.classList.remove('hidden');

            if (w) {
                mInputs.id.value = w.id;
                mInputs.word.value = w.word;
                mInputs.translation.value = w.translation;
                mInputs.info1.value = w.info1 || '';
                mInputs.info2.value = w.info2 || '';
                mInputs.ex1.value = w.ex1 || '';
                mInputs.ex2.value = w.ex2 || '';
                mInputs.folder.value = w.folder || '';

                titleText.textContent = 'Редактировать';
                idText.textContent = `#${w.id}`;
            } else {
                mInputs.id.value = '';
                mInputs.word.value = '';
                mInputs.translation.value = '';
                mInputs.info1.value = '';
                mInputs.info2.value = '';
                mInputs.ex1.value = '';
                mInputs.ex2.value = '';
                mInputs.folder.value = '';

                titleText.textContent = 'Добавить слово';
                idText.textContent = 'Новое';
            }

            // Adjust heights after populating values
            setTimeout(() => {
                Object.values(mInputs).forEach(input => {
                    if (input && input.tagName === 'TEXTAREA') adjustTextareaHeight(input);
                });
            }, 0);
        } else {
            // DESKTOP MODE: Overlay modal
            if (w) {
                dInputs.id.value = w.id;
                dInputs.word.value = w.word;
                dInputs.translation.value = w.translation;
                dInputs.info1.value = w.info1 || '';
                dInputs.info2.value = w.info2 || '';
                dInputs.ex1.value = w.ex1 || '';
                dInputs.ex2.value = w.ex2 || '';
                dInputs.folder.value = w.folder || '';

                const wordIndex = typeof allWordsCache !== 'undefined' ? allWordsCache.findIndex(word => String(word.id) === String(w.id)) : -1;
                if (desktopModalNumber) desktopModalNumber.textContent = wordIndex !== -1 ? wordIndex + 1 : '-';
                if (desktopModalId) desktopModalId.textContent = `#${w.id}`;
                if (deleteDesktopWordBtn) deleteDesktopWordBtn.style.display = 'block';
            } else {
                dInputs.id.value = '';
                dInputs.word.value = '';
                dInputs.translation.value = '';
                dInputs.info1.value = '';
                dInputs.info2.value = '';
                dInputs.ex1.value = '';
                dInputs.ex2.value = '';
                dInputs.folder.value = '';

                if (desktopModalNumber) desktopModalNumber.textContent = 'New';
                if (desktopModalId) desktopModalId.textContent = '';
                if (deleteDesktopWordBtn) deleteDesktopWordBtn.style.display = 'none';
            }

            if (editModal) editModal.classList.remove('hidden');
            if (globalHeader) globalHeader.style.pointerEvents = 'none';
        }
    };

    // Close Mobile View
    if (btnExitWordEdit) {
        btnExitWordEdit.addEventListener('click', () => {
            if (globalHeader) globalHeader.classList.remove('hidden');

            // Return to where we came from
            if (typeof showView === 'function') {
                showView(sourceViewId);
            } else {
                viewWordEdit.classList.add('hidden');
                const targetView = document.getElementById(sourceViewId) || document.getElementById('view-words');
                if (targetView) targetView.classList.remove('hidden');
            }

            // Refresh UI
            if (typeof applyDictionaryFilters === 'function') applyDictionaryFilters();
            if (window.StudyModule && typeof window.StudyModule.renderStudyDashboard === 'function') {
                window.StudyModule.renderStudyDashboard();
            }

            // Restore Scroll / Scroll to Word
            if (sourceViewId === 'view-words') {
                setTimeout(() => {
                    if (lastEditedWordId) {
                        const row = document.getElementById(`word-row-${lastEditedWordId}`);
                        if (row) {
                            row.scrollIntoView({ block: 'center', behavior: 'instant' });
                        } else {
                            window.scrollTo(0, lastScrollPos);
                        }
                    } else {
                        window.scrollTo(0, lastScrollPos);
                    }
                }, 50);
            }
        });
    }

    // Shared Save Logic
    async function handleSaveWord(inputsObj, isDesktop = false) {
        let id = inputsObj.id.value;
        const wVal = inputsObj.word.value.trim();
        const tVal = inputsObj.translation.value.trim();
        const isNew = !id;

        if (!wVal || !tVal) {
            alert('Пожалуйста, заполните слово и перевод');
            return;
        }

        if (isNew && typeof allWordsCache !== 'undefined') {
            const maxId = allWordsCache.reduce((max, w) => Math.max(max, parseInt(w.id || 0)), 0);
            id = String(maxId + 1);
        } else if (isNew) {
            id = `word_${Date.now()}`;
        }

        let wordFolder = inputsObj.folder.value.trim();
        if (!wordFolder && typeof allWordsCache !== 'undefined') {
            const autoFolderCounts = {};
            allWordsCache.forEach(w => {
                if (w.folder && w.folder.startsWith('Папка ')) {
                    const num = parseInt(w.folder.replace('Папка ', ''));
                    if (!isNaN(num)) {
                        if (!autoFolderCounts[num]) autoFolderCounts[num] = 0;
                        autoFolderCounts[num]++;
                    }
                }
            });

            let currentAutoIdx = 1;
            const autoFolderNumbers = Object.keys(autoFolderCounts).map(k => parseInt(k));
            if (autoFolderNumbers.length > 0) {
                currentAutoIdx = Math.max(...autoFolderNumbers);
                if ((autoFolderCounts[currentAutoIdx] || 0) >= 100) {
                    currentAutoIdx++;
                }
            }
            wordFolder = `Папка ${currentAutoIdx}`;
        }

        const wordData = {
            id: id,
            word: wVal,
            translation: tVal,
            folder: wordFolder,
            info1: inputsObj.info1.value.trim(),
            info2: inputsObj.info2.value.trim(),
            ex1: inputsObj.ex1.value.trim(),
            ex2: inputsObj.ex2.value.trim(),
        };

        // Cache update first for speed
        if (typeof allWordsCache !== 'undefined') {
            if (isNew) {
                const defaultProgress = {
                    interval: 0,
                    nextDate: Date.now(),
                    state: "new",
                    isActive: false,
                    is_ideal: false,
                    excellentStreak: 0
                };
                const newWord = {
                    ...wordData,
                    interval: defaultProgress.interval,
                    nextDate: defaultProgress.nextDate,
                    progress_global: { ...defaultProgress },
                    progress_groups: { ...defaultProgress }
                };
                allWordsCache.push(newWord);
                // Also update firebase
                if (typeof db !== 'undefined' && db.updateWord) {
                    await db.updateWord(id, newWord);
                }
            } else {
                const idx = allWordsCache.findIndex(w => String(w.id) === String(id));
                if (idx !== -1) {
                    const existingWord = allWordsCache[idx];
                    allWordsCache[idx] = {
                        ...existingWord,
                        ...wordData,
                        interval: existingWord.interval || 0,
                        nextDate: existingWord.nextDate || Date.now()
                    };
                }
                // Update firebase
                const wordToUpdate = {
                    ...wordData,
                    // Preserve existing fields if they exist
                    ...(typeof allWordsCache !== 'undefined' && idx !== -1 ? {
                        interval: allWordsCache[idx].interval,
                        nextDate: allWordsCache[idx].nextDate
                    } : {})
                };
                if (typeof db !== 'undefined' && db.updateWord) {
                    await db.updateWord(id, wordToUpdate);
                }
            }
        }

        // Notify modules
        if (window.StudyModule) {
            if (typeof window.StudyModule.updateWordsCache === 'function') {
                window.StudyModule.updateWordsCache(allWordsCache);
            }
            if (typeof window.StudyModule.onWordUpdated === 'function' && !isNew) {
                window.StudyModule.onWordUpdated(id, wordData);
            }
        }
        if (window.ProfileModule && typeof window.ProfileModule.updateStats === 'function') {
            window.ProfileModule.updateStats(allWordsCache);
        }

        if (isDesktop) {
            closeEditModal();
            if (typeof applyDictionaryFilters === 'function') applyDictionaryFilters();
        } else {
            btnExitWordEdit.click();
        }
    }

    // Mobile Form Submit
    if (editWordForm) {
        editWordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSaveWord(mInputs, false);
        });
    }

    // Desktop Form Submit
    if (desktopEditForm) {
        desktopEditForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSaveWord(dInputs, true);
        });
    }

    // Shared Delete Logic
    async function handleDeleteWord(inputsObj, isDesktop = false) {
        const id = inputsObj.id.value;
        const wVal = inputsObj.word.value.trim();

        if (confirm(`Удалить слово "${wVal}"?`)) {
            if (typeof db !== 'undefined' && db.deleteWord) {
                const backupData = {
                    word: wVal, translation: inputsObj.translation.value.trim(),
                    info1: inputsObj.info1.value.trim(), info2: inputsObj.info2.value.trim(),
                    ex1: inputsObj.ex1.value.trim(), ex2: inputsObj.ex2.value.trim(),
                    id: id
                };

                await db.deleteWord(id);

                // Update cache locally
                if (typeof allWordsCache !== 'undefined') {
                    const idx = allWordsCache.findIndex(w => String(w.id) === String(id));
                    if (idx !== -1) allWordsCache.splice(idx, 1);
                }

                // Notify modules
                if (window.StudyModule) {
                    if (typeof window.StudyModule.updateWordsCache === 'function') {
                        window.StudyModule.updateWordsCache(allWordsCache);
                    }
                    if (typeof window.StudyModule.onWordDeleted === 'function') {
                        window.StudyModule.onWordDeleted(id, backupData);
                    }
                }
                if (window.ProfileModule && typeof window.ProfileModule.updateStats === 'function') {
                    window.ProfileModule.updateStats(allWordsCache);
                }

                if (isDesktop) {
                    closeEditModal();
                    if (typeof applyDictionaryFilters === 'function') applyDictionaryFilters();
                } else {
                    btnExitWordEdit.click();
                }
            }
        }
    }

    // Mobile Delete Event
    if (btnDeleteWordEditHeader) {
        btnDeleteWordEditHeader.addEventListener('click', () => {
            handleDeleteWord(mInputs, false);
        });
    }

    // Desktop Delete Event
    if (deleteDesktopWordBtn) {
        deleteDesktopWordBtn.addEventListener('click', () => {
            handleDeleteWord(dInputs, true);
        });
    }
});
