
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, orderBy, limit, where, addDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";
import dotenv from 'dotenv';

dotenv.config();

const firebaseConfig = {
  apiKey: "AIzaSyCqLGggNvvRPBAI3lFLenVyJtsHYU82eBc",
  authDomain: "zorion-crm.firebaseapp.com",
  projectId: "zorion-crm",
  storageBucket: "zorion-crm.firebasestorage.app",
  messagingSenderId: "752483977430",
  appId: "1:752483977430:web:d4aefc8660e4edf024a177",
  measurementId: "G-ZXYZR9VX7G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function checkDebug() {
  try {
    console.log("Autenticando...");
    await signInAnonymously(auth);

    console.log("\n--- ÚLTIMOS 5 LOGS DO WHATSAPP ---");
    const logsRef = collection(db, 'whatsapp_logs');
    const qLogs = query(logsRef, orderBy('receivedAt', 'desc'), limit(5));
    const logsSnap = await getDocs(qLogs);
    
    if (logsSnap.empty) {
        console.log("Nenhum log encontrado.");
    } else {
        logsSnap.forEach(doc => {
            const data = doc.data();
            console.log(`[${doc.id}] Status: ${data.status}`);
            console.log(`   Data: ${data.receivedAt?.toDate?.() || data.receivedAt}`);
            console.log(`   Passo: ${data.step}`);
            console.log(`   Erro: ${data.error || 'Nenhum'}`);
            console.log(`   Payload Phone: ${data.payload?.phone || data.payload?.From || 'N/A'}`);
            console.log(`   Motivo (se ignorado): ${data.reason}`);
            console.log("---------------------------------------------------");
        });
    }

    console.log("\n--- LISTANDO TODOS OS USUÁRIOS ---");
    const usersRef = collection(db, 'users');
    const allUsersSnap = await getDocs(usersRef);
    allUsersSnap.forEach(doc => {
        const u = doc.data();
        console.log(`[${doc.id}] ${u.name} | ${u.email} | ${u.phone} | ${u.role}`);
    });

    console.log("\n--- CLIENTES DO USUÁRIO LUCAS MAIA ---");
    // Simulando a lógica do whatsappService
    // Usuário: lucas.maia (ID: lucas.maia)
    // Role: Engenheiro Agrônomo (não é Admin)
    
    const clientsRef = collection(db, 'clients');
    // Assumindo que não é Admin, busca por assignedTechnicianIds
    const qClients = query(clientsRef, where('assignedTechnicianIds', 'array-contains', 'lucas.maia'));
    const clientsSnap = await getDocs(qClients);
    
    if (clientsSnap.empty) {
        console.log("Nenhum cliente atribuído ao usuário lucas.maia.");
    } else {
        clientsSnap.forEach(doc => {
            const c = doc.data();
            console.log(`[${doc.id}] ${c.name} | Fazenda: ${c.farmName}`);
        });
    }

  } catch (error) {
    console.error("Erro no script:", error);
  }
  process.exit();
}

checkDebug();
