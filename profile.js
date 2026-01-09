// Profile Module - Handles profile view, stats, and charts

class ProfileModule {
    constructor() {
        this.db = null;
        this.user = null;
        this.wordsCache = [];
        this.viewProfile = null; // Container
        this.statsData = {};
        this.avatarUrl = null;
    }

    init(dbInstance, user, wordsCache) {
        this.db = dbInstance;
        this.user = user;
        this.wordsCache = wordsCache || [];
        this.viewProfile = document.getElementById('view-profile');
        if (this.user) {
            this.loadStats();
        }
    }

    updateStats(words) {
        this.wordsCache = words;
        if (this.viewProfile && !this.viewProfile.classList.contains('hidden')) {
            // Reload persistent stats too in case they changed
            this.loadStats();
        }
    }

    async loadStats() {
        if (!this.user || !this.db) return;
        try {
            // Load Daily Stats
            const refStats = this.db.db.ref(`users/${this.user.uid}/stats/daily`);
            const snapStats = await refStats.once('value');
            this.statsData = snapStats.val() || {};

            // Load Avatar & Nickname
            const refUser = this.db.db.ref(`users/${this.user.uid}`);
            const snapUser = await refUser.once('value');
            const userData = snapUser.val() || {};
            this.avatarUrl = userData.avatar;
            this.user.nickname = userData.nickname;

            this.renderProfile();
        } catch (e) {
            console.error("Failed to load profile data:", e);
        }
    }

    renderProfile() {
        if (!this.viewProfile) return;

        // Calculate Stats
        const totalWords = this.wordsCache.length;
        let mastered = 0;
        let learned = 0; // > 0 interval

        this.wordsCache.forEach(w => {
            const p = w.progress_global;
            if (p) {
                if (p.interval >= 12) mastered++;
                if (p.interval > 0) learned++;
            }
        });

        // TIME CALCULATION (Real)
        const totalSeconds = Object.values(this.statsData).reduce((a, b) => a + b, 0);

        let timeDisplay = "";
        if (totalSeconds < 60) {
            timeDisplay = `${totalSeconds} сек`;
        } else if (totalSeconds < 3600) {
            timeDisplay = `${Math.floor(totalSeconds / 60)} мин`;
        } else {
            timeDisplay = `${(totalSeconds / 3600).toFixed(1)} ч`;
        }

        const masteryPercent = totalWords === 0 ? 0 : Math.round((mastered / totalWords) * 100);

        // Chart Data
        const timeStats = this.getLast7DaysTimeStats();

        this.viewProfile.innerHTML = `
            <div class="profile-header-card">
                <div class="profile-avatar-large">
                    <img src="${this.getAvatarUrl()}" alt="Profile">
                </div>
                <div class="profile-info">
                    <div class="profile-name-row">
                        <h2 class="profile-nickname" id="user-nickname-display">${this.user.nickname || 'Пользователь'}</h2>
                        <div class="profile-mastery-badge">${masteryPercent}% Mastery</div>
                    </div>
                    <div class="profile-meta-row">
                         <div class="profile-lang-badge">
                            <span>🇩🇪</span>
                            <span>Немецкий</span>
                        </div>
                        <div class="profile-join-date">
                            <span>На сайте с <strong>${this.getJoinDate()}</strong></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Main Stats Grid -->
            <div class="stats-grid-container">
                <div class="stat-box">
                    <div class="stat-box-icon" style="background: rgba(239, 68, 68, 0.2); color: #f87171;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                    </div>
                    <div class="stat-value">${timeDisplay}</div>
                    <div class="stat-label">Время в обучении</div>
                </div>
                
                <div class="stat-box">
                    <div class="stat-box-icon" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                    </div>
                    <div class="stat-value">${totalWords}</div>
                    <div class="stat-label">Слов в словаре</div>
                </div>

                <div class="stat-box">
                    <div class="stat-box-icon" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                    <div class="stat-value">${mastered}</div>
                    <div class="stat-label">Полностью освоено</div>
                </div>

                <div class="stat-box">
                    <div class="stat-box-icon" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                    </div>
                    <div class="stat-value">${learned}</div>
                    <div class="stat-label">В процессе изучения</div>
                </div>
            </div>

            <div class="charts-row">
                <div class="chart-card">
                    <div class="chart-title">Время обучения (мин)</div>
                    <div style="flex: 1; min-height: 0; position: relative;">
                         ${this.generateTimeBarChart(timeStats)}
                    </div>
                </div>
                <div class="chart-card">
                    <div class="chart-title">Прогресс слов</div>
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
                        <div class="progress-circle-container">
                            <svg class="progress-circle-svg">
                                <circle class="progress-circle-bg" cx="100" cy="100" r="90"></circle>
                                <circle class="progress-circle-fg" cx="100" cy="100" r="90" style="stroke-dashoffset: ${565 - (565 * masteryPercent / 100)}"></circle>
                            </svg>
                            <div class="progress-stats-center">
                                <div class="progress-percent">${masteryPercent}%</div>
                                <div class="progress-label">Готово</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getAvatarUrl() {
        if (this.avatarUrl) return this.avatarUrl;
        if (this.user.photoURL) return this.user.photoURL;
        // Construct SVG avatar if not available
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='0' y='0' width='24' height='24' fill='%231e293b'/%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ccircle cx='12' cy='7' r='4' stroke='%23cbd5e1' stroke-width='2'/%3E%3C/svg%3E`;
    }

    getJoinDate() {
        if (this.user.metadata && this.user.metadata.creationTime) {
            return new Date(this.user.metadata.creationTime).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return "Недавно";
    }

    getLast7DaysTimeStats() {
        const days = [];
        const today = new Date();
        // Generate last 7 days keys
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateKey = d.toISOString().split('T')[0];
            const seconds = this.statsData[dateKey] || 0;

            days.push({
                date: d,
                label: d.toLocaleDateString('ru-RU', { weekday: 'short' }),
                seconds: seconds
            });
        }
        return days;
    }

    generateTimeBarChart(data) {
        // SVG Bar Chart
        const w = 600;
        const h = 200;
        const paddingLeft = 30;
        const paddingBottom = 20;
        const paddingTop = 20;

        // Convert seconds to minutes for visualization
        const minutesData = data.map(d => ({ ...d, val: Math.round(d.seconds / 60) }));
        const maxVal = Math.max(...minutesData.map(d => d.val), 10); // Minimum 10 mins for scale

        // Scale functions
        const barWidth = (w - paddingLeft) / data.length * 0.5;
        const spacing = (w - paddingLeft) / data.length;

        const getY = (val) => h - paddingBottom - ((val / maxVal) * (h - paddingBottom - paddingTop));
        const getX = (i) => paddingLeft + (i * spacing) + (spacing - barWidth) / 2;

        const bars = minutesData.map((d, i) => {
            const x = getX(i);
            const y = getY(d.val);
            const height = (h - paddingBottom) - y;
            const color = d.val > 0 ? 'var(--secondary)' : 'rgba(255,255,255,0.08)';
            return `
                <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" fill="${color}" rx="6">
                    <title>${d.val} мин</title>
                </rect>
            `;
        }).join('');

        const labels = minutesData.map((d, i) => {
            return `<text x="${getX(i) + barWidth / 2}" y="${h - 2}" font-size="14" font-weight="500" fill="rgba(255,255,255,0.7)" text-anchor="middle">${d.label}</text>`;
        }).join('');

        // Grid lines
        const grid = [0, 0.5, 1].map(pct => {
            const val = maxVal * pct;
            const y = getY(val);
            return `
                <line x1="${paddingLeft}" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,255,255,0.1)" stroke-dasharray="4" />
                <text x="${paddingLeft - 8}" y="${y + 5}" font-size="12" font-weight="600" fill="rgba(255,255,255,0.5)" text-anchor="end">${Math.round(val)}</text>
            `;
        }).join('');

        return `
            <svg viewBox="0 0 ${w} ${h}" class="activity-chart-svg" preserveAspectRatio="none">
                ${grid}
                ${bars}
                ${labels}
            </svg>
        `;
    }
}

window.ProfileModule = new ProfileModule();
