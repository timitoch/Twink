// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyC5L2JlRmCrlq0Zyj1CIwbtd18eHHwkL3g",
    authDomain: "german-df0f0.firebaseapp.com",
    projectId: "german-df0f0",
    storageBucket: "german-df0f0.firebasestorage.app",
    messagingSenderId: "1027440373390",
    appId: "1:1027440373390:web:e00b47c3e68e61083023df",
    measurementId: "G-2H5MQ8YYHE",
    databaseURL: "https://german-df0f0-default-rtdb.firebaseio.com"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
