// auth.js - Authentication logic
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loginScreen = document.getElementById('login-screen');
    const registerScreen = document.getElementById('register-screen');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const toRegisterBtn = document.getElementById('to-register');
    const toLoginBtn = document.getElementById('to-login');
    const loginError = document.getElementById('login-error');
    const regError = document.getElementById('reg-error');

    // Password Visibility Toggle
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            const input = btn.parentElement.querySelector('input');
            if (input) {
                const isPassword = input.getAttribute('type') === 'password';
                input.setAttribute('type', isPassword ? 'text' : 'password');
                btn.querySelector('.eye-open').classList.toggle('hidden', !isPassword);
                btn.querySelector('.eye-closed').classList.toggle('hidden', isPassword);
            }
        };
    });

    // Screen Switching
    toRegisterBtn.onclick = (e) => {
        e.preventDefault();
        loginScreen.classList.add('hidden');
        registerScreen.classList.remove('hidden');
    };

    toLoginBtn.onclick = (e) => {
        e.preventDefault();
        registerScreen.classList.add('hidden');
        loginScreen.classList.remove('hidden');
    };

    // Login logic
    loginForm.onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        firebase.auth().signInWithEmailAndPassword(email, password)
            .then(() => {
                window.location.href = 'index.html';
            })
            .catch(error => {
                loginError.textContent = getErrorMessage(error.code);
            });
    };

    // Registration logic
    registerForm.onsubmit = (e) => {
        e.preventDefault();
        const nickname = document.getElementById('reg-nickname').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-password-confirm').value;

        if (password !== confirm) {
            regError.textContent = "Пароли не совпадают";
            return;
        }

        firebase.auth().createUserWithEmailAndPassword(email, password)
            .then(u => {
                // Set nickname in DB
                return firebase.database().ref('users/' + u.user.uid + '/nickname').set(nickname);
            })
            .then(() => {
                window.location.href = 'index.html';
            })
            .catch(error => {
                regError.textContent = getErrorMessage(error.code) || error.message;
            });
    };

    // Firebase Auth State Check
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // If already logged in, redirect to main page
            window.location.href = 'index.html';
        }
    });

    // Helper for user-friendly errors
    function getErrorMessage(code) {
        switch (code) {
            case 'auth/user-not-found': return "Пользователь не найден";
            case 'auth/wrong-password': return "Неверный пароль";
            case 'auth/email-already-in-use': return "Email уже используется";
            case 'auth/weak-password': return "Слишком слабый пароль";
            case 'auth/invalid-email': return "Некорректный Email";
            default: return "Ошибка при входе";
        }
    }
});
