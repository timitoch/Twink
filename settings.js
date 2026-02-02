// Settings Module - Handles all settings page functionality

class SettingsModule {
    constructor() {
        this.db = null;
        this.headerAvatarImg = document.getElementById('header-avatar-img');
        this.headerAvatarInitial = document.getElementById('header-avatar-initial');
        this.settingsAvatarPreview = document.getElementById('settings-avatar-preview');
        this.settingsAvatarInitial = document.getElementById('settings-avatar-initial');
        this.avatarInput = document.getElementById('avatar-input');
        this.btnDeleteAvatar = document.getElementById('btn-delete-avatar');
        this.headerNickname = document.getElementById('header-nickname');
        this.MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
    }

    init(dbInstance) {
        this.db = dbInstance;
        this.initTheme();
        this.initColorScheme();
        this.initTrailSettings(); // Trail settings initialization
        this.initAvatarUpload();
        this.initSettingsTabs();
        this.initProfileActions();
        this.initDataActions();
    }

    // --- THEME LOGIC ---
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButtons(savedTheme);

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.onclick = () => {
                const theme = btn.getAttribute('data-set-theme');
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('theme', theme);
                this.updateThemeButtons(theme);
            };
        });
    }

    updateThemeButtons(theme) {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            if (btn.getAttribute('data-set-theme') === theme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        this.updatePureSchemeLabel(theme);
    }

    updatePureSchemeLabel(theme) {
        const textElem = document.getElementById('scheme-text-pure-black');
        const previewElem = document.getElementById('scheme-preview-pure-black');
        if (textElem && previewElem) {
            if (theme === 'light') {
                textElem.textContent = 'Чистый белый';
                previewElem.style.background = '#ffffff';
                previewElem.style.borderColor = 'rgba(0,0,0,0.1)';
            } else {
                textElem.textContent = 'Чистый черный';
                previewElem.style.background = '#000000';
                previewElem.style.borderColor = 'rgba(255,255,255,0.2)';
            }
        }
    }

    // --- COLOR SCHEME LOGIC ---
    initColorScheme() {
        const savedScheme = localStorage.getItem('colorScheme') || 'pure-black';
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-color-scheme', savedScheme);
        this.updateColorSchemeButtons(savedScheme);
        this.updatePureSchemeLabel(savedTheme);

        document.querySelectorAll('.color-scheme-btn').forEach(btn => {
            btn.onclick = () => {
                const scheme = btn.getAttribute('data-color-scheme');
                document.documentElement.setAttribute('data-color-scheme', scheme);
                localStorage.setItem('colorScheme', scheme);
                this.updateColorSchemeButtons(scheme);
            };
        });
    }

    updateColorSchemeButtons(scheme) {
        document.querySelectorAll('.color-scheme-btn').forEach(btn => {
            if (btn.getAttribute('data-color-scheme') === scheme) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // --- TRAIL SETTINGS LOGIC ---
    initTrailSettings() {
        const trailEnabledBtn = document.getElementById('btn-toggle-trail');
        const typeButtons = document.querySelectorAll('.trail-type-btn');

        // Load saved settings
        const isEnabled = localStorage.getItem('trailEnabled') !== 'false'; // Default true
        const savedType = localStorage.getItem('trailType') || 'sparks';

        // Apply to UI
        if (!isEnabled) {
            trailEnabledBtn?.classList.remove('active');
        }

        this.updateTrailTypeButtons(savedType);

        // Toggle Click
        if (trailEnabledBtn) {
            trailEnabledBtn.onclick = () => {
                const active = trailEnabledBtn.classList.toggle('active');
                localStorage.setItem('trailEnabled', active);
                if (window.cursorParticles) {
                    window.cursorParticles.setEnabled(active);
                }
            };
        }

        // Type Buttons Click
        typeButtons.forEach(btn => {
            btn.onclick = () => {
                if (btn.hasAttribute('disabled')) return;
                const type = btn.getAttribute('data-trail-type');
                localStorage.setItem('trailType', type);
                this.updateTrailTypeButtons(type);
                if (window.cursorParticles) {
                    window.cursorParticles.setType(type);
                }
            };
        });
    }

    updateTrailTypeButtons(type) {
        document.querySelectorAll('.trail-type-btn').forEach(btn => {
            if (btn.getAttribute('data-trail-type') === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    // --- AVATAR LOGIC ---
    loadAvatar(userId) {
        // Fetch nickname first to have initials ready
        this.db.db.ref('users/' + userId + '/nickname').once('value').then(snap => {
            const name = snap.val() || "User";
            if (this.headerNickname) this.headerNickname.textContent = name;
            const userNicknameDisplay = document.getElementById('user-nickname-display');
            if (userNicknameDisplay) userNicknameDisplay.textContent = name;

            // Update initials
            const initial = name.charAt(0).toUpperCase();
            if (this.headerAvatarInitial) this.headerAvatarInitial.textContent = initial;
            if (this.settingsAvatarInitial) this.settingsAvatarInitial.textContent = initial;

            // Update input
            const nickInput = document.getElementById('settings-nickname');
            if (nickInput) nickInput.value = name;

            // Now fetch avatar
            return this.db.db.ref('users/' + userId + '/avatar').once('value');
        }).then(snap => {
            const avatarBase64 = snap.val();
            if (avatarBase64) {
                if (this.headerAvatarImg) {
                    this.headerAvatarImg.src = avatarBase64;
                    this.headerAvatarImg.classList.remove('hidden');
                }
                if (this.settingsAvatarPreview) {
                    this.settingsAvatarPreview.src = avatarBase64;
                    this.settingsAvatarPreview.style.display = 'block';
                }
                if (this.btnDeleteAvatar) this.btnDeleteAvatar.style.display = 'block';
            } else {
                this.resetAvatarUI();
            }
        });
    }

    initAvatarUpload() {
        if (this.avatarInput) {
            this.avatarInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (file.size > this.MAX_AVATAR_SIZE_BYTES) {
                    alert("Файл слишком большой. Максимальный размер 2МБ.");
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64String = event.target.result;

                    // Update UI immediately (preview)
                    if (this.headerAvatarImg) this.headerAvatarImg.src = base64String;
                    if (this.settingsAvatarPreview) {
                        this.settingsAvatarPreview.src = base64String;
                        this.settingsAvatarPreview.style.display = 'block';
                        if (this.settingsAvatarPlaceholder) {
                            this.settingsAvatarPlaceholder.style.display = 'none';
                        }
                    }

                    // Save to DB
                    const userId = firebase.auth().currentUser.uid;
                    this.db.db.ref('users/' + userId + '/avatar').set(base64String).then(() => {
                        console.log("Avatar saved!");
                        if (this.btnDeleteAvatar) this.btnDeleteAvatar.style.display = 'block';
                    }).catch(err => {
                        console.error("Error saving avatar:", err);
                        alert("Ошибка сохранения аватара.");
                    });
                };
                reader.readAsDataURL(file);
            };
        }

        if (this.btnDeleteAvatar) {
            this.btnDeleteAvatar.onclick = async () => {
                if (confirm("Удалить фото профиля?")) {
                    try {
                        const userId = firebase.auth().currentUser.uid;
                        await this.db.db.ref('users/' + userId + '/avatar').remove();
                        this.resetAvatarUI();
                    } catch (err) {
                        console.error("Error deleting avatar:", err);
                        alert("Ошибка при удалении аватара.");
                    }
                }
            };
        }
    }

    resetAvatarUI() {
        if (this.headerAvatarImg) {
            this.headerAvatarImg.src = "";
            this.headerAvatarImg.classList.add('hidden');
        }
        if (this.settingsAvatarPreview) {
            this.settingsAvatarPreview.src = "";
            this.settingsAvatarPreview.style.display = 'none';
        }
        if (this.btnDeleteAvatar) {
            this.btnDeleteAvatar.style.display = 'none';
        }

        // Refresh initials
        const name = this.headerNickname ? this.headerNickname.textContent : "User";
        const initial = (name || "U").charAt(0).toUpperCase();
        if (this.headerAvatarInitial) this.headerAvatarInitial.textContent = initial;
        if (this.settingsAvatarInitial) this.settingsAvatarInitial.textContent = initial;
    }

    // --- PROFILE ACTIONS ---
    initProfileActions() {
        this.setupSettingsAction('settings-nickname', 'btn-update-nickname', async (nick) => {
            await this.db.db.ref(`users/${this.db.userId}/nickname`).set(nick);
            const userNicknameDisplay = document.getElementById('user-nickname-display');
            if (userNicknameDisplay) userNicknameDisplay.textContent = nick;
            if (this.headerNickname) this.headerNickname.textContent = nick;

            // Update initials immediately
            const initial = nick.charAt(0).toUpperCase();
            if (this.headerAvatarInitial) this.headerAvatarInitial.textContent = initial;
            if (this.settingsAvatarInitial) this.settingsAvatarInitial.textContent = initial;

            alert("Никнейм изменен.");
            return true;
        });

        this.setupSettingsAction('settings-email', 'btn-update-email', async (email) => {
            const user = firebase.auth().currentUser;
            if (user) {
                try {
                    await user.updateEmail(email);
                    alert("Email изменен.");
                    return true;
                } catch (e) {
                    alert("Ошибка: " + e.message);
                    return false;
                }
            }
            return false;
        });

        this.setupSettingsAction('settings-password', 'btn-update-password', async (pass) => {
            const user = firebase.auth().currentUser;
            if (user) {
                try {
                    await user.updatePassword(pass);
                    alert("Пароль изменен.");
                    return true;
                } catch (e) {
                    alert("Ошибка: " + e.message);
                    return false;
                }
            }
            return false;
        });

        const btnDeleteAccount = document.getElementById('btn-delete-account');
        if (btnDeleteAccount) {
            btnDeleteAccount.onclick = async () => {
                const user = firebase.auth().currentUser;
                if (user && confirm("ВНИМАНИЕ: Это полностью удалит ваш аккаунт и ВСЕ данные. Вы точно уверены?")) {
                    try {
                        await this.db.db.ref(`users/${this.db.userId}`).remove();
                        await user.delete();
                        alert("Аккаунт удален.");
                    } catch (e) {
                        alert("Для удаления аккаунта требуется недавний вход. Пожалуйста, перезайдите и попробуйте снова.");
                    }
                }
            };
        }

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.onclick = () => firebase.auth().signOut();
        }
    }

    setupSettingsAction(inputId, btnId, updateFn) {
        const input = document.getElementById(inputId);
        const btn = document.getElementById(btnId);
        if (!input || !btn) return;

        input.oninput = () => {
            btn.disabled = input.value.trim() === '';
        };

        btn.onclick = async () => {
            const value = input.value.trim();
            if (value) {
                const success = await updateFn(value);
                if (success) {
                    input.value = '';
                    btn.disabled = true;
                }
            }
        };
    }

    // --- DATA ACTIONS ---
    initDataActions() {
        const btnResetSessProg = document.getElementById('btn-reset-session-progress');
        if (btnResetSessProg) {
            btnResetSessProg.onclick = () => this.db.resetProgressOnly();
        }

        const btnClearDict = document.getElementById('btn-clear-dictionary');
        if (btnClearDict) {
            btnClearDict.onclick = () => this.db.clearAllWords();
        }
    }

    // --- SETTINGS TABS ---
    initSettingsTabs() {
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.add('hidden'));
                const targetId = tab.getAttribute('data-target');
                document.getElementById(targetId).classList.remove('hidden');
            };
        });
    }
}

// Export for use in main app
window.SettingsModule = new SettingsModule();
