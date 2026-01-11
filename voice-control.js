/**
 * VoiceControl Module
 * Handles voice commands for the study session using Web Speech API
 */
class VoiceControl {
    constructor() {
        this.recognition = null;
        this.isActive = false;
        this.isSupported = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
        this.btnToggle = null;

        this.commands = {
            'переверни': () => this.flipCard(),
            'не помню': () => this.rate(1),
            'с трудом': () => this.rate(2),
            'частично': () => this.rate(3),
            'почти': () => this.rate(4),
            'помню': () => this.rate(5),
            'отлично': () => this.rate(6)
        };

        // Fuzzy matches and variations
        this.fuzzyCommands = {
            'переверни': ['переверни', 'верни', 'открой', 'покажи'],
            'не помню': ['не помню', 'не знаю', 'забыл', 'ноль'],
            'с трудом': ['с трудом', 'трудно', 'тяжело', 'один'],
            'частично': ['частично', 'немного', 'средне', 'два'],
            'почти': ['почти', 'близко', 'три'],
            'помню': ['помню', 'знаю', 'четыре'],
            'отлично': ['отлично', 'супер', 'пять', 'идеально']
        };
    }

    init() {
        if (!this.isSupported) {
            console.warn('Speech Recognition is not supported in this browser.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'ru-RU';

        this.recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const command = event.results[last][0].transcript.trim().toLowerCase();
            console.log('Voice Command received:', command);
            this.handleCommand(command);
        };

        this.recognition.onend = () => {
            if (this.isActive) {
                this.recognition.start();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                alert('Доступ к микрофону запрещен. Пожалуйста, разрешите доступ для работы голосового управления.');
                this.stop();
                if (this.btnToggle) this.btnToggle.classList.remove('active');
            }
        };
    }

    handleCommand(transcript) {
        // Try exact match first
        for (const [cmd, action] of Object.entries(this.commands)) {
            if (transcript.includes(cmd) || (cmd === 'отлично' && transcript.includes('отлчино'))) {
                action();
                return;
            }
        }

        // Try fuzzy matches
        for (const [cmd, variations] of Object.entries(this.fuzzyCommands)) {
            for (const variant of variations) {
                if (transcript.includes(variant)) {
                    this.commands[cmd]();
                    return;
                }
            }
        }
    }

    flipCard() {
        const flashcard = document.getElementById('flashcard');
        if (flashcard) {
            flashcard.click();
        }
    }

    rate(value) {
        const btn = document.querySelector(`.btn-rate[data-rating="${value}"]`);
        if (btn) {
            btn.click();
            // Optional: trigger a small visual flash on the button if needed
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = '', 100);
        }
    }

    start() {
        if (!this.recognition) this.init();
        if (this.recognition && !this.isActive) {
            this.isActive = true;
            this.recognition.start();
            this.showStatus('Голосовое управление включено');
        }
    }

    stop() {
        if (this.recognition && this.isActive) {
            this.isActive = false;
            this.recognition.stop();
            this.showStatus('Голосовое управление выключено');
        }
    }

    toggle() {
        if (this.isActive) {
            this.stop();
        } else {
            this.start();
        }
        return this.isActive;
    }

    showStatus(msg) {
        // Simple notification if needed, or just console
        console.log(msg);
    }
}

window.VoiceControl = new VoiceControl();
