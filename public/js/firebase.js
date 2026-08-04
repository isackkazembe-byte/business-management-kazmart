import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyA31nP6b9BuHvB4ffwQcKiHrs5vT7E0K4g",
  authDomain: "biz-management-system-tz.firebaseapp.com",
  projectId: "biz-management-system-tz",
  storageBucket: "biz-management-system-tz.firebasestorage.app",
  messagingSenderId: "246381480533",
  appId: "1:246381480533:web:c6723c6277f61416e6e2dc"
};


const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);


export { app, db, auth };