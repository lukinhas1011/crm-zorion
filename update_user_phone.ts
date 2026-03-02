
import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
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

async function updateUser() {
    try {
        await signInAnonymously(auth);
        console.log("Autenticado.");
        
        const userId = "lucas.maia"; // ID retornado no erro anterior
        const userRef = doc(db, 'users', userId);
        
        await updateDoc(userRef, {
            phone: "5544998561614" // Telefone de teste
        });
        
        console.log(`Usuário ${userId} atualizado com telefone 5544998561614`);
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
    }
}

updateUser();
