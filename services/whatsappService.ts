import { GoogleGenAI } from '@google/genai';
import { getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { COLLECTIONS } from './dbSchema';
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// RE-INITIALIZE FIREBASE LOCALLY TO ENSURE AUTH STATE IS PICKED UP
// This is critical for server-side execution where the global instance might be stale
const firebaseConfig = {
  apiKey: "AIzaSyCqLGggNvvRPBAI3lFLenVyJtsHYU82eBc",
  authDomain: "zorion-crm.firebaseapp.com",
  projectId: "zorion-crm",
  storageBucket: "zorion-crm.firebasestorage.app",
  messagingSenderId: "752483977430",
  appId: "1:752483977430:web:d4aefc8660e4edf024a177",
  measurementId: "G-ZXYZR9VX7G"
};

const app = initializeApp(firebaseConfig, "whatsappServiceApp");
const db = getFirestore(app);
const auth = getAuth(app); // Ensure auth is initialized on this app instance

// Configuração do Gemini (Backend) moved to inside function


// Interface para o Payload do WhatsApp (Z-API)
interface WhatsAppPayload {
  phone?: string; // Z-API
  text?: { message?: string }; // Z-API
  image?: { imageUrl?: string; caption?: string }; // Z-API
  audio?: { audioUrl?: string }; // Z-API
  video?: { videoUrl?: string; caption?: string }; // Z-API
  
  // Compatibilidade com outros (Twilio/Waha)
  Body?: string;
  From?: string;
  MediaUrl0?: string;
  
  [key: string]: any;
}

import { signInAnonymously } from 'firebase/auth';

export async function processWhatsAppMessage(payload: WhatsAppPayload) {
  try {
    // Ensure we are authenticated before any DB operation
    if (!auth.currentUser) {
        console.log('[WhatsApp Service] Authenticating anonymously...');
        await signInAnonymously(auth);
    }

    // 1. Logar o payload bruto para auditoria (Blindagem)
    const logRef = await addDoc(collection(db, 'whatsapp_logs'), {
      payload,
      receivedAt: Timestamp.now(),
      status: 'received',
      step: 'start'
    });

    const updateLog = async (data: any) => {
        try {
            await updateDoc(logRef, data);
        } catch (e) {
            console.error("Error updating log:", e);
        }
    };

    await updateLog({ step: 'extracting_data' });

    // 2. Extrair dados básicos (Normalizar telefone e conteúdo)
    // Z-API envia o telefone em 'phone' (ex: "5511999999999")
    // Twilio envia em 'From' (ex: "whatsapp:+5511999999999")
    const rawPhone = payload.phone || payload.From || '';
    
    // Extrair texto (Z-API vs Twilio)
    let messageText = '';
    if (payload.text && payload.text.message) {
        messageText = payload.text.message; // Z-API Texto
    } else if (payload.image && payload.image.caption) {
        messageText = payload.image.caption; // Z-API Imagem com legenda
    } else if (payload.video && payload.video.caption) {
        messageText = payload.video.caption; // Z-API Video com legenda
    } else {
        messageText = payload.Body || ''; // Twilio
    }

    // Extrair Mídia (Z-API vs Twilio)
    let mediaUrl = null;
    let mediaType = 'image'; // default

    if (payload.image && payload.image.imageUrl) {
        mediaUrl = payload.image.imageUrl;
        mediaType = 'image';
    } else if (payload.audio && payload.audio.audioUrl) {
        mediaUrl = payload.audio.audioUrl;
        mediaType = 'audio';
        messageText = messageText || "[Áudio Enviado]"; // Garantir texto se for só áudio
    } else if (payload.video && payload.video.videoUrl) {
        mediaUrl = payload.video.videoUrl;
        mediaType = 'video';
    } else {
        mediaUrl = payload.MediaUrl0 || null; // Twilio
    }

    if (!rawPhone) {
      console.warn('[WhatsApp] Telefone não identificado no payload.');
      return;
    }

    // Normalizar telefone (remover +, whatsapp:, espaços, traços)
    // Z-API geralmente manda limpo (5511999999999), mas garantimos
    // Twilio manda "whatsapp:+55...", então removemos tudo que não é número
    const phone = rawPhone.replace(/\D/g, ''); 

    // 3. Buscar Usuário pelo Telefone (Segurança: Só processa se usuário existir)
    await updateLog({ step: 'finding_user', phone });
    const usersRef = collection(db, COLLECTIONS.USERS);
    
    // Tenta busca exata primeiro
    let q = query(usersRef, where('phone', '==', phone));
    let userSnapshot = await getDocs(q);

    // Se não achou e parece ser número BR (começa com 55), tenta variação do 9º dígito
    if (userSnapshot.empty && phone.startsWith('55')) {
        if (phone.length === 12) {
            // Tem 12 (sem o 9), tenta com 13 (colocando o 9 após o DDD)
            // Ex: 55 44 88888888 -> 55 44 988888888
            const phoneWith9 = phone.slice(0, 4) + '9' + phone.slice(4);
            console.log(`[WhatsApp] Tentando variação com 9º dígito: ${phoneWith9}`);
            q = query(usersRef, where('phone', '==', phoneWith9));
            userSnapshot = await getDocs(q);
        } else if (phone.length === 13) {
             // Tem 13 (com o 9), tenta com 12 (tirando o 9)
             // Ex: 55 44 988888888 -> 55 44 88888888
             const phoneWithout9 = phone.slice(0, 4) + phone.slice(5);
             console.log(`[WhatsApp] Tentando variação sem 9º dígito: ${phoneWithout9}`);
             q = query(usersRef, where('phone', '==', phoneWithout9));
             userSnapshot = await getDocs(q);
        }
    }

    if (userSnapshot.empty) {
      console.warn(`[WhatsApp] Usuário não encontrado para o telefone: ${phone} (ou variações)`);
      // Logar erro de usuário não encontrado para diagnóstico
      await addDoc(collection(db, 'whatsapp_logs'), {
        payload,
        status: 'ignored',
        reason: `Usuário não encontrado: ${phone}`,
        receivedAt: Timestamp.now()
      });
      return;
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // 4. Buscar Clientes Permitidos para este Usuário (Contexto para IA)
    await updateLog({ step: 'finding_clients', userId });
    // Se for Admin, pode ver todos. Se for Técnico, ver apenas os atribuídos.
    let clientsQuery;
    if (userData.role === 'Admin' || userData.role === 'Veterinário') {
        clientsQuery = query(collection(db, COLLECTIONS.CLIENTS));
    } else {
        clientsQuery = query(collection(db, COLLECTIONS.CLIENTS), where('assignedTechnicianIds', 'array-contains', userId));
    }
    
    const clientsSnapshot = await getDocs(clientsQuery);
    const clientsList = clientsSnapshot.docs.map(doc => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        name: data.name,
        farmName: data.farmName
      };
    });

    if (clientsList.length === 0) {
      console.warn(`[WhatsApp] Usuário ${userData.name} não tem clientes atribuídos.`);
      return;
    }

    // 5. Processamento com IA (Gemini)
    await updateLog({ step: 'calling_ai', clientsCount: clientsList.length });
    // O prompt deve ser robusto para extrair intenção e dados
    const prompt = `
      Você é um assistente de CRM agropecuário que processa mensagens de WhatsApp de técnicos de campo.
      
      CONTEXTO:
      - Técnico: ${userData.name}
      - Mensagem Recebida: "${messageText}"
      - Tem Mídia? ${mediaUrl ? 'Sim' : 'Não'}
      - Lista de Clientes Permitidos (ID: Nome - Fazenda):
      ${JSON.stringify(clientsList)}

      TAREFA:
      Analise a mensagem e extraia as seguintes informações em formato JSON estrito:
      1. "clientId": O ID do cliente mais provável citado na mensagem. Se não conseguir identificar com certeza, retorne null.
      2. "action": O que foi feito? (Ex: "Visita", "Entrega", "Observação", "Foto").
      3. "summary": Um resumo profissional do que foi relatado para ser salvo no histórico.
      4. "date": A data do ocorrido (ISO 8601). Se não citada, use a data de hoje.
      5. "products": Lista de produtos citados (se houver).
      6. "sentiment": "Positivo", "Neutro" ou "Negativo".

      REGRAS:
      - Se a mensagem for apenas "Oi" ou sem conteúdo relevante, retorne "action": "Ignorar".
      - Se o cliente não for encontrado na lista, retorne "clientId": null.
      - Responda APENAS o JSON.
    `;

    let apiKey = process.env.GEMINI_API_KEY || 
                 process.env.GOOGLE_API_KEY || 
                 process.env.GOOGLE_GENAI_API_KEY || 
                 process.env.VITE_GEMINI_API_KEY || 
                 process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
                 process.env.API_KEY || 
                 '';
    
    // Clean the key: remove whitespace, newlines and surrounding quotes
    apiKey = apiKey.trim().replace(/[\r\n]/g, '').replace(/^["']|["']$/g, '');

    // DEBUG: Diagnóstico da Chave (Sem revelar a chave inteira)
    const keySource = process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' :
                      process.env.GOOGLE_API_KEY ? 'GOOGLE_API_KEY' :
                      process.env.GOOGLE_GENAI_API_KEY ? 'GOOGLE_GENAI_API_KEY' :
                      process.env.VITE_GEMINI_API_KEY ? 'VITE_GEMINI_API_KEY' :
                      process.env.NEXT_PUBLIC_GEMINI_API_KEY ? 'NEXT_PUBLIC_GEMINI_API_KEY' :
                      process.env.API_KEY ? 'API_KEY' : 'NONE';
    
    await updateLog({ 
        step: 'env_debug',
        keySource,
        GEMINI_API_KEY_VAL: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 5) : 'undefined',
        VITE_GEMINI_API_KEY_VAL: process.env.VITE_GEMINI_API_KEY ? process.env.VITE_GEMINI_API_KEY.substring(0, 5) : 'undefined',
        GOOGLE_API_KEY_VAL: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.substring(0, 5) : 'undefined',
        API_KEY_VAL: process.env.API_KEY ? process.env.API_KEY.substring(0, 5) : 'undefined'
    });

    console.log(`[WhatsApp] Using Key Source: ${keySource}`);
    console.log(`[WhatsApp] Key Length: ${apiKey.length}`);
    console.log(`[WhatsApp] Key Starts With AIza? ${apiKey.startsWith('AIza')}`);
    console.log(`[WhatsApp] Key Prefix: ${apiKey.substring(0, 5)}...`);
    console.log(`[WhatsApp] Key Suffix: ...${apiKey.substring(apiKey.length - 5)}`);

    if (!apiKey) {
        throw new Error("API Key is missing. Please set GEMINI_API_KEY in environment variables.");
    }

    // Check if it's the Firebase key (starts with AIza and is the one in config)
    const firebaseKey = "AIzaSyCqLGggNvvRPBAI3lFLenVyJtsHYU82eBc";
    if (apiKey === firebaseKey) {
         console.error("[WhatsApp] CRITICAL: The configured API Key is the Firebase Key, not the Gemini API Key.");
         console.error("Please get a valid Gemini API Key at https://aistudio.google.com/app/apikey");
         
         // Fallback graceful: Logar erro e não chamar a API para evitar crash
         await addDoc(collection(db, 'whatsapp_logs'), {
            payload,
            status: 'error',
            error: 'Invalid Configuration: Using Firebase Key instead of Gemini Key',
            receivedAt: Timestamp.now()
         });
         return;
    }

    let result;
    try {
        await updateLog({ 
            step: 'ai_request_start', 
            model: 'gemini-flash-latest'
        });
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        await updateLog({ step: 'ai_request_end' });
        
        let jsonStr;
        try {
            jsonStr = response.text(); // Try as function first (some versions)
        } catch (e) {
            jsonStr = response.text; // Try as property
        }

        if (!jsonStr) {
             throw new Error("Empty response from AI");
        }

        // Remove markdown code blocks if present
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        
        await updateLog({ step: 'parsing_json', jsonStr: jsonStr.substring(0, 100) + '...' });
        
        result = JSON.parse(jsonStr);
        await updateLog({ step: 'json_parsed', result });
    } catch (aiError) {
        await updateLog({ step: 'ai_error', error: String(aiError) });
        console.error("[WhatsApp] AI Processing Failed:", aiError);
        // Fallback manual se a IA falhar
        result = {
            clientId: null,
            action: "Observação",
            summary: `Mensagem recebida: "${messageText}" (Processamento IA falhou)`,
            date: new Date().toISOString(),
            sentiment: "Neutro",
            products: [] // Ensure products is an empty array, not undefined
        };
    }

    // 6. Executar Ação no Banco de Dados
    if (result.action === 'Ignorar' || (!result.clientId && !result.summary)) {
      console.log('[WhatsApp] Ação ignorada ou cliente não identificado.');
      // Logar motivo
      await updateLog({ 
        status: 'ignored',
        reason: result.action === 'Ignorar' ? 'Sem conteúdo relevante' : 'Cliente não identificado',
        aiAnalysis: result
      });
      return;
    }

    // Buscar Oportunidade/Deal Ativo para este Cliente (Para vincular ao Card)
    let dealId = null;
    try {
        await updateLog({ step: 'finding_deal', clientId: result.clientId });
        const dealsRef = collection(db, COLLECTIONS.DEALS);
        // Priorizar deals em aberto ou ganhos (ativos)
        const dealsQuery = query(dealsRef, where('clientId', '==', result.clientId), where('status', 'in', ['Open', 'Won']));
        const dealsSnapshot = await getDocs(dealsQuery);
        
        if (!dealsSnapshot.empty) {
            // Pega o deal mais recente modificado
            const sortedDeals = dealsSnapshot.docs.sort((a, b) => {
                const dateA = a.data().updatedAt || '';
                const dateB = b.data().updatedAt || '';
                return dateB.localeCompare(dateA);
            });
            dealId = sortedDeals[0].id;
        }
        await updateLog({ step: 'deal_found', dealId });
    } catch (dealError) {
        console.error("Error finding deal:", dealError);
        await updateLog({ step: 'deal_error', error: String(dealError) });
    }

    // Criar Atividade ou Visita
    const activityTitle = result.clientId 
        ? `Registro via WhatsApp: ${result.action}`
        : `[SEM CLIENTE] Registro via WhatsApp: ${result.action}`;

    const newActivity = {
      clientId: result.clientId,
      dealId: dealId, // Vincula ao card se existir
      type: 'Whatsapp', // Novo tipo de atividade
      title: activityTitle,
      description: `${result.summary}\n\n(Enviado por ${userData.name} via WhatsApp)`,
      dueDate: result.date || new Date().toISOString(),
      isDone: true,
      technicianId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: mediaUrl ? [{ type: 'image', url: mediaUrl, name: 'Anexo WhatsApp' }] : [], // Simplificado
      customAttributes: {
        sentiment: result.sentiment || 'Neutro',
        products: (result.products && Array.isArray(result.products)) ? result.products : [],
        source: 'whatsapp_integration'
      }
    };

    await addDoc(collection(db, COLLECTIONS.ACTIVITIES), newActivity);

    // Se houver Deal vinculado, atualizar a data de modificação para subir no funil
    if (dealId) {
        await updateDoc(doc(db, COLLECTIONS.DEALS, dealId), {
            updatedAt: new Date().toISOString(),
            lastStageChangeDate: new Date().toISOString() // Opcional: para destacar atividade recente
        });
    }

    console.log(`[WhatsApp] Atividade criada com sucesso para o cliente ${result.clientId || 'NÃO IDENTIFICADO'} (Deal: ${dealId || 'Nenhum'})`);

    // Log de Sucesso (ou Aviso)
    await addDoc(collection(db, 'whatsapp_logs'), {
      payload,
      status: result.clientId ? 'success' : 'warning',
      message: result.clientId ? 'Atividade criada com sucesso' : 'Atividade criada, mas cliente não identificado',
      aiAnalysis: result,
      createdActivity: newActivity,
      receivedAt: Timestamp.now()
    });

  } catch (error) {
    console.error('[WhatsApp Service Error]', error);
    // Log de Erro Crítico
    await addDoc(collection(db, 'whatsapp_logs'), {
      payload,
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      receivedAt: Timestamp.now()
    });
    // Não relançar o erro para não quebrar o webhook (Blindagem)
  }
}
