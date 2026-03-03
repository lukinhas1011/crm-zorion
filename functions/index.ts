import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURAÇÃO ---
// A chave é carregada automaticamente do arquivo .env na pasta functions
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- TIPOS ---
interface WhatsAppPayload {
  phone?: string;
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  video?: { videoUrl?: string; caption?: string };
  Body?: string;
  From?: string;
  MediaUrl0?: string;
  [key: string]: any;
}

// --- LÓGICA DO WEBHOOK ---
async function processWhatsAppMessage(payload: WhatsAppPayload) {
  try {
    // 1. Logar Payload
    const logRef = await db.collection('whatsapp_logs').add({
      payload,
      receivedAt: admin.firestore.Timestamp.now(),
      status: 'received',
      step: 'start'
    });

    const updateLog = async (data: any) => {
      try { await logRef.update(data); } catch (e) { console.error("Error updating log:", e); }
    };

    await updateLog({ step: 'extracting_data' });

    // 2. Extrair Dados
    const rawPhone = payload.phone || payload.From || '';
    let messageText = '';
    
    if (payload.text?.message) messageText = payload.text.message;
    else if (payload.image?.caption) messageText = payload.image.caption;
    else if (payload.video?.caption) messageText = payload.video.caption;
    else messageText = payload.Body || '';

    let mediaUrl = null;
    if (payload.image?.imageUrl) mediaUrl = payload.image.imageUrl;
    else if (payload.audio?.audioUrl) { mediaUrl = payload.audio.audioUrl; messageText = messageText || "[Áudio Enviado]"; }
    else if (payload.video?.videoUrl) mediaUrl = payload.video.videoUrl;
    else mediaUrl = payload.MediaUrl0 || null;

    if (!rawPhone) {
      console.warn('[WhatsApp] Telefone não identificado.');
      return;
    }

    const phone = rawPhone.replace(/\D/g, '');

    // 3. Buscar Usuário
    await updateLog({ step: 'finding_user', phone });
    const usersRef = db.collection('users');
    let userSnapshot = await usersRef.where('phone', '==', phone).get();

    if (userSnapshot.empty && phone.startsWith('55')) {
        if (phone.length === 12) {
            const phoneWith9 = phone.slice(0, 4) + '9' + phone.slice(4);
            userSnapshot = await usersRef.where('phone', '==', phoneWith9).get();
        } else if (phone.length === 13) {
             const phoneWithout9 = phone.slice(0, 4) + phone.slice(5);
             userSnapshot = await usersRef.where('phone', '==', phoneWithout9).get();
        }
    }

    if (userSnapshot.empty) {
      console.warn(`[WhatsApp] Usuário não encontrado: ${phone}`);
      await updateLog({ status: 'ignored', reason: `Usuário não encontrado: ${phone}` });
      return;
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // 4. Buscar Clientes Permitidos
    await updateLog({ step: 'finding_clients', userId });
    let clientsQuery;
    if (userData.role === 'Admin' || userData.role === 'Veterinário') {
        clientsQuery = db.collection('clients');
    } else {
        clientsQuery = db.collection('clients').where('assignedTechnicianIds', 'array-contains', userId);
    }
    
    const clientsSnapshot = await clientsQuery.get();
    const clientsList = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        farmName: doc.data().farmName
    }));

    if (clientsList.length === 0) {
      console.warn(`[WhatsApp] Usuário ${userData.name} sem clientes.`);
      return;
    }

    // 5. IA (Gemini)
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY não configurada no Firebase Functions.");
    }

    await updateLog({ step: 'calling_ai', clientsCount: clientsList.length });
    
    const prompt = `
      Você é um assistente de CRM agropecuário que processa mensagens de WhatsApp.
      CONTEXTO: Técnico: ${userData.name}, Mensagem: "${messageText}", Mídia: ${mediaUrl ? 'Sim' : 'Não'}
      CLIENTES: ${JSON.stringify(clientsList)}
      TAREFA: Extraia em JSON:
      1. "clientId": ID do cliente (ou null).
      2. "action": Ação (Visita, Entrega, Observação).
      3. "summary": Resumo profissional.
      4. "date": Data (ISO 8601).
      5. "products": Lista de produtos.
      6. "sentiment": Positivo/Neutro/Negativo.
      REGRAS: Se for "Oi", action="Ignorar". Responda APENAS JSON.
    `;

    let result;
    try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });
        
        let jsonStr = response.text;
        if (!jsonStr) throw new Error("Empty response");
        jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
        result = JSON.parse(jsonStr);
        
        await updateLog({ step: 'json_parsed', result });
    } catch (aiError) {
        console.error("AI Error:", aiError);
        await updateLog({ step: 'ai_error', error: String(aiError) });
        result = {
            clientId: null,
            action: "Observação",
            summary: `Mensagem: "${messageText}" (IA Falhou)`,
            date: new Date().toISOString(),
            sentiment: "Neutro",
            products: []
        };
    }

    // 6. Salvar no Banco
    if (result.action === 'Ignorar' || (!result.clientId && !result.summary)) {
      await updateLog({ status: 'ignored', reason: 'Irrelevante ou Cliente não identificado' });
      return;
    }

    // Buscar Deal
    let dealId = null;
    if (result.clientId) {
        const dealsRef = db.collection('deals');
        const dealsSnap = await dealsRef
            .where('clientId', '==', result.clientId)
            .where('status', 'in', ['Open', 'Won'])
            .get();
        
        if (!dealsSnap.empty) {
            // Ordenar manualmente pois Firestore precisa de índice composto para orderBy com where
            const sortedDeals = dealsSnap.docs.sort((a, b) => (b.data().updatedAt || '').localeCompare(a.data().updatedAt || ''));
            dealId = sortedDeals[0].id;
        }
    }

    const newActivity = {
      clientId: result.clientId,
      dealId: dealId,
      type: 'Whatsapp',
      title: result.clientId ? `Registro via WhatsApp: ${result.action}` : `[SEM CLIENTE] ${result.action}`,
      description: `${result.summary}\n\n(Enviado por ${userData.name})`,
      dueDate: result.date || new Date().toISOString(),
      isDone: true,
      technicianId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      attachments: mediaUrl ? [{ type: 'image', url: mediaUrl, name: 'Anexo WhatsApp' }] : [],
      customAttributes: {
        sentiment: result.sentiment || 'Neutro',
        products: result.products || [],
        source: 'whatsapp_integration'
      }
    };

    await db.collection('activities').add(newActivity);

    if (dealId) {
        await db.collection('deals').doc(dealId).update({
            updatedAt: new Date().toISOString(),
            lastStageChangeDate: new Date().toISOString()
        });
    }

    await updateLog({ status: 'success', message: 'Atividade criada', createdActivity: newActivity });

  } catch (error) {
    console.error('[Webhook Error]', error);
    await db.collection('whatsapp_logs').add({
      payload,
      status: 'error',
      error: String(error),
      receivedAt: admin.firestore.Timestamp.now()
    });
  }
}

// --- CLOUD FUNCTION ---
export const whatsappWebhook = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  if (req.method === 'GET') {
    res.status(200).send('Webhook Ativo (GET)');
    return;
  }

  if (req.method === 'POST') {
    // Retornar XML (TwiML) IMEDIATAMENTE para o Twilio não dar erro 12200
    res.set('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    
    // Processar em segundo plano (após a resposta)
    // Nota: Em Cloud Functions 2nd Gen ou com concorrência, isso pode ser interrompido.
    // Mas para testes rápidos e 1st Gen costuma funcionar se for rápido.
    try {
        await processWhatsAppMessage(req.body);
    } catch (err) {
        console.error("Erro no processamento pós-resposta:", err);
    }
    return;
  }

  res.status(405).send('Method Not Allowed');
});
