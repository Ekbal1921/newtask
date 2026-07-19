// Mega Task BD - Firebase Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    runTransaction, 
    writeBatch, 
    increment, 
    serverTimestamp,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";






// Firebase Configuration (Replace with your actual keys)



        const firebaseConfig = {
  apiKey: "AIzaSyAdLzRbfVDEE1N1jrkYjb9UlkJJNkwkJIU",
  authDomain: "fourtune-cash-30484.firebaseapp.com",
  databaseURL: "https://fourtune-cash-30484-default-rtdb.firebaseio.com",
  projectId: "fourtune-cash-30484",
  storageBucket: "fourtune-cash-30484.firebasestorage.app",
  messagingSenderId: "824821701363",
  appId: "1:824821701363:web:302ae99edb4e16e8d17586"
};






// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Export instances and functions
export { 
    app, 
    auth, 
    db, 
    signInAnonymously, 
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    runTransaction, 
    writeBatch, 
    increment, 
    serverTimestamp,
    arrayUnion,
    arrayRemove
};
