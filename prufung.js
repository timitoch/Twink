// Prüfung Module - Handles all exam/test functionality
// Extracted from StudyModule for separation of concerns

class PrufungModule {
    constructor(studyModule) {
        this.study = studyModule;

        // DOM Elements
        this.viewExam = document.getElementById('view-exam');
        this.btnExitExam = document.getElementById('btn-exit-exam');
        this.examProgressText = document.getElementById('exam-progress-text');
        this.examQuestionText = document.getElementById('exam-question-text');
        this.examQuestionInfo = document.getElementById('exam-question-info');
        this.examInput = document.getElementById('exam-input');
        this.examFeedback = document.getElementById('exam-feedback');
        this.btnExamCheck = document.getElementById('btn-exam-check');
        this.btnExamNext = document.getElementById('btn-exam-next');
        this.currentExamSession = null;
    }

    // --- EXAM SESSION LOGIC ---
    startExamSession() {
        const now = Date.now();
        const examWords = this.study.allWordsCache.filter(w =>
            (w.progress_global?.excellentStreak || 0) >= 9 &&
            !w.progress_global?.isActive &&
            (!w.progress_global?.nextDate || w.progress_global.nextDate <= now)
        );

        if (examWords.length === 0) {
            alert("Нет слов для экзамена!");
            return;
        }

        this.currentExamSession = {
            queue: this.study.shuffleArray([...examWords]),
            currentIndex: 0,
            currentWord: null
        };

        // Switch to exam view
        if (window.switchView) window.switchView(this.viewExam);

        // Bind exit button
        if (this.btnExitExam) {
            this.btnExitExam.onclick = () => {
                if (confirm('Вы уверены, что хотите выйти из экзамена?')) {
                    this.study.stopTracking();
                    this.currentExamSession = null;
                    if (window.switchView) window.switchView(this.study.viewStudy);
                    this.study.renderStudyDashboard();
                }
            };
        }

        // Bind help button
        const btnHelp = document.getElementById('btn-exam-help');
        const viewHelp = document.getElementById('view-exam-help');
        const btnBackHelp = document.getElementById('btn-back-from-help');

        if (btnHelp && viewHelp) {
            btnHelp.onclick = () => {
                this.viewExam.classList.add('hidden');
                viewHelp.classList.remove('hidden');
                document.body.classList.remove('no-scroll');
            };
        }

        const closeHelp = () => {
            viewHelp.classList.add('hidden');
            this.viewExam.classList.remove('hidden');
            document.body.classList.add('no-scroll');
        };

        if (btnBackHelp) btnBackHelp.onclick = closeHelp;

        this.showNextExamQuestion();
        this.study.startTracking();
    }

    showNextExamQuestion() {
        if (!this.currentExamSession) return;

        if (this.currentExamSession.currentIndex >= this.currentExamSession.queue.length) {
            // Exam finished
            alert("Экзамен завершен!");
            this.study.stopTracking();
            this.currentExamSession = null;
            if (window.switchView) window.switchView(this.study.viewStudy);
            this.study.renderStudyDashboard();
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

        // Hints Logic
        let hints = [];
        const germanWord = word.word;
        const parts = germanWord.split(',').map(p => p.trim());
        const hasArticle = /\b(der|die|das)\b/i.test(germanWord);

        // Helper to check for 'in' ending on the noun (ignoring article)
        const endsInIn = (str) => {
            const clean = str.replace(/\b(der|die|das)\b/gi, '').trim();
            return clean.toLowerCase().endsWith('in');
        };

        if (parts.length === 2 && parts[1].startsWith('-')) {
            // Pattern: "die Restaurierung, -en"
            hints.push("________");
            if (endsInIn(parts[0])) hints.push("(жен. р.)");
            hints.push("(plural)");
        } else {
            // Process parts for gender/plural markers
            parts.forEach((p, idx) => {
                const isFirst = idx === 0;
                const pIn = endsInIn(p);
                const pLower = p.toLowerCase();
                const isPlural = pLower.includes('die') && !pLower.includes('der') && !pLower.includes('das') && !isFirst && hasArticle;

                if (pIn) {
                    hints.push("(жен. р.)");
                } else if (isPlural || (hasArticle && idx > 0)) {
                    hints.push("(plural)");
                } else {
                    hints.push("________");
                }
            });

            // Add verb form placeholders from info1
            if (word.info1) {
                hints.push("Präsens", "Präteritum", "Partizip II");
            }
        }

        // Phrase logic: If it's a phrase without specific noun markers, show word count
        // We only do this if the hints consist solely of "________" or similar generic markers
        const onlyGeneric = hints.every(h => h === "________");
        if (onlyGeneric) {
            let cleanForCount = germanWord.replace(/\s*\(.*?\)/g, '').trim();
            // Count words (treat articles as words here to be precise about what user needs to type)
            const wordCount = cleanForCount.split(/\s+/).filter(s => s.length > 0).length;
            if (wordCount > 1) {
                hints = [`Введите ${wordCount} слова/слов`];
            }
        }

        const hint = hints.join(', ');

        // Display hint
        if (this.examQuestionInfo) {
            this.examQuestionInfo.textContent = hint;
            // FIXED: Do not show word.info1 (extra info) here
        }

        // Reset input
        if (this.examInput) {
            this.examInput.value = '';
            this.examInput.disabled = false;
            this.examInput.style.borderColor = 'var(--border)';
            this.examInput.style.height = 'auto'; // Reset height
            this.examInput.focus();

            // Auto-resize handler
            this.examInput.oninput = () => {
                this.examInput.style.height = 'auto';
                this.examInput.style.height = (this.examInput.scrollHeight) + 'px';
            };
        }

        // Reset buttons
        if (this.btnExamCheck) {
            this.btnExamCheck.classList.remove('hidden');
            this.btnExamCheck.disabled = false;
        }
        if (this.btnExamNext) this.btnExamNext.classList.add('hidden');
        if (this.examFeedback) this.examFeedback.classList.add('hidden');
        const btnOverride = document.getElementById('btn-exam-override');
        if (btnOverride) btnOverride.classList.add('hidden');
        const btnUndo = document.getElementById('btn-exam-undo-override');
        if (btnUndo) btnUndo.classList.add('hidden');

        // Bind check button
        if (this.btnExamCheck) {
            this.btnExamCheck.onclick = () => this.checkExamAnswer();
        }

        // Allow Enter key to submit
        if (this.examInput) {
            this.examInput.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); // Prevent newline
                    if (!this.btnExamCheck.classList.contains('hidden')) {
                        this.checkExamAnswer();
                    } else if (!this.btnExamNext.classList.contains('hidden')) {
                        this.showNextExamQuestion();
                    }
                }
            };
        }
    }

    normalizeAnswer(str) {
        // Remove content in parentheses FIRST (e.g. "zittern (hat gezittert)" -> "zittern")
        let cleaned = str.replace(/\([^)]*\)/g, '');

        // Remove articles, then remove ALL non-alphanumeric chars
        return cleaned.toLowerCase()
            .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/gi, '') // Remove articles
            .replace(/[^a-z0-9äöüß]/gi, ''); // Remove everything else
    }

    // Helper to extract article and word content
    extractArticle(str) {
        const cleaned = str.replace(/\([^)]*\)/g, '').trim();
        const parts = cleaned.split(/\s+/);
        const articles = ["der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einem", "einen"];

        if (parts.length > 0 && articles.includes(parts[0].toLowerCase())) {
            return {
                article: parts[0].toLowerCase(),
                word: parts.slice(1).join(" ")
            };
        }
        return { article: null, word: cleaned };
    }

    async checkExamAnswer() {
        if (!this.currentExamSession || !this.currentExamSession.currentWord) return;

        const word = this.currentExamSession.currentWord;
        const userAnswer = this.examInput.value.trim();
        const correctAnswer = word.word;

        // 1. Content Check
        let isContentCorrect = false;
        let sequenceError = false;
        let partialMatch = false;

        if (word.info1) {
            // Unit-based comparison: internal order of words in each form must be preserved.
            // But the forms themselves can appear in any order in the user's answer.
            const clean = (str) => {
                return str.replace(/\([^)]*\)/g, '')
                    .toLowerCase()
                    .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/gi, '')
                    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
                    .trim()
                    .replace(/\s+/g, ' ');
            };

            const unitsCorrect = (correctAnswer + "," + word.info1).split(',').map(u => u.trim()).filter(u => u.length > 0);
            const userClean = clean(userAnswer);

            const getVariants = (unitStr) => {
                if (!unitStr.includes('/')) return [{ text: clean(unitStr), partial: false }];
                const normUnit = unitStr.replace(/\s*\/\s*/g, '/');
                const tokens = normUnit.split(/\s+/);
                const slashIdx = tokens.findIndex(t => t.includes('/'));
                if (slashIdx === -1) return [{ text: clean(unitStr), partial: false }];
                const [opt1, opt2] = tokens[slashIdx].split('/');
                const build = (middle) => {
                    const t = [...tokens];
                    t[slashIdx] = middle;
                    return clean(t.join(' '));
                };
                return [
                    { text: build(opt1), partial: true },
                    { text: build(opt2), partial: true },
                    { text: build(`${opt1} ${opt2}`), partial: false },
                    { text: build(`${opt2} ${opt1}`), partial: false }
                ];
            };

            const checkPermutation = (remainder, units) => {
                if (units.length === 0) return { ok: true, partial: false };
                for (let i = 0; i < units.length; i++) {
                    const variants = getVariants(units[i]);
                    for (const v of variants) {
                        const esc = v.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(^|\\s)${esc}(\\s|$)`);
                        if (regex.test(remainder)) {
                            const newRemainder = remainder.replace(regex, ' ').trim().replace(/\s+/g, ' ');
                            const newUnits = units.filter((_, idx) => idx !== i);
                            const res = checkPermutation(newRemainder, newUnits);
                            if (res.ok) return { ok: true, partial: v.partial || res.partial };
                        }
                    }
                }
                return { ok: false, partial: false };
            };
            const result = checkPermutation(userClean, unitsCorrect);
            isContentCorrect = result.ok;
            partialMatch = result.partial;

            // 1.1 Sequence Error Check (Purple color case)
            if (!isContentCorrect) {
                const tokenize = (str) => {
                    return str.replace(/\([^)]*\)/g, '')
                        .toLowerCase()
                        .replace(/\b(der|die|das|den|dem|des|ein|eine|einer|einem|einen)\b/gi, '')
                        .split(/[^a-z0-9äöüß]+/gi)
                        .filter(t => t.length > 0)
                        .sort();
                };
                const userTokens = tokenize(userAnswer);
                const correctTokens = tokenize(correctAnswer + " " + word.info1);
                if (JSON.stringify(userTokens) === JSON.stringify(correctTokens)) {
                    sequenceError = true;
                }
            }
        } else {
            // Check for "Noun, -suffix" Pattern
            const correctParts = correctAnswer.split(',').map(p => p.trim());

            if (correctParts.length === 2 && correctParts[1].startsWith('-')) {
                // Special validation logic
                const singularPart = correctParts[0];            // "die Restaurierung"
                const suffix = correctParts[1].substring(1);     // "en" (without hyphen)

                // Extract Noun Base
                const articleObj = this.extractArticle(singularPart);
                const nounBase = articleObj.word;                // "Restaurierung"

                // Construct Valid Variants to match against normalized input
                const variants = [];

                // 1. Singular Only ("die Restaurierung")
                variants.push(singularPart);

                // 2. Singular + Suffix ("die Restaurierung en")
                variants.push(`${singularPart} ${suffix}`);

                // 3. Singular + Hyphen Suffix ("die Restaurierung -en") - Matches correct string essentially
                variants.push(correctAnswer.replace(',', ''));

                // 4. Singular + Full Plural ("die Restaurierung Restaurierungen")
                const pluralNoun = nounBase + suffix; // Simple concatenation logic
                variants.push(`${singularPart} ${pluralNoun}`);

                // 5. Singular + Full Plural with Article ("die Restaurierung die Restaurierungen")
                if (articleObj.article) {
                    variants.push(`${singularPart} ${articleObj.article} ${pluralNoun}`);
                }

                // Normalization helper
                const norm = (s) => this.normalizeAnswer(s);
                const userNorm = norm(userAnswer);

                isContentCorrect = variants.some(v => norm(v) === userNorm);

            } else {
                // Standard Normalization Match
                const normUser = this.normalizeAnswer(userAnswer);
                const normCorrect = this.normalizeAnswer(correctAnswer);
                isContentCorrect = normUser === normCorrect;
            }
        }

        // 2. Article Check (Only if content matched)
        let articleError = false;

        if (isContentCorrect) {
            const correctParts = correctAnswer.split(',');
            const userParts = userAnswer.split(',');

            // We iterate over the correct parts to verify articles
            for (let i = 0; i < correctParts.length; i++) {
                // If user excluded a part entirely (e.g. synonyms), we stop checking logic for that part
                // However, since content check passed, they likely have the content.
                if (i >= userParts.length) break;

                const cPart = this.extractArticle(correctParts[i]);
                const uPart = this.extractArticle(userParts[i]);

                if (cPart.article) {
                    if (i === 0) {
                        // First Article: MANDATORY
                        if (uPart.article !== cPart.article) {
                            articleError = true;
                        }
                    } else {
                        // Subsequent Articles: OPTIONAL (can be omitted, but if present must be correct)
                        // If user provided an article, strict check.
                        // If user provided NO article (uPart.article matches null), it avoids this check.
                        if (uPart.article && uPart.article !== cPart.article) {
                            articleError = true;
                        }
                    }
                }
            }
        }

        const isCorrect = isContentCorrect && !articleError;

        // Disable input and check button
        if (this.examInput) this.examInput.disabled = true;
        if (this.btnExamCheck) {
            this.btnExamCheck.classList.add('hidden');
            this.btnExamCheck.disabled = true;
        }

        // Build additional info HTML
        let extraHTML = '';
        if (this.examFeedback) {
            this.examFeedback.classList.remove('hidden');

            if (word.info2 || word.ex1 || word.ex2) {
                extraHTML = '<div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1); text-align: left; font-size: 0.9rem; opacity: 0.9;">';
                if (word.info2) extraHTML += `<div style="color: var(--text-muted); margin-bottom: 0.5rem;">${word.info2}</div>`;
                if (word.ex1) extraHTML += `<div style="color: var(--text-muted); font-style: italic; margin-bottom: 0.3rem;">• ${word.ex1}</div>`;
                if (word.ex2) extraHTML += `<div style="color: var(--text-muted); font-style: italic;">• ${word.ex2}</div>`;
                extraHTML += '</div>';
            }

            if (isCorrect) {
                if (partialMatch) {
                    this.examFeedback.style.background = 'rgba(59, 130, 246, 0.1)';
                    this.examFeedback.style.color = '#3b82f6';
                    this.examFeedback.style.border = '1px solid #3b82f6';
                    this.examFeedback.innerHTML = `✓ Почти правильно!<br><span style="color: var(--text-muted);">Эталон:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
                } else {
                    this.examFeedback.style.background = 'rgba(16, 185, 129, 0.1)';
                    this.examFeedback.style.color = 'var(--accent-bright)';
                    this.examFeedback.style.border = '1px solid var(--accent-bright)';
                    this.examFeedback.innerHTML = `✓ Правильно!${extraHTML}`;
                }
            } else if (articleError) {
                this.examFeedback.style.background = 'rgba(139, 92, 246, 0.1)';
                this.examFeedback.style.color = '#8b5cf6';
                this.examFeedback.style.border = '1px solid #8b5cf6';
                this.examFeedback.innerHTML = `Ошибка в артикле<br><span style="color: var(--text-muted);">Правильно:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
            } else if (sequenceError) {
                this.examFeedback.style.background = 'rgba(139, 92, 246, 0.1)';
                this.examFeedback.style.color = '#8b5cf6';
                this.examFeedback.style.border = '1px solid #8b5cf6';
                this.examFeedback.innerHTML = `Ошибка в последовательности<br><span style="color: var(--text-muted);">Правильно:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
            } else {
                this.examFeedback.style.background = 'rgba(239, 68, 68, 0.1)';
                this.examFeedback.style.color = '#ef4444';
                this.examFeedback.style.border = '1px solid #ef4444';
                this.examFeedback.innerHTML = `✗ Неправильно<br><span style="color: var(--text-muted);">Правильный ответ:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
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
                is_ideal: true,
                interval: 21,
                nextDate: Date.now() + (21 * 86400000),
                lastRating: 6,
                lastReviewed: Date.now()
            };
        } else {
            const deduction = (articleError || sequenceError) ? 1.5 : 3.0;
            if (score >= 10) {
                score = 10 - deduction;
            } else {
                score = Math.max(0, score - deduction);
            }
            // Ensure float precision
            score = parseFloat(score.toFixed(1));
            word.progress_global = {
                ...currentProgress,
                excellentStreak: score,
                isActive: false,
                is_ideal: false,
                interval: score >= 9 ? 7 : 1,
                nextDate: Date.now() + ((score >= 9 ? 7 : 1) * 86400000),
                lastRating: 2,
                lastReviewed: Date.now()
            };
        }

        // Show Next button
        if (this.btnExamNext) {
            this.btnExamNext.classList.remove('hidden');
            this.btnExamNext.onclick = () => {
                this.currentExamSession.currentIndex++;
                this.showNextExamQuestion();
            };
        }

        // Show Override Button if Incorrect AND user typed something
        if (!isCorrect) {
            const btnOverride = document.getElementById('btn-exam-override');
            // Only if user attempts an answer (len > 0)
            if (btnOverride && userAnswer.length > 0) {
                btnOverride.classList.remove('hidden');
                btnOverride.onclick = async () => {
                    // 1. Capture the "Incorrect" state (snapshot)
                    const incorrectState = JSON.parse(JSON.stringify(word.progress_global));

                    // 2. Set to Correct (Active)
                    word.progress_global = {
                        ...(word.progress_global || {}),
                        excellentStreak: 10,
                        isActive: true,
                        is_ideal: true,
                        interval: 21,
                        nextDate: Date.now() + (21 * 86400000),
                        lastRating: 6,
                        lastReviewed: Date.now()
                    };

                    // Update Feedback UI (Green) - DO THIS BEFORE AWAIT
                    if (this.examFeedback) {
                        this.examFeedback.style.background = 'rgba(16, 185, 129, 0.1)';
                        this.examFeedback.style.color = '#10b981';
                        this.examFeedback.style.border = '1px solid #10b981';
                        this.examFeedback.innerHTML = `✓ Исправлено: Засчитано как верно!${extraHTML}`;
                    }

                    // Hide Override, Show Undo
                    btnOverride.classList.add('hidden');
                    const btnUndo = document.getElementById('btn-exam-undo-override');
                    if (btnUndo) {
                        btnUndo.classList.remove('hidden');
                        btnUndo.onclick = async () => {
                            // REVERT to Incorrect
                            word.progress_global = incorrectState;

                            // Revert UI to Red OR Purple - DO THIS BEFORE AWAIT
                            if (this.examFeedback) {
                                if (isCorrect) {
                                    if (partialMatch) {
                                        this.examFeedback.style.background = 'rgba(59, 130, 246, 0.1)';
                                        this.examFeedback.style.color = '#3b82f6';
                                        this.examFeedback.style.border = '1px solid #3b82f6';
                                        this.examFeedback.innerHTML = `✓ Почти правильно!<br><span style="color: var(--text-muted);">Эталон:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
                                    } else {
                                        this.examFeedback.style.background = 'rgba(16, 185, 129, 0.1)';
                                        this.examFeedback.style.color = 'var(--accent-bright)';
                                        this.examFeedback.style.border = '1px solid var(--accent-bright)';
                                        this.examFeedback.innerHTML = `✓ Правильно!${extraHTML}`;
                                    }
                                } else if (articleError) {
                                    this.examFeedback.style.background = 'rgba(139, 92, 246, 0.1)';
                                    this.examFeedback.style.color = '#8b5cf6';
                                    this.examFeedback.style.border = '1px solid #8b5cf6';
                                    this.examFeedback.innerHTML = `Ошибка в артикле<br><span style="color: var(--text-muted);">Правильно:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
                                } else if (sequenceError) {
                                    this.examFeedback.style.background = 'rgba(139, 92, 246, 0.1)';
                                    this.examFeedback.style.color = '#8b5cf6';
                                    this.examFeedback.style.border = '1px solid #8b5cf6';
                                    this.examFeedback.innerHTML = `Ошибка в последовательности<br><span style="color: var(--text-muted);">Правильно:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
                                } else {
                                    this.examFeedback.style.background = 'rgba(239, 68, 68, 0.1)';
                                    this.examFeedback.style.color = '#ef4444';
                                    this.examFeedback.style.border = '1px solid #ef4444';
                                    this.examFeedback.innerHTML = `✗ Неправильно<br><span style="color: var(--text-muted);">Правильный ответ:</span> <strong style="color: var(--text-main);">${correctAnswer}${word.info1 ? ', ' + word.info1 : ''}</strong>${extraHTML}`;
                                }
                            }

                            // Toggle buttons back
                            btnUndo.classList.add('hidden');
                            btnOverride.classList.remove('hidden');

                            try { await this.study.db.updateProgress(word.id, 'progress_global', word.progress_global); } catch (e) { }
                        };
                    }

                    // Save to DB (Deferred after UI update)
                    try {
                        await this.study.db.updateProgress(word.id, 'progress_global', word.progress_global);
                    } catch (e) {
                        console.error('Override save/update error', e);
                    }
                };
            }
        }

        // Save to database
        try {
            await this.study.db.updateProgress(word.id, 'progress_global', word.progress_global);
        } catch (e) {
            console.error('Error updating exam progress:', e);
        }
    }
}

// Export for use in main app
window.PrufungModule = PrufungModule;
