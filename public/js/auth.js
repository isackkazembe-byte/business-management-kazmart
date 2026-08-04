import { auth, db } from "./firebase.js";

import {
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";


// ==========================
// GET CURRENT USER (from localStorage)
// ==========================

export function getCurrentUser() {
    const stored = localStorage.getItem("kazmartUser");
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
}


// ==========================
// LOGIN FUNCTION
// ==========================

async function loginUser(username, password) {

    try {
        username = username.trim();

        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", username));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            throw new Error("Username not found");
        }

        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();

        if (userData.status !== "active") {
            throw new Error("Account is inactive.");
        }

        await signInWithEmailAndPassword(auth, userData.email, password);

               // Save logged-in user
        localStorage.setItem("kazmartUser", JSON.stringify({
            id: userDoc.id,
            ...userData
        }));

        // 👇👇👇 NEW: Capture Opening Cash for Shift Management 👇👇👇
        const openingCashInput = document.getElementById('loginOpeningCash');
        const openingCash = openingCashInput ? parseFloat(openingCashInput.value) || 0 : 0;
        localStorage.setItem('kazmartOpeningCash', openingCash);
        // 👆👆👆 END OF NEW CODE 👆👆👆

        // ✅ Redirect to the single‑page application
        window.location.href = "../app.html";

    } catch (error) {
        document.getElementById("message").innerText = error.message;
        console.error(error);
    }
}


// ==========================
// LOGIN BUTTON
// ==========================

document.getElementById("loginBtn").addEventListener("click", () => {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    loginUser(username, password);
});


// ==========================
// LOGOUT
// ==========================

export async function logoutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error(error);
    }
    localStorage.removeItem("kazmartUser");
    window.location.href = "pages/login.html";
}