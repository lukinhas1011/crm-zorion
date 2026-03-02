import dotenv from 'dotenv';
dotenv.config({ override: true }); // Force override

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { createServer as createViteServer } from 'vite';
import { processWhatsAppMessage } from './services/whatsappService';
import { db, auth } from './services/firebase';
import { collection, getDocs, query, orderBy, limit, where, doc, updateDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

console.log("--- SERVER START ENV DEBUG ---");
console.log("GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
if (process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY length:", process.env.GEMINI_API_KEY.length);
    console.log("GEMINI_API_KEY first 4 chars:", process.env.GEMINI_API_KEY.substring(0, 4));
}
console.log("--- END SERVER START DEBUG ---");

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Autenticação Anônima do Servidor (Para permissão de escrita no Firestore)
  try {
    await signInAnonymously(auth);
    console.log('[Server Auth] Signed in anonymously for database access.');
  } catch (error) {
    console.error('[Server Auth Error] Failed to sign in anonymously:', error);
  }

  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  // Middleware de Log Global (Para ver o que está chegando)
  app.use((req, res, next) => {
    if (req.url.includes('/api/')) {
        console.log(`[API Request] ${req.method} ${req.url}`);
    }
    next();
  });

  // --- ROTAS DE API (PRIORIDADE MÁXIMA) ---
  
  // 1. Webhook GET (Teste de Navegador) - Com e sem barra no final
  app.get(['/api/whatsapp/webhook', '/api/whatsapp/webhook/'], (req, res) => {
    console.log('[Webhook] GET request received - Sending text response');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send('✅ Webhook do WhatsApp está ATIVO e pronto para receber mensagens (POST).');
  });

  // 2. Webhook POST (Twilio/Z-API) - Com e sem barra no final
  app.post(['/api/whatsapp/webhook', '/api/whatsapp/webhook/'], async (req, res) => {
    console.log('[Webhook] POST request received');
    try {
      res.status(200).send('OK'); // Resposta rápida
      processWhatsAppMessage(req.body).catch(err => console.error('[Async Error]', err));
    } catch (error) {
      console.error('[Webhook Error]', error);
      if (!res.headersSent) res.status(500).send('Error');
    }
  });

  // 3. API de Logs para o Frontend (Diagnóstico)
  app.get('/api/whatsapp/logs', async (req, res) => {
    try {
      const q = query(collection(db, 'whatsapp_logs'), orderBy('receivedAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  // 4. Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // 5. Rota de Teste Temporária (Simulação de Fluxo)
  app.get('/api/test/whatsapp-flow', async (req, res) => {
    console.log('[Test Route] Iniciando simulação de fluxo WhatsApp...');
    try {
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        let targetUser = null;
        
        usersSnap.forEach(doc => {
            const data = doc.data();
            if (data.email === 'lrosadamaia64@gmail.com' || (data.name && data.name.includes('Lucas'))) {
                targetUser = { id: doc.id, ...data };
            }
        });

        if (!targetUser) {
            const allUsers = usersSnap.docs.map(d => ({id: d.id, name: d.data().name, email: d.data().email}));
            return res.status(404).json({ error: 'Usuário Lucas não encontrado', availableUsers: allUsers });
        }

        // AUTO-FIX: Se não tiver telefone, atualiza para um de teste
        if (!targetUser.phone) {
            console.log(`[Test Route] Usuário ${targetUser.name} sem telefone. Atualizando para 5544998561614...`);
            const userRef = doc(db, 'users', targetUser.id);
            await updateDoc(userRef, { phone: '5544998561614' });
            targetUser.phone = '5544998561614'; // Atualiza objeto local
        }

        // Buscar Cliente
        const clientsRef = collection(db, 'clients');
        let clientsQuery;
        if (targetUser.role === 'Admin') {
            clientsQuery = query(clientsRef);
        } else {
            clientsQuery = query(clientsRef, where('assignedTechnicianIds', 'array-contains', targetUser.id));
        }
        const clientsSnap = await getDocs(clientsQuery);

        if (clientsSnap.empty) {
            return res.status(404).json({ error: 'Nenhum cliente encontrado para este usuário', userId: targetUser.id });
        }

        const client = clientsSnap.docs[0].data();
        
        // Payload Simulado
        const testPayload = {
            phone: targetUser.phone,
            text: {
                message: `Visita realizada na fazenda ${client.farmName}. O gado está com bom ganho de peso, cerca de 1.2kg/dia. O cliente ${client.name} gostou do suplemento novo. Recomendo manter a dieta.`
            }
        };

        // Executar Processamento (Async para não travar a resposta HTTP se demorar muito, mas aqui queremos ver o log)
        processWhatsAppMessage(testPayload).catch(err => console.error('[Test Route Async Error]', err));

        res.json({ 
            message: 'Simulação iniciada. Verifique os logs do servidor.', 
            user: targetUser.name, 
            client: client.name,
            payload: testPayload 
        });

    } catch (error) {
        console.error('[Test Route Error]', error);
        res.status(500).json({ error: String(error) });
    }
  });

  // --- FIM ROTAS API ---

  // Vite middleware (Só carrega se não for rota de API)
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
