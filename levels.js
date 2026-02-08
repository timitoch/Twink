// levels.js - Logic for the instructions page
document.addEventListener('DOMContentLoaded', () => {
    // Apply theme from localStorage
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedScheme = localStorage.getItem('colorScheme') || 'default';
    document.documentElement.setAttribute('data-color-scheme', savedScheme);

    // Smooth fade in for sections
    const sections = document.querySelectorAll('.guide-section');
    sections.forEach((s, i) => {
        s.style.opacity = '0';
        s.style.transform = 'translateY(10px)';
        s.style.transition = `all 0.4s ease-out ${i * 0.1}s`;

        setTimeout(() => {
            s.style.opacity = '1';
            s.style.transform = 'translateY(0)';
        }, 50);
    });
});
