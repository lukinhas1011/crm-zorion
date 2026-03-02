
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth'; // Import Auth
import { processWhatsAppMessage } from './services/whatsappService';
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
const auth = getAuth(app); // Initialize Auth

async function runTest() {
    console.log("--- Iniciando Teste de Fluxo WhatsApp ---");

    // 0. Autenticar Anônimo
    try {
        await signInAnonymously(auth);
        console.log("Autenticado como anônimo para leitura do banco.");
    } catch (error) {
        console.error("Erro ao autenticar:", error);
        return;
    }

    // 1. Buscar Usuário (Lucas)
    // O email do usuário é lrosadamaia64@gmail.com, vamos tentar achar pelo email ou assumir um telefone
    const usersRef = collection(db, 'users');
    // Vamos listar todos para achar o Lucas
    const usersSnap = await getDocs(usersRef);
    let targetUser = null;
    
    usersSnap.forEach(doc => {
        const data = doc.data();
        // Tenta achar por email ou nome parecido
        if (data.email === 'lrosadamaia64@gmail.com' || (data.name && data.name.includes('Lucas'))) {
            targetUser = { id: doc.id, ...data };
        }
    });

    if (!targetUser) {
        console.log("Usuário Lucas não encontrado. Criando usuário de teste temporário...");
        // Se não achar, teríamos que criar, mas vamos tentar usar o primeiro admin que achar ou falhar
        // Para o teste ser fiel, precisamos de um telefone válido cadastrado.
        // Vamos listar os usuários encontrados para decidir.
        console.log("Usuários encontrados:", usersSnap.docs.map(d => ({id: d.id, name: d.data().name, email: d.data().email, phone: d.data().phone})));
        return;
    }

    console.log(`Usuário alvo encontrado: ${targetUser.name} (ID: ${targetUser.id}, Phone: ${targetUser.phone})`);

    if (!targetUser.phone) {
        console.error("Usuário não tem telefone cadastrado. O teste falhará na busca por telefone.");
        return;
    }

    // 2. Buscar Cliente atribuído a este usuário
    const clientsRef = collection(db, 'clients');
    // Verifica se é admin (vê todos) ou técnico (vê atribuídos)
    let clientsQuery;
    if (targetUser.role === 'Admin') {
        clientsQuery = query(clientsRef);
    } else {
        clientsQuery = query(clientsRef, where('assignedTechnicianIds', 'array-contains', targetUser.id));
    }
    
    const clientsSnap = await getDocs(clientsQuery);
    
    if (clientsSnap.empty) {
        console.error("Nenhum cliente encontrado para este usuário. A IA não terá contexto.");
        // Poderíamos criar um cliente de teste aqui se necessário
        return;
    }

    const client = clientsSnap.docs[0].data();
    console.log(`Cliente encontrado para contexto: ${client.name} (Fazenda: ${client.farmName})`);

    // 3. Simular Mensagem
    const testPayload = {
        phone: targetUser.phone, // Usa o telefone real do usuário
        text: {
            message: `Visita realizada na fazenda ${client.farmName}. O gado está com bom ganho de peso, cerca de 1.2kg/dia. O cliente ${client.name} gostou do suplemento novo. Recomendo manter a dieta.`
        }
    };

    console.log("Enviando payload simulado:", JSON.stringify(testPayload, null, 2));

    try {
        await processWhatsAppMessage(testPayload);
        console.log("Processamento finalizado. Verifique os logs do console acima para ver se a IA funcionou.");
    } catch (error) {
        console.error("Erro fatal no teste:", error);
    }
}

runTest();
