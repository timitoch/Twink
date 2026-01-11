// Profile Module - Handles profile view, stats, and charts

class ProfileModule {
    constructor() {
        this.db = null;
        this.user = null;
        this.wordsCache = [];
        this.viewProfile = null; // Container
        this.statsData = {};
        this.avatarUrl = null;
        this.chartDate = new Date(); // Current month for chart
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

    formatTime(seconds, includeSeconds = true) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;

        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}${includeSeconds ? ':' + s.toString().padStart(2, '0') : ''}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    getPeriodSeconds(period) {
        const logicalNow = new Date(Date.now() - 6 * 60 * 60 * 1000);
        let startLogical = new Date(logicalNow);

        switch (period) {
            case 'week':
                const day = logicalNow.getDay();
                const diff = logicalNow.getDate() - day + (day === 0 ? -6 : 1); // Monday
                startLogical.setDate(diff);
                break;
            case 'month':
                startLogical.setDate(1);
                break;
            case 'year':
                startLogical.setMonth(0, 1);
                break;
            default:
                return Object.values(this.statsData).reduce((a, b) => a + (typeof b === 'number' ? b : (b.seconds || 0)), 0);
        }

        const startKey = startLogical.toISOString().split('T')[0];

        return Object.entries(this.statsData).reduce((total, [dateStr, data]) => {
            if (dateStr >= startKey) {
                total += (typeof data === 'number' ? data : (data.seconds || 0));
            }
            return total;
        }, 0);
    }

    getStreaks() {
        const dates = Object.keys(this.statsData)
            .filter(d => (typeof this.statsData[d] === 'number' ? this.statsData[d] : this.statsData[d].seconds) > 0)
            .sort();
        if (dates.length === 0) return { current: 0, best: 0 };

        let best = 0;
        let current = 0;
        let temp = 0;

        const today = DateUtils.getLogicalDateKey();
        const yesterdayDate = new Date(Date.now() - 6 * 60 * 60 * 1000);
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = yesterdayDate.toISOString().split('T')[0];

        // Calculate Best
        for (let i = 0; i < dates.length; i++) {
            if (i > 0) {
                const d1 = new Date(dates[i - 1]);
                const d2 = new Date(dates[i]);
                const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
                if (diff === 1) {
                    temp++;
                } else {
                    temp = 1;
                }
            } else {
                temp = 1;
            }
            if (temp > best) best = temp;
        }

        // Calculate Current
        const lastDate = dates[dates.length - 1];
        if (lastDate === today || lastDate === yesterday) {
            temp = 1;
            for (let i = dates.length - 1; i > 0; i--) {
                const d1 = new Date(dates[i - 1]);
                const d2 = new Date(dates[i]);
                const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
                if (diff === 1) {
                    temp++;
                } else {
                    break;
                }
            }
            current = temp;
        }

        return { current, best };
    }

    renderProfile() {
        if (!this.viewProfile) return;

        const totalWords = this.wordsCache.length;
        let mastered = 0;
        let learned = 0;
        let activeCount = 0;
        this.wordsCache.forEach(w => {
            const p = w.progress_global;
            if (p) {
                if (p.interval >= 12) mastered++;
                if (p.interval > 0) learned++;
                if (p.isActive) activeCount++;
            }
        });

        const streaks = this.getStreaks();
        const timeWeek = this.getPeriodSeconds('week');
        const timeMonth = this.getPeriodSeconds('month');
        const timeYear = this.getPeriodSeconds('year');
        const timeAll = this.getPeriodSeconds('all');

        const masteryPercent = totalWords === 0 ? 0 : Math.round((mastered / totalWords) * 100);

        this.viewProfile.innerHTML = `
            <div class="profile-header-card">
                <div class="avatar-container-outer">
                    <div class="avatar-ring-svg">
                        <svg viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4"></circle>
                            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--secondary)" stroke-width="4" 
                                stroke-dasharray="${2 * Math.PI * 45}" 
                                stroke-dashoffset="${2 * Math.PI * 45 * (1 - masteryPercent / 100)}" 
                                stroke-linecap="round"
                                style="transition: stroke-dashoffset 1s ease-out">
                            </circle>
                        </svg>
                    </div>
                    <div class="profile-avatar-large">
                        <img src="${this.getAvatarUrl()}" alt="Profile">
                    </div>
                </div>
                
                <div class="profile-content-new">
                    <div class="profile-top-row">
                        <h2 class="profile-nickname">${this.user.nickname || 'Пользователь'}</h2>
                        <div class="profile-header-badges">
                            <div class="glass-badge highlight-level" title="Прогресс уровней (идеальные слова):&#10;A1: 500+&#10;A2: 1000+&#10;B1: 2000+&#10;B2: 4000+&#10;C1: 8000+&#10;C2: 16000+">
                                <span class="badge-icon">
                                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
                                </span>
                                <span class="badge-text" style="display: flex; align-items: center; gap: 4px;">
                                    ${this.getLevel(mastered)}
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                </span>
                            </div>
                            <div class="glass-badge">
                                <span class="badge-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                </span>
                                <span class="badge-text">German</span>
                            </div>
                        </div>
                    </div>

                    <div class="profile-mastery-section">
                        <div class="mastery-header-row">
                            <span class="mastery-title">Mastery Level</span>
                            <span class="mastery-percent-num">${masteryPercent}%</span>
                        </div>
                        <div class="mastery-progress-track">
                            <div class="mastery-progress-fill" style="width: ${masteryPercent}%"></div>
                        </div>
                        <div class="profile-join-meta">
                            На сайте с <strong>${this.getJoinDate()}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Streak Section -->
            <div class="stats-group-container">
                <div class="stats-group-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    <span>Streak</span>
                </div>
                <div class="streak-flex">
                    <div class="streak-item">
                        <div class="streak-val">${streaks.current} DAYS</div>
                        <div class="streak-lbl">Current</div>
                    </div>
                    <div class="streak-item">
                        <div class="streak-val">${streaks.best} DAYS</div>
                        <div class="streak-lbl">Best</div>
                    </div>
                </div>
            </div>

            <!-- Total Time Section -->
            <div class="stats-group-container">
                <div class="stats-group-header">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="8" y1="21" x2="8" y2="3"></line><line x1="16" y1="21" x2="16" y2="3"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="16" x2="21" y2="16"></line></svg>
                    <span>Total time</span>
                </div>
                <div class="stats-rows">
                    <div class="stat-row-item"><span>This week</span> <strong>${this.formatTime(timeWeek)}</strong></div>
                    <div class="stat-row-item"><span>This month</span> <strong>${this.formatTime(timeMonth)}</strong></div>
                    <div class="stat-row-item"><span>This year</span> <strong>${this.formatTime(timeYear)}</strong></div>
                    <div class="stat-row-item"><span>All</span> <strong>${this.formatTime(timeAll)}</strong></div>
                </div>
            </div>

            <!-- Monthly Chart -->
            <div class="stats-group-container chart-container-large">
                <div class="chart-nav-header">
                    <button onclick="window.ProfileModule.prevMonth()" class="chart-nav-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <div class="chart-month-title">
                        <div class="month-name">${this.chartDate.toLocaleString('ru-RU', { month: 'long' })}</div>
                        <div class="year-name">${this.chartDate.getFullYear()}</div>
                    </div>
                    <button onclick="window.ProfileModule.nextMonth()" class="chart-nav-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
                <div class="monthly-bar-chart">
                    ${this.generateMonthlyChart()}
                </div>
            </div>
            
            <div class="stats-grid-container" style="margin-top: 2rem;">
                <div class="stat-box">
                    <div class="stat-value">${totalWords}</div>
                    <div class="stat-label">Слов в словаре</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value" style="color: var(--secondary);">${activeCount}</div>
                    <div class="stat-label" style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--secondary); opacity: 0.8;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                        Активные слова
                    </div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${mastered}</div>
                    <div class="stat-label" style="display:flex; align-items:center; justify-content:flex-start; gap:4px;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--secondary); opacity: 0.8;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        Идеально
                    </div>
                </div>
            </div>
        `;
    }

    prevMonth() {
        this.chartDate.setMonth(this.chartDate.getMonth() - 1);
        this.renderProfile();
    }

    nextMonth() {
        this.chartDate.setMonth(this.chartDate.getMonth() + 1);
        this.renderProfile();
    }

    generateMonthlyChart() {
        const year = this.chartDate.getFullYear();
        const month = this.chartDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let maxSeconds = 0;
        const days = [];

        for (let i = 1; i <= daysInMonth; i++) {
            const dateKey = `${year}-${(month + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            const data = this.statsData[dateKey];
            const secs = typeof data === 'number' ? data : (data?.seconds || 0);
            days.push({ day: i, seconds: secs });
            if (secs > maxSeconds) maxSeconds = secs;
        }

        const effectiveMax = maxSeconds > 0 ? maxSeconds : 3600;

        return days.map(d => {
            // Cap height at 75% to leave room for the label above the tallest bar
            const heightPct = (d.seconds / effectiveMax) * 75;
            const timeStr = d.seconds > 0 ? this.formatTime(d.seconds, false) : '';
            const isActive = d.seconds > 0 ? 'active' : '';

            return `
                <div class="bar-wrapper">
                    <div class="bar-pillar ${isActive}" style="height: ${Math.max(heightPct, 1)}%"></div>
                    <div class="bar-day-label">${d.day}</div>
                    <div class="bar-value-hint" style="bottom: calc(${heightPct}% + 25px)">${timeStr}</div>
                </div>
            `;
        }).join('');
    }

    getAvatarUrl() {
        if (this.avatarUrl) return this.avatarUrl;
        if (this.user.photoURL) return this.user.photoURL;
        // Construct SVG avatar if not available
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='0' y='0' width='24' height='24' fill='%231e293b'/%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' stroke='%23cbd5e1' stroke-width='2'/%3E%3Ccircle cx='12' cy='7' r='4' stroke='%23cbd5e1' stroke-width='2'/%3E%3C/svg%3E`;
    }

    getLevel(mastered) {
        if (mastered >= 16000) return 'C2';
        if (mastered >= 8000) return 'C1';
        if (mastered >= 4000) return 'B2';
        if (mastered >= 2000) return 'B1';
        if (mastered >= 1000) return 'A2';
        if (mastered >= 500) return 'A1';
        return 'A0';
    }

    getJoinDate() {
        if (this.user.metadata && this.user.metadata.creationTime) {
            return new Date(this.user.metadata.creationTime).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        return "Недавно";
    }

    getLast7DaysTimeStats() {
        const days = [];
        const logicalToday = new Date(Date.now() - 6 * 60 * 60 * 1000);
        // Generate last 7 days keys
        for (let i = 6; i >= 0; i--) {
            const d = new Date(logicalToday);
            d.setDate(logicalToday.getDate() - i);
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
