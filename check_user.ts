
import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: "AIzaSyCqLGggNvvRPBAI3lFLenVyJtsHYU82eBc",
  authDomain: "zorion-crm.firebaseapp.com",
  projectId: "zorion-crm",
  storageBucket: "zorion-crm.firebasestorage.app",
  messagingSenderId: "752483977430",
  appId: "1:752483977430:web:d4aefc8660e4edf024a177"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function checkUser() {
    try {
        await signInAnonymously(auth);
        const userRef = doc(db, 'users', 'lucas.maia');
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
            console.log('User Phone:', snap.data().phone);
        } else {
            console.log('User not found');
        }
    } catch (error) {
        console.error("Error checking user:", error);
    }
}

checkUser();
