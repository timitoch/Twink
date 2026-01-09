/**
 * particles.js
 * Particle trail & Fluid Ribbon effect for the background
 */

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 1.2 + 0.5;
        this.speedX = Math.random() * 0.8 - 0.4;
        this.speedY = Math.random() * 0.8 - 0.4;
        this.opacity = 0.6;
        this.shrinkRate = Math.random() * 0.015 + 0.01;
        this.color = color;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.opacity -= this.shrinkRate;
    }

    draw(ctx) {
        if (this.opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.opacity;
        ctx.shadowBlur = 8;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class AntigravityParticle {
    constructor(x, y) {
        // Scatter start position slightly
        this.x = x + (Math.random() - 0.5) * 15;
        this.y = y + (Math.random() - 0.5) * 15;

        // Random drift velocity
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 2 + 0.5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.01;
        this.size = Math.random() * 2 + 1;
        this.color = '#3b82f6'; // Blue shade
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        // "Antigravity" effect - slight upward float acceleration
        this.vy -= 0.08;

        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // Orient dash with velocity
        const len = this.size * 2;
        const angle = Math.atan2(this.vy, this.vx);

        ctx.beginPath();
        // Draw a line trailing behind the position
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - Math.cos(angle) * len, this.y - Math.sin(angle) * len);
        ctx.stroke();

        ctx.restore();
    }
}

class ParticleSystem {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');

        this.sparks = [];
        this.trail = []; // For 'fluid' (Antigravity) mode

        this.mouse = { x: -100, y: -100 };
        this.lastMouse = { x: -100, y: -100 };

        this.enabled = localStorage.getItem('trailEnabled') !== 'false';
        this.type = localStorage.getItem('trailType') || 'sparks';

        this.colors = ['#3b82f6', '#10b981', '#ffffff', '#818cf8'];
        this.currentColorIndex = 0;

        this.initCanvas();
        this.bindEvents();
        this.animate();

        window.cursorParticles = this;
    }

    setEnabled(val) {
        this.enabled = val === true || val === 'true';
        if (!this.enabled) {
            this.sparks = [];
            this.trail = [];
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    setType(type) {
        this.type = type;
        this.sparks = [];
        this.trail = [];
        // Clean any leftovers from previous mode
        if (document.getElementById('cursor-liquid-lens')) {
            document.getElementById('cursor-liquid-lens').style.display = 'none';
        }
    }

    initCanvas() {
        this.canvas.id = 'bg-particles-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100vw';
        this.canvas.style.height = '100vh';
        this.canvas.style.zIndex = '-9999';
        this.canvas.style.pointerEvents = 'none';

        this.resize();
        document.body.insertBefore(this.canvas, document.body.firstChild);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.setMouse(e.clientX, e.clientY));
        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length > 0) {
                this.setMouse(e.touches[0].clientX, e.touches[0].clientY);
            }
        });
    }

    setMouse(x, y) {
        this.lastMouse.x = this.mouse.x;
        this.lastMouse.y = this.mouse.y;
        this.mouse.x = x;
        this.mouse.y = y;

        if (this.enabled) {
            if (this.type === 'sparks') {
                this.spawnSparks();
            } else if (this.type === 'fluid') {
                this.spawnAntigravity();
            }
        }
    }

    spawnSparks() {
        if (Math.random() > 0.4) return;
        const color = this.colors[Math.floor(Math.random() * this.colors.length)];
        this.sparks.push(new Particle(this.mouse.x, this.mouse.y, color));
    }

    spawnAntigravity() {
        // Spawn multiple particles for a denser trail
        for (let i = 0; i < 5; i++) {
            this.trail.push(new AntigravityParticle(this.mouse.x, this.mouse.y));
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.enabled) {
            if (this.type === 'sparks') {
                this.updateAndDrawSparks();
            } else if (this.type === 'fluid') {
                this.updateAndDrawAntigravity();
            }
        }

        requestAnimationFrame(() => this.animate());
    }

    updateAndDrawSparks() {
        for (let i = 0; i < this.sparks.length; i++) {
            const p = this.sparks[i];
            p.update();
            p.draw(this.ctx);
            if (p.opacity <= 0) {
                this.sparks.splice(i, 1);
                i--;
            }
        }
        if (this.sparks.length > 150) {
            this.sparks.splice(0, this.sparks.length - 150);
        }
    }

    updateAndDrawAntigravity() {
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            p.update();
            p.draw(this.ctx);
            if (p.life <= 0) {
                this.trail.splice(i, 1);
                i--;
            }
        }
        // Limit particle count
        if (this.trail.length > 300) {
            this.trail.shift();
        }
    }
}

new ParticleSystem();
