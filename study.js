// Study Module - Handles all study/learning functionality

class StudyModule {
    constructor() {
        this.db = null;
        this.allWordsCache = [];
        this.foldersCache = [];
        this.currentSession = null;
        this.settings = {
            audio: true,
            audioWord: true,
            audioInfo1: true,
            audioInfo2: true,
            audioEx1: false,
            audioEx2: false,
            audioTranslation: true,
            examples: true,
            showWord: true,
            showInfo1: true,
            showInfo2: true,
            showEx1: true,
            showEx2: true,
            showProgress: true,
            showStatTotal: true,
            showStatDue: true,
            showStatToday: true,
            masterCard: false,
            masterInterface: false,
            masterAudio: true,
            includeActive: false,
            genderColors: false,
            genderCardBackground: false
        };
        this.tempSettings = null; // Temporary state for settings modal
        this.folderSortOrder = localStorage.getItem('folderSortOrder') || 'newest';

        // DOM Elements
        this.viewStudy = document.getElementById('view-study');
        this.viewGroupEdit = document.getElementById('view-group-edit');
        this.viewStudySession = document.getElementById('view-study-session');
        this.viewExam = document.getElementById('view-exam');

        // Study UI
        this.globalDueCountLbl = document.getElementById('global-due-count-lbl');
        this.btnStartGlobal = document.getElementById('btn-start-global');
        this.groupsList = document.getElementById('groups-list');
        this.studyDashboardMain = document.getElementById('study-dashboard-main');
        this.studyEmptyStateView = document.getElementById('study-empty-state-view');

        // Group Editor
        this.groupWordsList = document.getElementById('group-words-list');
        this.btnBackToStudy = document.getElementById('btn-back-to-study');
        this.btnSaveGroup = document.getElementById('btn-save-group');
        this.btnDeleteFolder = document.getElementById('btn-delete-folder');

        // Session UI
        this.btnExitSession = document.getElementById('btn-exit-session');
        this.flashcard = document.getElementById('flashcard');
        this.cardWord = document.getElementById('card-word');
        this.cardInfo1 = document.getElementById('card-info1');
        this.cardInfo2 = document.getElementById('card-info2');
        this.cardTranslation = document.getElementById('card-translation');
        this.cardExamples = document.getElementById('card-examples');
        this.ratingButtons = document.getElementById('rating-buttons');
        this.btnFlashcardEdit = document.getElementById('btn-flashcard-edit');
        this.cardDeletedOverlay = document.getElementById('card-deleted-overlay');
        this.btnRestoreWord = document.getElementById('btn-restore-word');
        this.btnSkipDeleted = document.getElementById('btn-skip-deleted');
        this.btnQuickToggleAudio = document.getElementById('btn-quick-toggle-audio');
        this.iconAudioOn = document.getElementById('icon-audio-on');
        this.iconAudioOff = document.getElementById('icon-audio-off');

        // Session Stats
        this.totalWordsCount = document.getElementById('total-words-count');
        this.dueWordsCount = document.getElementById('due-words-count');
        this.learnedTodayCount = document.getElementById('learned-today-count');
        this.sessionMasteredCount = document.getElementById('session-mastered-count');
        this.progressContainer = document.querySelector('.session-progress-container');
        this.progressFill = document.getElementById('progress-fill');

        // Session Toggles & Stats Cards (Initialized in initToggles)
        this.btnToggleAudio = null;
        this.btnToggleWord = null;
        this.btnToggleInfo1 = null;
        this.btnToggleInfo2 = null;
        this.btnToggleEx1 = null;
        this.btnToggleEx2 = null;
        this.btnToggleProgress = null;
        this.btnToggleStatTotal = null;
        this.btnToggleStatDue = null;
        this.btnToggleStatToday = null;

        this.statCardToday = null;
        this.sessionGroupTitle = document.getElementById('session-group-title');

        this.btnMasterCard = null;
        this.btnMasterInterface = null;
        this.sectionCardElements = null;
        this.sectionInterfaceElements = null;

        // Exam UI Elements
        this.btnExitExam = document.getElementById('btn-exit-exam');
        this.examProgressText = document.getElementById('exam-progress-text');
        this.examQuestionText = document.getElementById('exam-question-text');
        this.examQuestionInfo = document.getElementById('exam-question-info');
        this.examInput = document.getElementById('exam-input');
        this.examFeedback = document.getElementById('exam-feedback');
        this.btnExamCheck = document.getElementById('btn-exam-check');
        this.btnExamNext = document.getElementById('btn-exam-next');
        this.currentExamSession = null;

        // Time Tracking
        this.timer = null;
        this.lastActivity = Date.now();
        this.idleLimit = 30 * 1000; // 30 seconds
        this.isActiveSession = false;
        this.userId = null;
        this.pendingSeconds = 0;
        this.todayTotalSeconds = 0; // Cumulative total for today
        this.lastTickTimestamp = 0;
    }

    async init(dbInstance, wordsCache) {
        this.db = dbInstance;
        this.allWordsCache = wordsCache;

        // Grab userID from DB instance if available or auth
        if (firebase.auth().currentUser) {
            this.userId = firebase.auth().currentUser.uid;
        }

        // Load persisted settings
        const persisted = await this.db.getSettings();
        if (persisted) {
            this.settings = { ...this.settings, ...persisted };
        }

        this.initToggles();
        this.initSessionControls();

        // Setup Idle listeners
        ['mousemove', 'keydown', 'click', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, () => this.lastActivity = Date.now());
        });

        // Load today's base time
        if (this.userId) {
            const dateKey = DateUtils.getLogicalDateKey();
            const ref = this.db.db.ref(`users/${this.userId}/stats/daily/${dateKey}`);
            ref.on('value', (snap) => {
                const val = snap.val() || 0;
                // Only update if we aren't currently tracking (to avoid jumps)
                // or if the DB value is significantly ahead
                if (!this.isActiveSession) {
                    this.todayTotalSeconds = val;
                }
            });

            // Subscribe to Folder Metadata (creation type)
            const refMeta = this.db.db.ref(`users/${this.userId}/folderMeta`);
            refMeta.on('value', (snap) => {
                this.folderMetaCache = snap.val() || {};
                // If study dashboard is visible, re-render to update labels
                if (!this.viewStudy.classList.contains('hidden')) {
                    this.renderFolders();
                }
            });
        }

        // Subscribe to Folders
        this.db.subscribeToFolders((folders) => {
            this.foldersCache = folders ? Object.values(folders) : [];
            if (!this.viewStudy.classList.contains('hidden')) {
                this.renderStudyDashboard();
            }
        });

        // Initialize Folder Modal
        this.initFolderCreation();

        // Visibility Change listener to stop counting when backgrounded
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.stopTracking();
            } else {
                // Return to app: if we are in study session view, restart tracking
                if (this.viewStudySession && !this.viewStudySession.classList.contains('hidden') && this.currentSession) {
                    this.startTracking();
                }
            }
        });
    }

    startTracking() {
        if (this.isActiveSession) return;
        this.isActiveSession = true;
        this.lastActivity = Date.now();
        this.lastTickTimestamp = Date.now();

        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            if (!this.isActiveSession || !this.userId) return;

            const now = Date.now();
            const deltaMs = now - this.lastTickTimestamp;
            this.lastTickTimestamp = now;

            // Only count if user was active recently (prevent counting while locked/idle)
            if (now - this.lastActivity < this.idleLimit) {
                const deltaSec = deltaMs / 1000;
                this.accumulateTime(deltaSec);
                this.updateTimerUI();
            }
        }, 1000);

        this.updateTimerUI();
    }

    async stopTracking() {
        if (!this.isActiveSession) return;
        this.isActiveSession = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        await this.flushTime();
    }

    async accumulateTime(seconds) {
        if (isNaN(seconds)) return;
        this.todayTotalSeconds += seconds;
        this.pendingSeconds += seconds;

        // Flush to DB roughly every 10 seconds to avoid data loss on crash/exit
        if (this.pendingSeconds >= 10) {
            await this.flushTime();
        }
    }

    async flushTime() {
        if (this.pendingSeconds <= 0) return;
        if (!this.userId) return;

        const toAdd = Math.floor(this.pendingSeconds);
        // Keep the fractional part for the next flush
        this.pendingSeconds -= toAdd;

        if (toAdd <= 0) return;

        const dateKey = DateUtils.getLogicalDateKey(); // YYYY-MM-DD
        const ref = this.db.db.ref(`users/${this.userId}/stats/daily/${dateKey}`);

        // Transaction to increment
        try {
            await ref.transaction((currentVal) => {
                return (currentVal || 0) + toAdd;
            });
        } catch (e) {
            console.error("Flush time error:", e);
        }
    }

    updateTimerUI() {
        const el = document.getElementById('debug-session-timer');
        if (!el) return;
        const total = Math.floor(this.todayTotalSeconds);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;

        if (h > 0) {
            el.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        } else {
            el.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }

    updateWordsCache(wordsCache) {
        this.allWordsCache = wordsCache;
    }

    // --- TOGGLES ---
    initToggles() {
        this.btnToggleAudio = document.getElementById('btn-toggle-audio');
        this.btnToggleWord = document.getElementById('btn-toggle-word');
        this.btnToggleInfo1 = document.getElementById('btn-toggle-info1');
        this.btnToggleInfo2 = document.getElementById('btn-toggle-info2');
        this.btnToggleEx1 = document.getElementById('btn-toggle-ex1');
        this.btnToggleEx2 = document.getElementById('btn-toggle-ex2');
        this.btnToggleProgress = document.getElementById('btn-toggle-progress');
        this.btnToggleStatTotal = document.getElementById('btn-toggle-stat-total');
        this.btnToggleStatDue = document.getElementById('btn-toggle-stat-due');
        this.btnToggleStatToday = document.getElementById('btn-toggle-stat-today');
        this.btnToggleIncludeActive = document.getElementById('btn-toggle-include-active');
        this.btnToggleVoice = document.getElementById('btn-toggle-voice');
        this.btnToggleGenderColors = document.getElementById('btn-toggle-gender-colors');
        this.btnToggleGenderCardBackground = document.getElementById('btn-toggle-gender-card-bg');

        this.statCardTotal = document.getElementById('stat-card-total');
        this.statCardDue = document.getElementById('stat-card-due');
        this.statCardToday = document.getElementById('stat-card-today');

        this.btnMasterCard = document.getElementById('btn-master-toggle-card');
        this.btnMasterInterface = document.getElementById('btn-master-toggle-interface');
        this.sectionCardElements = document.getElementById('section-card-elements');
        this.sectionInterfaceElements = document.getElementById('section-interface-elements');

        this.btnMasterAudio = document.getElementById('btn-master-toggle-audio');
        this.sectionAudioElements = document.getElementById('section-audio-elements');
        this.btnToggleAudioWord = document.getElementById('btn-toggle-audio-word');
        this.btnToggleAudioInfo1 = document.getElementById('btn-toggle-audio-info1');
        this.btnToggleAudioInfo2 = document.getElementById('btn-toggle-audio-info2');
        this.btnToggleAudioEx1 = document.getElementById('btn-toggle-audio-ex1');
        this.btnToggleAudioEx2 = document.getElementById('btn-toggle-audio-ex2');
        this.btnToggleAudioTranslation = document.getElementById('btn-toggle-audio-translation');

        if (this.btnMasterAudio) {
            this.btnMasterAudio.onclick = () => this.toggleSetting('audio');
        }

        if (this.btnQuickToggleAudio) {
            this.btnQuickToggleAudio.onclick = () => {
                this.settings.audio = !this.settings.audio;
                this.settings.masterAudio = this.settings.audio;
                if (!this.settings.audio) this.stopAudio();
                this.updateElementsVisibility();
                this.db.saveSettings(this.settings);
            };
        }

        const setupToggle = (btn, settingsKey) => {
            if (btn) {
                btn.onclick = () => this.toggleSetting(settingsKey);
            }
        };

        setupToggle(this.btnToggleAudioWord, 'audioWord');
        setupToggle(this.btnToggleAudioInfo1, 'audioInfo1');
        setupToggle(this.btnToggleAudioInfo2, 'audioInfo2');
        setupToggle(this.btnToggleAudioEx1, 'audioEx1');
        setupToggle(this.btnToggleAudioEx2, 'audioEx2');
        setupToggle(this.btnToggleAudioTranslation, 'audioTranslation');

        setupToggle(this.btnToggleWord, 'showWord');
        setupToggle(this.btnToggleInfo1, 'showInfo1');
        setupToggle(this.btnToggleInfo2, 'showInfo2');
        setupToggle(this.btnToggleEx1, 'showEx1');
        setupToggle(this.btnToggleEx2, 'showEx2');
        setupToggle(this.btnToggleProgress, 'showProgress');
        setupToggle(this.btnToggleStatTotal, 'showStatTotal');
        setupToggle(this.btnToggleStatDue, 'showStatDue');
        setupToggle(this.btnToggleStatToday, 'showStatToday');
        setupToggle(this.btnToggleIncludeActive, 'includeActive');
        setupToggle(this.btnToggleGenderColors, 'genderColors');
        setupToggle(this.btnToggleGenderCardBackground, 'genderCardBackground');

        setupToggle(this.btnMasterCard, 'masterCard');
        setupToggle(this.btnMasterInterface, 'masterInterface');

        // Handle Voice Toggle
        if (this.btnToggleVoice && window.VoiceControl) {
            this.btnToggleVoice.onclick = () => {
                const isActive = window.VoiceControl.toggle();
                this.btnToggleVoice.classList.toggle('active', isActive);
            };
            window.VoiceControl.btnToggle = this.btnToggleVoice;
        }

        // Handle Settings Menu
        const btnSettings = document.getElementById('btn-session-settings');
        if (btnSettings) {
            btnSettings.onclick = (e) => {
                e.stopPropagation();
                this.openSettings();
            };
        }

        const btnClose = document.getElementById('btn-close-settings');
        if (btnClose) {
            btnClose.onclick = () => this.closeSettings();
        }

        this.updateElementsVisibility();
    }

    openSettings() {
        const menuSettings = document.getElementById('session-settings-menu');
        if (menuSettings) {
            // Copy actual settings to temp
            this.tempSettings = JSON.parse(JSON.stringify(this.settings));
            this.syncTogglesUI();
            menuSettings.classList.remove('hidden');
        }
    }

    applySettings() {
        if (this.tempSettings) {
            // Finalize changes
            const audioSettingsChanged = this.settings.audio !== this.tempSettings.audio ||
                this.settings.audioWord !== this.tempSettings.audioWord ||
                this.settings.audioInfo1 !== this.tempSettings.audioInfo1 ||
                this.settings.audioInfo2 !== this.tempSettings.audioInfo2 ||
                this.settings.audioEx1 !== this.tempSettings.audioEx1 ||
                this.settings.audioEx2 !== this.tempSettings.audioEx2 ||
                this.settings.audioTranslation !== this.tempSettings.audioTranslation;

            this.settings = JSON.parse(JSON.stringify(this.tempSettings));
            this.db.saveSettings(this.settings);

            if (!this.settings.audio) this.stopAudio();

            this.updateElementsVisibility();

            // Re-render current card to apply gender colors, etc.
            if (this.currentSession && this.currentSession.currentWord) {
                // If audio wasn't changed, we might not want to restart it
                // But for simplicity and to ensure new audio fields play, we refresh.
                // However, we should stop current audio first.
                this.stopAudio();
                this.showNextCard(true);
            }

            this.tempSettings = null;
        }
        const menuSettings = document.getElementById('session-settings-menu');
        if (menuSettings) menuSettings.classList.add('hidden');
    }

    closeSettings() {
        this.tempSettings = null;
        const menuSettings = document.getElementById('session-settings-menu');
        if (menuSettings) menuSettings.classList.add('hidden');
    }

    toggleSetting(key) {
        if (!this.tempSettings) return;

        this.tempSettings[key] = !this.tempSettings[key];

        // Special logic for master audio
        if (key === 'audio') {
            this.tempSettings.masterAudio = this.tempSettings.audio;
        }

        this.syncTogglesUI();
    }

    syncTogglesUI() {
        const s = this.tempSettings || this.settings;

        const updateBtn = (btn, key) => {
            if (btn) btn.classList.toggle('active', s[key]);
        };

        updateBtn(this.btnMasterAudio, 'audio');
        updateBtn(this.btnToggleAudioWord, 'audioWord');
        updateBtn(this.btnToggleAudioInfo1, 'audioInfo1');
        updateBtn(this.btnToggleAudioInfo2, 'audioInfo2');
        updateBtn(this.btnToggleAudioEx1, 'audioEx1');
        updateBtn(this.btnToggleAudioEx2, 'audioEx2');
        updateBtn(this.btnToggleAudioTranslation, 'audioTranslation');

        updateBtn(this.btnToggleWord, 'showWord');
        updateBtn(this.btnToggleInfo1, 'showInfo1');
        updateBtn(this.btnToggleInfo2, 'showInfo2');
        updateBtn(this.btnToggleEx1, 'showEx1');
        updateBtn(this.btnToggleEx2, 'showEx2');
        updateBtn(this.btnToggleProgress, 'showProgress');
        updateBtn(this.btnToggleStatTotal, 'showStatTotal');
        updateBtn(this.btnToggleStatDue, 'showStatDue');
        updateBtn(this.btnToggleStatToday, 'showStatToday');
        updateBtn(this.btnToggleIncludeActive, 'includeActive');
        updateBtn(this.btnToggleGenderColors, 'genderColors');
        updateBtn(this.btnToggleGenderCardBackground, 'genderCardBackground');

        updateBtn(this.btnMasterCard, 'masterCard');
        updateBtn(this.btnMasterInterface, 'masterInterface');

        // Update Section Expansion
        if (this.sectionCardElements) this.sectionCardElements.classList.toggle('expanded', s.masterCard);
        if (this.sectionInterfaceElements) this.sectionInterfaceElements.classList.toggle('expanded', s.masterInterface);
        if (this.sectionAudioElements) this.sectionAudioElements.classList.toggle('expanded', s.masterAudio);

        // Voice Control
        if (this.btnToggleVoice && window.VoiceControl) {
            this.btnToggleVoice.classList.toggle('active', window.VoiceControl.isActive);
        }
    }

    updateElementsVisibility() {
        if (this.cardWord) this.cardWord.style.display = (this.settings.showWord && this.cardWord.textContent.trim()) ? 'block' : 'none';
        if (this.cardInfo1) this.cardInfo1.style.display = (this.settings.showInfo1 && this.cardInfo1.textContent.trim()) ? 'block' : 'none';
        if (this.cardInfo2) this.cardInfo2.style.display = (this.settings.showInfo2 && this.cardInfo2.textContent.trim()) ? 'block' : 'none';

        if (this.cardExamples) {
            const exs = this.cardExamples.querySelectorAll('p');
            let hasVisibleEx = false;
            exs.forEach((p, i) => {
                const settingKey = `showEx${i + 1}`;
                const isVisible = this.settings[settingKey] && p.textContent.replace('•', '').trim().length > 0;
                p.style.display = isVisible ? 'block' : 'none';
                if (isVisible) hasVisibleEx = true;
            });
            this.cardExamples.style.display = hasVisibleEx ? 'block' : 'none';
        }

        if (this.progressContainer) this.progressContainer.style.display = this.settings.showProgress ? 'block' : 'none';
        if (this.statCardTotal) this.statCardTotal.style.display = this.settings.showStatTotal ? 'flex' : 'none';
        if (this.statCardDue) this.statCardDue.style.display = this.settings.showStatDue ? 'flex' : 'none';
        if (this.statCardToday) this.statCardToday.style.display = this.settings.showStatToday ? 'flex' : 'none';

        if (this.sectionCardElements) this.sectionCardElements.classList.toggle('expanded', this.settings.masterCard);
        if (this.sectionInterfaceElements) this.sectionInterfaceElements.classList.toggle('expanded', this.settings.masterInterface);
        if (this.sectionAudioElements) this.sectionAudioElements.classList.toggle('expanded', this.settings.masterAudio);

        // Update audio buttons
        if (this.btnMasterAudio) this.btnMasterAudio.classList.toggle('active', this.settings.audio);
        if (this.btnQuickToggleAudio) {
            this.btnQuickToggleAudio.classList.toggle('active-toggle', this.settings.audio);
            if (this.iconAudioOn) this.iconAudioOn.classList.toggle('hidden', !this.settings.audio);
            if (this.iconAudioOff) this.iconAudioOff.classList.toggle('hidden', this.settings.audio);
        }
    }

    // --- STATS LOGIC ---
    getWordsForScope(mode, groupIndex) {
        const sorted = [...this.allWordsCache].sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (mode === 'global') {
            if (this.settings.includeActive) {
                return sorted;
            }
            return sorted.filter(w => !w.progress_global || !w.progress_global.isActive);
        }
        if (mode === 'folder' && groupIndex != null) {
            // groupIndex here is the folder name
            return sorted.filter(w => w.folder === groupIndex);
        }
        return [];
    }

    updateStatsUI(words) {
        const now = Date.now();
        const startOfToday = DateUtils.getLogicalDayStart();
        let total = 0, due = 0, learnedToday = 0, mastered = 0;

        words.forEach(w => {
            total++;
            const key = 'progress_global';
            const prog = w[key] || {};

            if (!prog.isActive && (!prog.nextDate || prog.nextDate <= now)) due++;
            if (prog.lastReviewed && prog.lastReviewed >= startOfToday) learnedToday++;
            // Mastered: active OR (interval >= 12 AND not overdue)
            if (prog.isActive || (prog.interval && prog.interval >= 12 && prog.nextDate > now)) mastered++;
        });

        if (this.totalWordsCount) this.totalWordsCount.textContent = total;
        if (this.dueWordsCount) this.dueWordsCount.textContent = due;
        if (this.learnedTodayCount) this.learnedTodayCount.textContent = learnedToday;
        if (this.sessionMasteredCount) {
            this.sessionMasteredCount.textContent = mastered;
        }

        if (this.progressFill) {
            const pct = total === 0 ? 0 : (mastered / total) * 100;
            this.progressFill.style.width = `${pct}%`;
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // --- FOLDERS LOGIC ---
    initFolderCreation() {
        // Initialize Sort Menu Listeners
        const sortBtn = document.getElementById('folder-sort-toggle');
        const sortMenu = document.getElementById('folder-sort-menu');

        if (sortBtn && sortMenu) {
            sortBtn.onclick = (e) => {
                e.stopPropagation();
                if (sortMenu.classList.contains('hidden')) {
                    sortMenu.classList.remove('hidden');
                } else {
                    sortMenu.classList.add('hidden');
                }
            };

            // Close when clicking outside
            window.addEventListener('click', (e) => {
                if (!sortMenu.classList.contains('hidden')) {
                    if (!sortMenu.contains(e.target) && !sortBtn.contains(e.target)) {
                        sortMenu.classList.add('hidden');
                    }
                }
            });

            // Set Initial Radio State based on saved preference
            const radio = sortMenu.querySelector(`input[value="${this.folderSortOrder}"]`);
            if (radio) radio.checked = true;
        }

        // Listener for Manual Folder Creation to save metadata
        document.addEventListener('click', (e) => {
            // Check for the create button (ID based on likely naming convention or inspect)
            // Assuming ID is 'btn-create-folder-confirm' based on standard pattern
            if (e.target && (e.target.id === 'btn-create-folder-confirm' || e.target.id === 'btn-save-new-folder')) {
                const input = document.getElementById('folder-create-name') || document.getElementById('new-folder-name');
                if (input && input.value && this.userId) {
                    const name = input.value.trim();
                    // Save as Manual
                    this.db.db.ref(`users/${this.userId}/folderMeta/${name}`).update({
                        type: 'manual',
                        createdAt: Date.now()
                    });
                }
            }
        });
    }

    updateFolderSort(order) {
        this.folderSortOrder = order;
        localStorage.setItem('folderSortOrder', order);

        // Update UI immediately
        this.renderFolders();

        // Close menu
        const sortMenu = document.getElementById('folder-sort-menu');
        if (sortMenu) sortMenu.classList.add('hidden');
    }

    openFolderCreator() {
        if (window.switchView) window.switchView(this.viewGroupEdit);

        // Reset Inputs
        const nameInput = document.getElementById('group-name-input');
        const descInput = document.getElementById('group-desc-input');
        if (nameInput) nameInput.value = '';
        if (descInput) descInput.value = '';

        this.editingMode = 'new_folder';
        this.folderDraftState = [];

        // Start with one empty card
        this.addDraftCard();
        this.renderFolderDraft();

        // Hide Delete Button
        if (this.btnDeleteFolder) {
            this.btnDeleteFolder.classList.add('hidden');
        }

        // Update Save Button Listener
        if (this.btnSaveGroup) {
            this.btnSaveGroup.onclick = () => this.saveDraftFolder();
        }
        // Update Back Button Listener
        if (this.btnBackToStudy) {
            this.btnBackToStudy.onclick = () => {
                this.renderStudyDashboard();
                if (window.switchView) window.switchView(this.viewStudy);
            };
        }
    }

    async deleteFolder(folderName) {
        if (!confirm('Вы уверены, что хотите удалить эту папку? Слова останутся с названием этой папки.')) return;

        try {
            // Since we no longer use 'folders/' structure, we only need to clean up old data if any
            // For new implementation, deleting a "folder" just means we stop showing it,
            // but words still keep their folder field.
            // If you want to clear the folder field from words, you'd need to update each word:

            const updates = {};
            this.allWordsCache.forEach(w => {
                if (w.folder === folderName) {
                    // Option 1: Clear folder field (words will go to auto-folders)
                    // updates[`users/${this.userId}/words/${w.id}/folder`] = null;

                    // Option 2: Keep the folder name (recommended)
                    // Do nothing, words keep their folder name
                }
            });

            // Remove old folder structure if exists
            await this.db.db.ref(`users/${this.userId}/folders/${folderName}`).remove();

            if (Object.keys(updates).length > 0) {
                await this.db.db.ref().update(updates);
            }

            this.renderStudyDashboard();
            if (window.switchView) window.switchView(this.viewStudy);
        } catch (e) {
            console.error(e);
            alert('Ошибка при удалении папки');
        }
    }

    openFolderEditor(folderName) {
        if (window.switchView) window.switchView(this.viewGroupEdit);

        // Reset Inputs
        const nameInput = document.getElementById('group-name-input');
        const descInput = document.getElementById('group-desc-input');
        if (nameInput) nameInput.value = folderName || '';
        if (descInput) descInput.value = '';

        this.editingMode = 'edit_folder';
        this.currentFolderId = folderName; // Store original folder name
        this.folderDraftState = [];

        // Load words from allWordsCache that belong to this folder
        const folderWords = this.allWordsCache.filter(w => w.folder === folderName);
        folderWords.forEach(w => {
            this.folderDraftState.push({
                id: w.id, // Keep ID for updates
                word: w.word,
                translation: w.translation,
                info1: w.info1,
                info2: w.info2,
                ex1: w.ex1,
                ex2: w.ex2,
                progress_global: w.progress_global,
                progress_groups: w.progress_groups
            });
        });

        // Ensure at least one empty card if empty
        if (this.folderDraftState.length === 0) {
            this.addDraftCard();
        }

        this.renderFolderDraft();

        // Show and Bind Delete Button
        if (this.btnDeleteFolder) {
            this.btnDeleteFolder.classList.remove('hidden');
            this.btnDeleteFolder.onclick = () => this.deleteFolder(folderName);
        }

        // Update Save Button Listener
        if (this.btnSaveGroup) {
            this.btnSaveGroup.onclick = () => this.saveDraftFolder();
        }

        // Update Back To Study
        if (this.btnBackToStudy) {
            this.btnBackToStudy.onclick = () => {
                this.renderStudyDashboard();
                if (window.switchView) window.switchView(this.viewStudy);
            };
        }
    }

    addDraftCard() {
        this.folderDraftState.push({
            id: null,
            word: '',
            translation: '',
            info1: '',
            info2: '',
            ex1: '',
            ex2: ''
        });
        this.renderFolderDraft();
    }

    renderFolderDraft() {
        this.groupWordsList.innerHTML = '';
        this.folderDraftState.forEach((w, index) => {
            const div = document.createElement('div');
            div.className = 'word-edit-card';
            div.innerHTML = `
                <div class="card-header-mini">
                    <span class="card-num">
                        ${index + 1}
                    </span>
                    <div class="card-actions-mini">
                        <button class="btn-icon btn-delete text-muted" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 6h18"></path>
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="card-edit-content">
                    <div class="term-col">
                        <div class="field-group">
                            <label>Слово</label>
                            <input type="text" class="input-stealth input-main" value="${w.word}" data-field="word" data-idx="${index}" style="padding-left: 1rem; font-weight: 600;">
                        </div>
                        <div class="field-group">
                            <label>Определение</label>
                            <input type="text" class="input-stealth input-main" value="${w.translation}" data-field="translation" data-idx="${index}" style="padding-left: 1rem; font-weight: 600;">
                        </div>
                    </div>
                    
                    <div class="def-col">
                         <div class="field-group">
                             <label>Доп. инфо</label>
                             <input type="text" class="input-stealth input-sub" value="${w.info1 || ''}" data-field="info1" data-idx="${index}" style="padding-left: 1rem; font-weight: 500; color: #ffffff; opacity: 1; font-size: 0.9rem;">
                        </div>
                         <div class="field-group">
                             <input type="text" class="input-stealth input-sub" value="${w.info2 || ''}" data-field="info2" data-idx="${index}" style="padding-left: 1rem; font-weight: 500; color: #ffffff; opacity: 1; font-size: 0.9rem;">
                        </div>
                         <div class="field-group">
                             <label>Примеры</label>
                             <input type="text" class="input-stealth input-sub" value="${w.ex1 || ''}" data-field="ex1" data-idx="${index}" style="padding-left: 1rem; font-weight: 500; color: #ffffff; opacity: 1; font-size: 0.9rem;">
                        </div>
                         <div class="field-group">
                             <input type="text" class="input-stealth input-sub" value="${w.ex2 || ''}" data-field="ex2" data-idx="${index}" style="padding-left: 1rem; font-weight: 500; color: #ffffff; opacity: 1; font-size: 0.9rem;">
                        </div>
                    </div>
                </div>
            `;

            // Bind inputs to local state
            div.querySelectorAll('input').forEach(input => {
                input.oninput = (e) => {
                    const field = e.target.dataset.field;
                    const idx = e.target.dataset.idx;
                    // Check if exists
                    if (this.folderDraftState[idx]) {
                        this.folderDraftState[idx][field] = e.target.value;
                    }
                };
            });

            // Bind Delete (Remove from local state)
            div.querySelector('.btn-delete').onclick = () => {
                this.folderDraftState.splice(index, 1);
                this.renderFolderDraft();
            };

            this.groupWordsList.appendChild(div);
        });

        // Add Plus Button at the bottom
        const btnAdd = document.createElement('button');
        btnAdd.className = 'btn-icon';
        btnAdd.style.width = '100%';
        btnAdd.style.marginTop = '1rem';
        btnAdd.style.padding = '1rem';
        btnAdd.style.border = '1px dashed var(--border)';
        btnAdd.style.borderRadius = '12px';
        btnAdd.style.color = 'var(--text-muted)';
        btnAdd.style.justifyContent = 'center';
        btnAdd.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

        btnAdd.onclick = () => this.addDraftCard();
        this.groupWordsList.appendChild(btnAdd);
    }

    async saveDraftFolder() {
        const nameInput = document.getElementById('group-name-input');
        const descInput = document.getElementById('group-desc-input');
        const name = nameInput ? (nameInput.value.trim() || 'Новая папка') : 'Новая папка';

        // Filter valid words
        const validWords = this.folderDraftState.filter(w => w.word.trim() && w.translation.trim());

        if (validWords.length === 0) {
            alert("Добавьте хотя бы одно слово.");
            return;
        }

        // Generate IDs and format for DB
        const newWordIds = [];
        const updates = {};

        // Find max ID
        let currentMaxId = 0;
        this.allWordsCache.forEach(w => {
            const id = parseInt(w.id);
            if (!isNaN(id) && id > currentMaxId) currentMaxId = id;
        });

        validWords.forEach(w => {
            let id = w.id;
            if (!id) {
                // New Word
                currentMaxId++;
                id = String(currentMaxId);
            }

            newWordIds.push(id);

            // Important: Assign the folder name to each word
            updates[`users/${this.userId}/words/${id}`] = {
                id: id,
                word: w.word,
                translation: w.translation,
                info1: w.info1,
                info2: w.info2,
                ex1: w.ex1,
                ex2: w.ex2,
                folder: name, // Set folder to the folder name
                progress_global: w.progress_global || { interval: 0, nextDate: Date.now(), state: "new" },
                progress_groups: w.progress_groups || { interval: 0, nextDate: Date.now(), state: "new" }
            };
        });

        // If editing and folder name changed, update folder field for old words that weren't included
        if (this.editingMode === 'edit_folder' && this.currentFolderId && this.currentFolderId !== name) {
            // Update all words that had the old folder name but aren't in the new list
            this.allWordsCache.forEach(w => {
                if (w.folder === this.currentFolderId && !newWordIds.includes(w.id)) {
                    // Word was removed from folder - optionally clear its folder or leave it
                    // Option: Clear folder (will go to auto-folders)
                    // updates[`users/${this.userId}/words/${w.id}/folder`] = null;

                    // Option: Keep old folder name (recommended for history)
                    // Do nothing
                }
            });
        }

        // Note: We no longer save the folder object in 'folders/' path.
        // Folders are derived dynamically from the 'folder' field in words.

        // Batch Update
        await this.db.db.ref().update(updates);

        // Reset and Exit
        this.renderStudyDashboard();
        if (window.switchView) window.switchView(this.viewStudy);
    }

    renderFolders() {
        const container = document.getElementById('folders-list');
        if (!container) return;
        container.innerHTML = '';

        // Derive folders from allWordsCache
        const foldersMap = {};
        this.allWordsCache.forEach(w => {
            // Only include words that have a folder assigned
            if (w.folder) {
                const folderName = w.folder;
                if (!foldersMap[folderName]) {
                    foldersMap[folderName] = {
                        name: folderName,
                        id: folderName,
                        wordIds: [],
                        minId: Infinity // Track min ID for creation order sort
                    };
                }
                foldersMap[folderName].wordIds.push(w.id);

                // Capture the lowest ID to use as "Creation Time" proxy
                const wId = parseInt(w.id);
                if (!isNaN(wId) && wId < foldersMap[folderName].minId) {
                    foldersMap[folderName].minId = wId;
                }
            }
        });

        // Sort based on user preference
        const folders = Object.values(foldersMap).sort((a, b) => {
            const valA = a.minId === Infinity ? 0 : a.minId;
            const valB = b.minId === Infinity ? 0 : b.minId;

            if (this.folderSortOrder === 'newest') {
                return valB - valA; // Descending ID
            } else if (this.folderSortOrder === 'alphabet') {
                return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            } else {
                // Default 'oldest'
                return valA - valB; // Ascending ID
            }
        });

        if (folders.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Нет созданных папок</div>';
            return;
        }

        const now = Date.now();

        folders.forEach(folder => {
            // Get words objects
            const folderWords = this.allWordsCache.filter(w => folder.wordIds.includes(w.id));
            if (folderWords.length === 0) return;

            const due = folderWords.filter(w => !w.progress_global?.isActive && (!w.progress_global || w.progress_global.nextDate <= now));
            // Mastered: active OR (interval >= 12 AND not overdue)
            const learned = folderWords.filter(w => w.progress_global && (w.progress_global.isActive || (w.progress_global.interval >= 12 && w.progress_global.nextDate > now)));

            const card = document.createElement('div');
            card.className = due.length === 0 ? 'group-card completed' : 'group-card';
            card.style.cursor = 'pointer';

            card.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 1rem; width: 100%; position: relative;">
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                    <div style="flex: 1; min-width: 0; padding-right: 1rem;">
                        <h3 style="margin: 0; font-size: 1.4rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${folder.name}">${folder.name}</h3>
                         <div style="font-size: 0.8rem; color: var(--text-muted); opacity: 0.6; margin-top:0.2rem;">
                            ${(/^Папка \d+$/.test(folder.name)) ? 'Создано автоматически' :
                    (this.folderMetaCache && this.folderMetaCache[folder.name] && this.folderMetaCache[folder.name].type === 'manual') ? 'Создано вручную' :
                        'Создано через импорт'}
                        </div>
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
                        <div class="group-stat-value" style="color: var(--text-main);">${folderWords.length}</div>
                        <div class="group-stat-label">Всего</div>
                    </div>
                    <div class="group-stat-item">
                        <div class="group-stat-value" style="color: ${due.length > 0 ? 'var(--accent-2)' : 'rgba(255,255,255,0.3)'};">${due.length}</div>
                        <div class="group-stat-label">К повтору</div>
                    </div>
                    <div class="group-stat-item">
                        <div class="group-stat-value" style="color: ${learned.length > 0 ? 'var(--secondary)' : 'rgba(255,255,255,0.3)'};">${learned.length}</div>
                        <div class="group-stat-label" style="display:flex; justify-content:center; align-items:center; gap:4px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--secondary); opacity: 0.8;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            Идеально
                        </div>
                    </div>
                </div>
                
                <!-- Progress Bar -->
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Прогресс</span>
                        <span style="font-size: 0.75rem; font-weight: 600; color: var(--secondary);">${Math.round(learned.length / folderWords.length * 100)}%</span>
                    </div>
                    <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
                        <div style="height: 100%; width: ${learned.length / folderWords.length * 100}%; background: linear-gradient(90deg, var(--secondary), var(--accent-bright)); border-radius: 3px; transition: width 0.3s ease;"></div>
                    </div>
                </div>
            </div>
        `;

            card.onclick = () => this.startSession('folder', folder.id);

            // Bind Edit
            const btnEdit = card.querySelector('.btn-edit-folder');
            if (btnEdit) {
                btnEdit.onclick = (e) => {
                    e.stopPropagation();
                    this.openFolderEditor(folder.id);
                };
            }

            container.appendChild(card);
        });
    }

    // --- STUDY DASHBOARD ---
    renderStudyDashboard() {
        if (!this.allWordsCache || this.allWordsCache.length === 0) {
            if (this.studyDashboardMain) this.studyDashboardMain.classList.add('hidden');
            if (this.studyEmptyStateView) {
                this.studyEmptyStateView.classList.remove('hidden');
                this.studyEmptyStateView.innerHTML = `
        <div class="empty-state-card">
            <div class="empty-state-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
            </div>
            <div>
                <h3 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.25rem; font-weight: 700;">Здесь пока ничего нет</h3>
                <p style="color: var(--text-muted); font-size: 1rem; margin-bottom: 1.5rem;">Добавьте свое первое слово, чтобы начать обучение</p>
            </div>
            <button onclick="if(window.openEditModal) window.openEditModal()" class="btn-primary" style="width: auto; padding: 0.8rem 2.5rem; font-weight: 600;">Добавить слово</button>
        </div>
    `;
            }
            return;
        }

        if (this.studyDashboardMain) this.studyDashboardMain.classList.remove('hidden');
        if (this.studyEmptyStateView) this.studyEmptyStateView.classList.add('hidden');

        const now = Date.now();
        const sortedWords = [...this.allWordsCache].sort((a, b) => parseInt(a.id) - parseInt(b.id));

        const globalDue = sortedWords.filter(w => !w.progress_global?.isActive && (!w.progress_global || w.progress_global.nextDate <= now));
        if (this.globalDueCountLbl) this.globalDueCountLbl.textContent = globalDue.length;

        const examWords = sortedWords.filter(w => (w.progress_global?.excellentStreak || 0) >= 9 && !w.progress_global?.isActive);
        const examCard = document.getElementById('exam-mode-card');
        const examCountEl = document.getElementById('exam-ready-count');
        const examBtn = document.getElementById('btn-start-exam');

        // Exam card is always visible
        if (examCard) {
            examCard.style.display = 'block';
            if (examCountEl) examCountEl.textContent = examWords.length;
            if (examBtn) {
                examBtn.disabled = examWords.length === 0;
                if (examWords.length === 0) {
                    examBtn.style.opacity = '0.5';
                    examBtn.style.cursor = 'not-allowed';
                } else {
                    examBtn.style.opacity = '1';
                    examBtn.style.cursor = 'pointer';
                    examBtn.onclick = () => this.startExamSession();
                }
            }
        }

        const dashTotalWords = document.getElementById('dash-total-words');
        if (dashTotalWords) dashTotalWords.textContent = sortedWords.length;

        // --- LAST OPENED CARD LOGIC ---
        const lastCard = document.getElementById('last-opened-card');
        const lastMetaStr = localStorage.getItem('last_opened_session');

        if (lastCard) {
            let isValid = false;
            let title = '';
            let mode = '';
            let groupIndex = null;
            let folderOrGroupWords = [];

            if (lastMetaStr) {
                try {
                    const meta = JSON.parse(lastMetaStr);
                    mode = meta.mode;
                    groupIndex = meta.groupIndex;

                    if (mode === 'folder') {
                        // Deriving folder info from words (groupIndex is folder name)
                        title = groupIndex;
                        folderOrGroupWords = this.allWordsCache.filter(w => w.folder === groupIndex);
                        isValid = folderOrGroupWords.length > 0;
                    }
                } catch (e) {
                    console.error("Error parsing last opened session", e);
                }
            }

            if (isValid) {
                lastCard.classList.remove('hidden');

                // Stats Logic
                const total = folderOrGroupWords.length;
                const due = folderOrGroupWords.filter(w => !w.progress_global?.isActive && (!w.progress_global || w.progress_global.nextDate <= now)).length;
                const mastered = folderOrGroupWords.filter(w => w.progress_global && (w.progress_global.isActive || (w.progress_global.interval >= 12 && w.progress_global.nextDate > now))).length;
                const progressPct = total === 0 ? 0 : Math.round((mastered / total) * 100);

                // UI References
                const titleEl = document.getElementById('last-opened-title');
                const statTotalEl = document.getElementById('last-opened-stat-total');
                const statDueEl = document.getElementById('last-opened-stat-due');
                const statLearnedEl = document.getElementById('last-opened-stat-learned');
                const progressTextEl = document.getElementById('last-opened-progress-text');
                const progressBarEl = document.getElementById('last-opened-progress-bar');
                const btnContinue = document.getElementById('btn-continue-last');
                const btnEdit = document.getElementById('btn-edit-last-opened');

                // Update UI
                if (titleEl) titleEl.textContent = title;
                if (statTotalEl) statTotalEl.textContent = total;
                if (statDueEl) {
                    statDueEl.textContent = due;
                    statDueEl.style.color = due > 0 ? 'var(--accent-2)' : 'rgba(255,255,255,0.3)';
                }
                if (statLearnedEl) {
                    statLearnedEl.textContent = mastered;
                    statLearnedEl.style.color = mastered > 0 ? 'var(--secondary)' : 'rgba(255,255,255,0.3)';
                }

                if (progressTextEl) progressTextEl.textContent = `${progressPct}%`;
                if (progressBarEl) progressBarEl.style.width = `${progressPct}%`;

                // Handle Completed State (Green)
                if (due === 0) {
                    lastCard.classList.add('completed');
                } else {
                    lastCard.classList.remove('completed');
                }

                // Bind Buttons
                if (btnContinue) {
                    btnContinue.onclick = () => this.startSession(mode, groupIndex);
                }

                if (btnEdit) {
                    btnEdit.onclick = (e) => {
                        e.stopPropagation();
                        if (mode === 'folder') {
                            this.openFolderEditor(groupIndex);
                        }
                    };
                }
            } else {
                lastCard.classList.add('hidden');
            }
        }

        this.btnStartGlobal.onclick = () => this.startSession('global', null);

        // Render Folders
        this.renderFolders();

    }

    // --- TTS HELPER ---
    speakText(text, lang = 'de', onEndCallback) {
        if (!text || !this.settings.audio) {
            if (onEndCallback) onEndCallback();
            return;
        }

        if (window.responsiveVoice && window.responsiveVoice.voiceSupport()) {
            const voice = (lang === 'de') ? "Deutsch Male" : "Russian Female";
            window.responsiveVoice.speak(text, voice, { onend: onEndCallback });
        } else {
            const u = new SpeechSynthesisUtterance(text);
            u.lang = (lang === 'de') ? 'de-DE' : 'ru-RU';
            if (onEndCallback) u.onend = onEndCallback;
            window.speechSynthesis.speak(u);
        }
    }

    speakSequence(items) {
        if (!items.length || !this.settings.audio) return;
        const item = items.shift();
        this.speakText(item.text, item.lang, () => {
            if (items.length && this.settings.audio) {
                this.speakSequence(items);
            }
        });
    }

    stopAudio() {
        if (window.responsiveVoice) window.responsiveVoice.cancel();
        window.speechSynthesis.cancel();
    }

    playDeSequence(word) {
        if (!this.settings.audio || !word) return;

        const rawItems = [];
        if (this.settings.audioWord && word.word) rawItems.push({ text: word.word, lang: 'de' });
        if (this.settings.audioInfo1 && word.info1) rawItems.push({ text: word.info1, lang: 'de' });
        if (this.settings.audioInfo2 && word.info2) rawItems.push({ text: word.info2, lang: 'de' });
        if (this.settings.audioEx1 && word.ex1) rawItems.push({ text: word.ex1, lang: 'de' });
        if (this.settings.audioEx2 && word.ex2) rawItems.push({ text: word.ex2, lang: 'de' });

        if (rawItems.length) {
            const groupedItems = [];
            rawItems.forEach(item => {
                const last = groupedItems[groupedItems.length - 1];
                if (last && last.lang === item.lang) {
                    last.text += '. ' + item.text;
                } else {
                    groupedItems.push({ ...item });
                }
            });

            this.stopAudio();
            this.speakSequence(groupedItems);
        }
    }

    saveSessionState() {
        if (!this.currentSession) return;
        const key = `study_session_${this.currentSession.mode}_${this.currentSession.groupIndex ?? 'all'}`;
        const state = {
            queueIds: this.currentSession.queue.map(w => w.id),
            currentIndex: this.currentSession.currentIndex,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(state));
    }

    clearSessionState(mode, groupIndex) {
        const key = `study_session_${mode}_${groupIndex ?? 'all'}`;
        localStorage.removeItem(key);
    }

    // --- SESSION ENGINE ---
    startSession(mode, groupIndex) {
        // Save Last Opened Context (if folder)
        if (mode === 'folder') {
            const meta = {
                mode,
                groupIndex,
                timestamp: Date.now()
            };
            localStorage.setItem('last_opened_session', JSON.stringify(meta));
        }

        const now = Date.now();
        const progressKey = 'progress_global';
        const savedKey = `study_session_${mode}_${groupIndex ?? 'all'}`;

        let sessionData = null;
        const savedData = localStorage.getItem(savedKey);

        if (savedData) {
            try {
                const state = JSON.parse(savedData);
                const queue = state.queueIds
                    .map(id => this.allWordsCache.find(w => w.id === id))
                    .filter(w => !!w);

                if (queue.length > 0 && state.currentIndex < queue.length) {
                    sessionData = {
                        mode,
                        groupIndex,
                        key: progressKey,
                        queue: queue,
                        currentIndex: state.currentIndex,
                        currentWord: null,
                        history: []
                    };
                }
            } catch (e) {
                console.error("Failed to restore session", e);
            }
        }

        if (sessionData) {
            this.currentSession = sessionData;
        } else {
            const scope = this.getWordsForScope(mode, groupIndex);
            // Regular session excludes Active words AND Exam candidates (score >= 9)
            let dueWords = scope.filter(w =>
                !w.progress_global?.isActive &&
                (w.progress_global?.excellentStreak || 0) < 9 &&
                (!w[progressKey] || w[progressKey].nextDate <= now)
            );

            if (dueWords.length === 0) {
                alert("Нет слов для повторения!");
                return;
            }

            dueWords = this.shuffleArray(dueWords);
            this.currentSession = {
                mode,
                groupIndex,
                key: progressKey,
                queue: dueWords,
                currentIndex: 0,
                currentWord: null,
                history: []
            };
            this.saveSessionState();
        }

        const scope = this.getWordsForScope(mode, groupIndex);
        this.updateStatsUI(scope);

        // Update Title
        if (this.sessionGroupTitle) {
            if (mode === 'global') {
                this.sessionGroupTitle.textContent = 'Все слова';
            } else if (mode === 'folder') {
                this.sessionGroupTitle.textContent = groupIndex; // groupIndex is folder name
            }
        }

        if (window.switchView) window.switchView(this.viewStudySession);
        this.startTracking();
        this.showNextCard();
    }

    initSessionControls() {
        if (this.btnExitSession) {
            this.btnExitSession.onclick = () => {
                // Always stop voice recognition on exit
                if (window.VoiceControl) {
                    window.VoiceControl.stop();
                    if (this.btnToggleVoice) this.btnToggleVoice.classList.remove('active');
                }

                if (!this.currentSession) {
                    this.stopTracking();
                    if (window.switchView) window.switchView(this.viewStudy);
                    this.renderStudyDashboard();
                    return;
                }

                if (this.currentSession.currentIndex === 0) {
                    this.stopTracking();
                    this.currentSession = null;
                    if (window.switchView) window.switchView(this.viewStudy);
                    this.renderStudyDashboard();
                } else {
                    // UNDO / BACK Logic
                    if (this.currentSession.history && this.currentSession.history.length > 0) {
                        const lastAction = this.currentSession.history.pop();
                        const word = this.allWordsCache.find(w => w.id === lastAction.wordId);
                        if (word) {
                            const key = this.currentSession.key;
                            // Restore local state
                            if (lastAction.oldProgress) {
                                word[key] = lastAction.oldProgress;
                                // Try to revert in DB (best effort)
                                this.db.updateProgress(word.id, key, lastAction.oldProgress).catch(console.error);
                            } else {
                                delete word[key];
                            }

                            // Revert Stats UI
                            const scope = this.getWordsForScope(this.currentSession.mode, this.currentSession.groupIndex);
                            this.updateStatsUI(scope);
                        }
                    }

                    this.currentSession.currentIndex--;
                    this.showNextCard();
                }
            };
        }

        if (this.flashcard) {
            this.flashcard.onclick = () => {
                // Do not flip if the card is in 'deleted' state
                if (this.deletedWordBackup) return;

                // Stop any ongoing speech immediately on flip
                this.stopAudio();

                const willShowBack = !this.flashcard.classList.contains('is-flipped');
                this.flashcard.classList.toggle('is-flipped');

                if (willShowBack) {
                    // Speak translation when flipping to the back, if enabled
                    if (this.settings.audio && this.settings.audioTranslation && this.currentSession && this.currentSession.currentWord) {
                        this.speakText(this.currentSession.currentWord.translation, 'ru');
                    }
                } else {
                    // Repeat German sequence when flipping back to front
                    if (this.settings.audio && this.currentSession && this.currentSession.currentWord) {
                        this.playDeSequence(this.currentSession.currentWord);
                    }
                }
            };
        }

        document.querySelectorAll('.btn-rate').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                if (this.ratingButtons) this.ratingButtons.style.pointerEvents = 'none'; // Prevent double-click
                let target = e.target;
                while (!target.classList.contains('btn-rate')) target = target.parentElement;
                await this.processCardResult(parseInt(target.dataset.rating));
            };
        });

        if (this.btnFlashcardEdit) {
            this.btnFlashcardEdit.onclick = (e) => {
                e.stopPropagation();
                if (this.currentSession && this.currentSession.currentWord && window.openEditModal) {
                    window.openEditModal(this.currentSession.currentWord);
                }
            };
        }

        if (this.btnRestoreWord) {
            this.btnRestoreWord.onclick = async (e) => {
                if (e) e.stopPropagation();
                if (this.deletedWordBackup) {
                    const word = this.deletedWordBackup;
                    const id = word.id;
                    delete word.id;
                    await this.db.db.ref(`users/${this.userId}/words/${id}`).set(word);
                    alert("Слово восстановлено!");
                    this.deletedWordBackup = null;
                    this.onWordRestored();
                }
            };
        }

        if (this.btnSkipDeleted) {
            this.btnSkipDeleted.onclick = (e) => {
                if (e) e.stopPropagation();
                this.currentSession.currentIndex++;
                this.showNextCard();
            };
        }
    }

    onWordRestored() {
        if (this.cardDeletedOverlay) this.cardDeletedOverlay.classList.add('hidden');
        // Restore all field visibilities
        if (this.cardWord) this.cardWord.style.visibility = 'visible';
        if (this.cardInfo1) this.cardInfo1.style.visibility = 'visible';
        if (this.cardInfo2) this.cardInfo2.style.visibility = 'visible';
        if (this.cardExamples) this.cardExamples.style.visibility = 'visible';
        if (this.btnFlashcardEdit) this.btnFlashcardEdit.style.visibility = 'visible';

        // Re-enable ratings
        if (this.ratingButtons) {
            this.ratingButtons.style.opacity = '1';
            this.ratingButtons.style.pointerEvents = 'auto';
        }
    }

    onWordUpdated(id, updates) {
        if (this.currentSession && this.currentSession.currentWord && this.currentSession.currentWord.id === id) {
            Object.assign(this.currentSession.currentWord, updates);

            // If it was hidden, show it
            this.onWordRestored();

            this.showNextCard(true); // stay on same card but refresh UI
        }
    }

    onWordDeleted(id, backupData) {
        if (this.currentSession && this.currentSession.currentWord && this.currentSession.currentWord.id === id) {
            this.deletedWordBackup = backupData;
            if (this.cardDeletedOverlay) {
                this.cardDeletedOverlay.classList.remove('hidden');
            }
            // Hide all content and edit icon
            if (this.cardWord) this.cardWord.style.visibility = 'hidden';
            if (this.cardInfo1) this.cardInfo1.style.visibility = 'hidden';
            if (this.cardInfo2) this.cardInfo2.style.visibility = 'hidden';
            if (this.cardExamples) this.cardExamples.style.visibility = 'hidden';
            if (this.btnFlashcardEdit) this.btnFlashcardEdit.style.visibility = 'hidden';

            // Disable ratings and flip
            if (this.ratingButtons) {
                this.ratingButtons.style.opacity = '0.3';
                this.ratingButtons.style.pointerEvents = 'none';
            }
            if (this.flashcard) {
                this.flashcard.classList.remove('is-flipped');
            }
        }
    }

    highlightWordInText(text, wordToHighlight, extraInfo = '') {
        if (!text || (!wordToHighlight && !extraInfo)) return text;

        // Combine main word and extra info (forms)
        // e.g. "kreisen" + " (kreist, kreiste, ist gekreist)"
        let combinedSource = (wordToHighlight || '') + ' ' + (extraInfo || '');

        // Clean: remove brackets, specific stopwords (auxiliaries/articles), punctuation
        let clean = combinedSource
            .replace(/[()\[\]]/g, ' ') // remove brackets
            .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/gi, ' ') // Articles
            .replace(/\b(ist|sind|war|waren|hat|haben|hatte|hatten|bin|bist|wird|werden|wurde)\b/gi, ' ') // Auxiliaries
            .replace(/[,.;:!?]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        // Split and filter short tokens
        let rawTokens = clean.split(' ').filter(t => t.length > 1);
        if (rawTokens.length === 0) return text;

        // Generate stems
        let searchStems = [];
        rawTokens.forEach(token => {
            searchStems.push(token); // Add exact token
            // Add stem if word is long enough
            if (token.length >= 5) {
                searchStems.push(token.substring(0, token.length - 2));
            }
        });

        // Unique patterns and Sort longest first
        searchStems = [...new Set(searchStems)];
        searchStems.sort((a, b) => b.length - a.length);

        // Build Patterns
        // If stem length >= 4, allow prefix match (compound words/ge- prefix)
        // Else strict word start
        const regexParts = searchStems.map(stem => {
            const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (stem.length >= 4) {
                return `[\\w]*${esc}[\\w]*`;
            } else {
                return `\\b${esc}[\\w]*`;
            }
        });

        const patternStr = `(${regexParts.join('|')})`;

        try {
            return text.replace(new RegExp(patternStr, 'gi'), '<span class="highlight">$&</span>');
        } catch (e) {
            return text;
        }
    }

    getGenderColor(word) {
        // Check if the word starts with an article
        const wordLower = word.toLowerCase().trim();

        // Check for feminine: die
        if (wordLower.startsWith('die ')) {
            return {
                base: '#ff69b4',           // Hot pink for feminine
                background: 'rgba(255, 105, 180, 0.08)'  // Very subtle pink background
            };
        }

        // Check for masculine: der
        if (wordLower.startsWith('der ')) {
            return {
                base: '#4a9eff',           // Blue for masculine
                background: 'rgba(74, 158, 255, 0.08)'   // Very subtle blue background
            };
        }

        // Check for neuter: das
        if (wordLower.startsWith('das ')) {
            return {
                base: '#e6c200',           // Muted yellow for neuter (less bright)
                background: 'rgba(230, 194, 0, 0.08)'    // Very subtle yellow background
            };
        }

        // No article found, return null
        return null;
    }

    showNextCard(stayOnCurrent = false) {
        if (!stayOnCurrent) {
            if (this.currentSession.currentIndex >= this.currentSession.queue.length) {
                this.stopTracking();
                this.clearSessionState(this.currentSession.mode, this.currentSession.groupIndex);
                alert("Сессия завершена!");
                this.currentSession = null;
                if (window.switchView) window.switchView(this.viewStudy);
                this.renderStudyDashboard();
                return;
            }
            const word = this.currentSession.queue[this.currentSession.currentIndex];
            this.currentSession.currentWord = word;
            this.saveSessionState();
        }

        const word = this.currentSession.currentWord;

        if (this.cardDeletedOverlay) this.cardDeletedOverlay.classList.add('hidden');
        this.deletedWordBackup = null;

        // Restore all field visibilities, ratings, and flip
        this.onWordRestored();

        this.cardTranslation.textContent = '';
        this.cardWord.textContent = '';
        this.cardInfo1.textContent = '';
        if (this.cardInfo2) this.cardInfo2.textContent = '';
        this.cardExamples.innerHTML = '';

        this.flashcard.classList.remove('is-flipped');

        // Initial base size with slight reduction for very long words (width-based heuristic)
        const len = word.word.length;
        if (len > 30) {
            this.cardWord.style.fontSize = '1.5rem';
        } else if (len > 22) {
            this.cardWord.style.fontSize = '1.6rem';
        } else {
            this.cardWord.style.fontSize = '1.8rem';
        }

        // Apply gender-based highlighting
        const genderColors = this.getGenderColor(word.word);

        // 1. Handle Word Text Coloring
        if (this.settings.genderColors && genderColors) {
            if (word.word.includes(',')) {
                const commaIndex = word.word.indexOf(',');
                const beforeComma = word.word.substring(0, commaIndex);
                const afterComma = word.word.substring(commaIndex);
                this.cardWord.innerHTML = '';

                // Color the part before comma with gender color
                const coloredSpan = document.createElement('span');
                coloredSpan.style.color = genderColors.base;
                coloredSpan.textContent = beforeComma;
                this.cardWord.appendChild(coloredSpan);

                // Part after comma should be default theme color (not inherit)
                const afterCommaSpan = document.createElement('span');
                // Get the current theme text color from CSS variable
                const themeTextColor = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#ffffff';
                afterCommaSpan.style.color = themeTextColor;
                afterCommaSpan.textContent = afterComma;
                this.cardWord.appendChild(afterCommaSpan);
            } else {
                this.cardWord.innerHTML = '';
                this.cardWord.textContent = word.word;
                this.cardWord.style.color = genderColors.base;
            }
        } else {
            this.cardWord.innerHTML = '';
            this.cardWord.textContent = word.word;
            this.cardWord.style.color = '';
        }

        // 2. Handle Card Background Coloring (Independent)
        if (this.flashcard) {
            if (this.settings.genderCardBackground && genderColors) {
                this.flashcard.style.background = `linear-gradient(135deg, ${genderColors.background}, rgba(255,255,255,0.02))`;
            } else {
                this.flashcard.style.background = '';
            }
        }

        this.cardInfo1.textContent = word.info1 || '';
        if (this.cardInfo2) this.cardInfo2.textContent = word.info2 || '';

        const examplesProps = ['ex1', 'ex2'];
        const examplesToggles = ['showEx1', 'showEx2'];

        this.cardExamples.innerHTML = examplesProps.map((prop, idx) => {
            if (!word[prop]) return '';
            const isVisible = this.settings[examplesToggles[idx]];
            const style = isVisible ? '' : 'style="display:none"';
            return `<p ${style}>• ${this.highlightWordInText(word[prop], word.word, word.info1)}</p>`;
        }).join('');

        this.updateElementsVisibility();

        // Sequential Audio Queue
        this.playDeSequence(word);

        setTimeout(() => {
            const transLen = word.translation.length;
            if (transLen > 40) {
                this.cardTranslation.style.fontSize = '1.3rem';
            } else if (transLen > 25) {
                this.cardTranslation.style.fontSize = '1.45rem';
            } else {
                this.cardTranslation.style.fontSize = '1.6rem';
            }
            this.cardTranslation.textContent = word.translation;
        }, 400);

        this.ratingButtons.classList.remove('hidden');
        this.ratingButtons.style.pointerEvents = 'auto';
    }

    async processCardResult(rating) {
        if (!this.currentSession) return;
        const word = this.currentSession.currentWord;
        const key = this.currentSession.key;

        let nextIntervalDays = 1;
        let scoreChange = 0;

        switch (rating) {
            case 1: // Не помню
                nextIntervalDays = 0;
                scoreChange = -999; // Signal for reset to 0
                break;
            case 2: // С трудом
                nextIntervalDays = 1;
                scoreChange = -3;
                break;
            case 3: // Частично
                nextIntervalDays = 4;
                scoreChange = -1.5;
                break;
            case 4: // Почти
                nextIntervalDays = 7;
                scoreChange = 0;
                break;
            case 5: // Помню
                nextIntervalDays = 12;
                scoreChange = 1.5;
                break;
            case 6: // Отлично
                nextIntervalDays = 21;
                scoreChange = 3;
                break;
        }

        const currentProgress = word[key] || {};
        let activityScore = currentProgress.excellentStreak || 0;
        let isActive = currentProgress.isActive || false;

        if (scoreChange === -999) {
            activityScore = 0;
        } else {
            activityScore = Math.max(0, activityScore + scoreChange);
        }

        // CAP at 9 in regular sessions - can only reach 10 via exam
        if (activityScore > 9) activityScore = 9;

        // isActive remains unchanged in regular sessions (only exam can set it to true)

        const nextTimestamp = rating === 1 ? Date.now() + 3600000 : Date.now() + (nextIntervalDays * 86400000);
        const newProgress = {
            interval: nextIntervalDays,
            nextDate: nextTimestamp,
            lastRating: rating,
            lastReviewed: Date.now(),
            excellentStreak: activityScore,
            isActive: isActive
        };

        // Save history for Undo
        const oldProgress = word[key] ? JSON.parse(JSON.stringify(word[key])) : null;
        this.currentSession.history.push({ wordId: word.id, oldProgress: oldProgress });

        word[key] = newProgress;

        // Immediate Stats Update
        const scope = this.getWordsForScope(this.currentSession.mode, this.currentSession.groupIndex);
        this.updateStatsUI(scope);

        try {
            await this.db.updateProgress(word.id, key, newProgress);
        } catch (e) {
            console.error(e);
        }

        this.currentSession.currentIndex++;
        this.showNextCard();
    }

    // --- EXAM SESSION LOGIC ---
    startExamSession() {
        const examWords = this.allWordsCache.filter(w =>
            (w.progress_global?.excellentStreak || 0) >= 9 &&
            !w.progress_global?.isActive
        );

        if (examWords.length === 0) {
            alert("Нет слов для экзамена!");
            return;
        }

        this.currentExamSession = {
            queue: this.shuffleArray([...examWords]),
            currentIndex: 0,
            currentWord: null
        };

        // Switch to exam view
        if (window.switchView) window.switchView(this.viewExam);

        // Bind exit button
        if (this.btnExitExam) {
            this.btnExitExam.onclick = () => {
                if (confirm('Вы уверены, что хотите выйти из экзамена?')) {
                    this.currentExamSession = null;
                    if (window.switchView) window.switchView(this.viewStudy);
                    this.renderStudyDashboard();
                }
            };
        }

        this.showNextExamQuestion();
    }

    showNextExamQuestion() {
        if (!this.currentExamSession) return;

        if (this.currentExamSession.currentIndex >= this.currentExamSession.queue.length) {
            // Exam finished
            alert("Экзамен завершен!");
            this.currentExamSession = null;
            if (window.switchView) window.switchView(this.viewStudy);
            this.renderStudyDashboard();
            return;
        }

        const word = this.currentExamSession.queue[this.currentExamSession.currentIndex];
        this.currentExamSession.currentWord = word;

        // Update progress text
        if (this.examProgressText) {
            this.examProgressText.textContent = `Слово ${this.currentExamSession.currentIndex + 1} из ${this.currentExamSession.queue.length}`;
        }

        // Display question
        if (this.examQuestionText) this.examQuestionText.textContent = word.translation;
        if (this.examQuestionInfo) {
            this.examQuestionInfo.textContent = word.info1 || '';
        }

        // Reset input
        if (this.examInput) {
            this.examInput.value = '';
            this.examInput.disabled = false;
            this.examInput.style.borderColor = 'var(--border)';
            this.examInput.focus();
        }

        // Reset buttons
        if (this.btnExamCheck) {
            this.btnExamCheck.classList.remove('hidden');
            this.btnExamCheck.disabled = false;
        }
        if (this.btnExamNext) this.btnExamNext.classList.add('hidden');
        if (this.examFeedback) this.examFeedback.classList.add('hidden');

        // Bind check button
        if (this.btnExamCheck) {
            this.btnExamCheck.onclick = () => this.checkExamAnswer();
        }

        // Allow Enter key to submit
        if (this.examInput) {
            this.examInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !this.btnExamCheck.classList.contains('hidden')) {
                    this.checkExamAnswer();
                }
            };
        }
    }

    normalizeAnswer(str) {
        // Remove articles, normalize whitespace, lowercase
        return str.toLowerCase()
            .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/gi, '')
            .replace(/[.,;:!?]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async checkExamAnswer() {
        if (!this.currentExamSession || !this.currentExamSession.currentWord) return;

        const word = this.currentExamSession.currentWord;
        const userAnswer = this.examInput.value.trim();
        const correctAnswer = word.word;

        // Normalize both answers for comparison
        const normalizedUser = this.normalizeAnswer(userAnswer);
        const normalizedCorrect = this.normalizeAnswer(correctAnswer);

        const isCorrect = normalizedUser === normalizedCorrect;

        // Disable input and check button
        if (this.examInput) this.examInput.disabled = true;
        if (this.btnExamCheck) {
            this.btnExamCheck.classList.add('hidden');
            this.btnExamCheck.disabled = true;
        }

        // Show feedback
        if (this.examFeedback) {
            this.examFeedback.classList.remove('hidden');
            if (isCorrect) {
                this.examFeedback.style.background = 'rgba(16, 185, 129, 0.1)';
                this.examFeedback.style.color = 'var(--accent-bright)';
                this.examFeedback.style.border = '1px solid var(--accent-bright)';
                this.examFeedback.textContent = '✓ Правильно!';
            } else {
                this.examFeedback.style.background = 'rgba(239, 68, 68, 0.1)';
                this.examFeedback.style.color = '#ef4444';
                this.examFeedback.style.border = '1px solid #ef4444';
                this.examFeedback.innerHTML = `✗ Неправильно<br><small>Правильный ответ: <strong>${correctAnswer}</strong></small>`;
            }
        }

        // Update score
        const currentProgress = word.progress_global || {};
        let score = currentProgress.excellentStreak || 0;

        if (isCorrect) {
            // +1 point, becomes active (10)
            score = 10;
            word.progress_global = {
                ...currentProgress,
                excellentStreak: 10,
                isActive: true,
                interval: 21,
                nextDate: Date.now() + (21 * 86400000),
                lastRating: 6,
                lastReviewed: Date.now()
            };
        } else {
            // -3 points
            score = Math.max(0, score - 3);
            word.progress_global = {
                ...currentProgress,
                excellentStreak: score,
                isActive: false,
                interval: score >= 9 ? 7 : 1,
                nextDate: Date.now() + ((score >= 9 ? 7 : 1) * 86400000),
                lastRating: 2,
                lastReviewed: Date.now()
            };
        }

        // Save to database
        try {
            await this.db.updateProgress(word.id, 'progress_global', word.progress_global);
        } catch (e) {
            console.error('Error updating exam progress:', e);
        }

        // Show Next button
        if (this.btnExamNext) {
            this.btnExamNext.classList.remove('hidden');
            this.btnExamNext.onclick = () => {
                this.currentExamSession.currentIndex++;
                this.showNextExamQuestion();
            };
        }
    }
}

// Export for use in main app
window.StudyModule = new StudyModule();
