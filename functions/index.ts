import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";
import twilio from "twilio";

admin.initializeApp();
const db = admin.firestore();

// --- CONFIGURAÇÃO ---
// A chave é carregada automaticamente do arquivo .env na pasta functions
const GEMINI_API_KEY = process.env.GEMINI_API_KEY?.trim();
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID?.trim();
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN?.trim();
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER?.trim(); // Ex: whatsapp:+14155238886

// --- FUNÇÃO DE ENVIO WHATSAPP (REUTILIZÁVEL) ---
async function enviarMensagemWhatsApp(to: string, body: string) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        console.error("Credenciais do Twilio não configuradas.");
        return;
    }

    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    try {
        await client.messages.create({
            from: TWILIO_PHONE_NUMBER,
            to: to,
            body: body
        });
        console.log(`Mensagem enviada para ${to}: ${body}`);
    } catch (error) {
        console.error("Erro ao enviar mensagem WhatsApp:", error);
    }
}

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

// --- LÓGICA PESADA (IA + CRM) ---
async function processMessageLogic(payload: WhatsAppPayload, logRef: admin.firestore.DocumentReference) {
  const updateLog = async (data: any) => {
      try { await logRef.update(data); } catch (e) { console.error("Error updating log:", e); }
  };

  try {
    await updateLog({ step: 'extracting_data', status: 'processing' });

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
      await updateLog({ status: 'error', error: 'Telefone não identificado' });
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

    // AVISO IMEDIATO DE RECEBIMENTO (Feedback para o usuário)
    // Envia apenas se não for uma mensagem de mídia pura sem texto (para evitar spam em uploads múltiplos)
    if (messageText.length > 0) {
        await enviarMensagemWhatsApp(rawPhone, "🤖 Recebi! Estou analisando sua solicitação...");
    }

    // 4. Buscar Clientes, Pipelines e Estágios
    await updateLog({ step: 'finding_data', userId });
    
    let clientsQuery;
    if (userData.role === 'Admin' || userData.role === 'Veterinário') {
        clientsQuery = db.collection('clients');
    } else {
        clientsQuery = db.collection('clients').where('assignedTechnicianIds', 'array-contains', userId);
    }
    
    const [clientsSnapshot, pipelinesSnapshot, stagesSnapshot] = await Promise.all([
        clientsQuery.get(),
        db.collection('pipelines').get(),
        db.collection('stages').get()
    ]);

    const clientsList = clientsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        farmName: doc.data().farmName
    }));

    const pipelinesList = pipelinesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
    }));

    const stagesList = stagesSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        pipelineId: doc.data().pipelineId
    }));

    if (clientsList.length === 0) {
      console.warn(`[WhatsApp] Usuário ${userData.name} sem clientes.`);
      await updateLog({ status: 'warning', message: 'Usuário sem clientes vinculados' });
      return;
    }

    // 5. Otimização de IA
    const lowerMsg = messageText.toLowerCase().trim();
    const isShortGreeting = ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'teste'].includes(lowerMsg);
    
    if (isShortGreeting && !mediaUrl) {
        await updateLog({ step: 'skipped_ai', reason: 'Mensagem curta/saudação' });
        await enviarMensagemWhatsApp(rawPhone, "Olá! Como posso ajudar você hoje no CRM?");
        return; 
    }

    // 6. IA (Gemini)
    if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY não configurada.");
    }

    await updateLog({ step: 'calling_ai', clientsCount: clientsList.length });
    
    const todayISO = new Date().toISOString();
    const todayLocale = new Date().toLocaleDateString('pt-BR');

    const prompt = `
      Atue como uma secretária executiva de alto nível do CRM Zorion.
      DATA DE HOJE: ${todayLocale} (ISO: ${todayISO})
      
      DADOS DO SISTEMA:
      - Técnico: ${userData.name}
      - Texto Original: "${messageText}"
      - Tem Mídia? ${mediaUrl ? 'Sim' : 'Não'}
      - Clientes Disponíveis (ID: Nome - Fazenda): ${JSON.stringify(clientsList.map(c => ({ id: c.id, name: c.name, farm: c.farmName })))}
      - Pipelines (Funis): ${JSON.stringify(pipelinesList)}
      - Estágios (Colunas): ${JSON.stringify(stagesList)}
      
      OBJETIVO: Interpretar a mensagem e estruturar os dados para o CRM.
      
      REGRAS DE CLIENTE:
      - Identifique o cliente pelo nome. Se já existir, use o ID. Se for novo, preencha "newClientName".
      
      REGRAS DE INTENÇÃO (CRÍTICO):
      1. "UpdateDeal" (Atualizar/Registrar em Card Existente):
         - Use para clientes JÁ EXISTENTES quando for atividade de rotina: "entreguei ração", "gado comendo", "visita de rotina", "vacinação".
         - A IA deve buscar o card ativo desse cliente e adicionar a informação.
         - IMPORTANTE: NÃO mude o estágio (stageId) a menos que o usuário peça explicitamente (ex: "mova para fechamento"). Para rotina, mantenha o estágio atual.
      2. "NewDeal" (Novo Card/Ciclo):
         - Use OBRIGATORIAMENTE se for um NOVO CLIENTE (primeiro registro).
         - Use para clientes antigos APENAS se for uma nova negociação comercial separada.
      3. "NewVisit" (Visita Técnica Oficial):
         - Apenas relatórios formais de visita técnica.
      4. "LogActivity" (Atividade Avulsa):
         - Apenas se não houver intenção de criar/atualizar um card de produção/venda.
      5. "Clarification" (Pedir Ajuda):
         - Use se houver dúvida (ex: não sabe se cria um novo card ou atualiza, ou qual funil usar).
         - Pergunte ao usuário o que ele prefere.

      DIRETRIZES DE CONTEÚDO:
      - Description: Transcreva TUDO com detalhes. Ex: "Entregue ração 20/80. Contagem: 150 animais".
      - Title: Para atualizações, use algo como "Registro de Rotina" ou "Entrega de Insumos".
      - ReplyToUser: 
         - SEJA ESPECÍFICO. Diga ONDE salvou.
         - Ex: "Atualizei o card do Ademar na fase 'Engorda' do funil 'Principal' com a entrega."
         - Ex: "Criei um novo card para o cliente Novo na fase 'Prospecção'."
         - Se for Clarification, faça a pergunta.

      SAÍDA JSON OBRIGATÓRIA:
      {
        "intent": "UpdateDeal" | "NewDeal" | "NewVisit" | "LogActivity" | "Clarification" | "Ignorar",
        "clientId": "ID ou null",
        "newClientName": "Nome se novo",
        "newFarmName": "Fazenda se nova",
        "pipelineId": "ID do pipeline (apenas se NewDeal)",
        "stageId": "ID do estágio (APENAS se houver mudança explícita de fase. Para rotina, envie null)",
        "title": "Título Profissional",
        "description": "Texto COMPLETO e formatado do relato",
        "value": 0.00,
        "date": "${todayISO}",
        "products": ["Produto Citado"],
        "sentiment": "Positivo" | "Neutro" | "Negativo",
        "replyToUser": "Mensagem de resposta para o WhatsApp"
      }
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
            intent: "LogActivity",
            clientId: null,
            title: "Nova Mensagem (WhatsApp)",
            description: messageText,
            date: new Date().toISOString(),
            sentiment: "Neutro",
            products: [],
            replyToUser: "Tive um problema ao processar sua mensagem, mas salvei como atividade no sistema."
        };
    }

    if (result.intent === 'Ignorar') {
      await updateLog({ status: 'ignored', reason: 'IA classificou como irrelevante' });
      return;
    }

    if (result.intent === 'Clarification') {
        await enviarMensagemWhatsApp(rawPhone, result.replyToUser || "Poderia esclarecer melhor?");
        await updateLog({ status: 'clarification_requested', question: result.replyToUser });
        return;
    }

    // --- LÓGICA DE CRIAÇÃO DE CLIENTE (ON THE FLY) ---
    if (!result.clientId && result.newClientName) {
        try {
            const newClientData = {
                name: result.newClientName,
                farmName: result.newFarmName || 'Nova Fazenda',
                phone: '',
                email: '',
                assignedTechnicianId: userId,
                assignedTechnicianIds: [userId],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                active: true,
                origin: 'WhatsApp'
            };
            const newClientRef = await db.collection('clients').add(newClientData);
            result.clientId = newClientRef.id;
            await updateLog({ step: 'client_created', newClientId: result.clientId });
        } catch (err) {
            console.error("Erro ao criar cliente:", err);
        }
    }

    if (!result.clientId && result.intent !== 'LogActivity') {
        result.intent = 'LogActivity'; 
    }

    const commonAttachments = mediaUrl ? [{ type: 'image', url: mediaUrl, name: 'Mídia WhatsApp' }] : [];

    // Ações baseadas na intenção
    if (result.intent === 'UpdateDeal' && result.clientId) {
        const dealsRef = db.collection('deals');
        const dealsSnap = await dealsRef
            .where('clientId', '==', result.clientId)
            .where('status', 'in', ['Open'])
            .get();
        
        if (!dealsSnap.empty) {
            const sortedDeals = dealsSnap.docs.sort((a, b) => (b.data().updatedAt || '').localeCompare(a.data().updatedAt || ''));
            const dealToUpdate = sortedDeals[0];
            const dealData = dealToUpdate.data();

            const updateData: any = {
                updatedAt: new Date().toISOString(),
                description: (dealData.description || '') + `\n\n---\n**Atualização via WhatsApp (${new Date().toLocaleDateString()}):**\n${result.description}` + (mediaUrl ? `\n[Mídia: ${mediaUrl}]` : '')
            };

            if (result.stageId && result.stageId !== dealData.stageId) {
                updateData.stageId = result.stageId;
                updateData.lastStageChangeDate = new Date().toISOString();
            }
            if (result.value && result.value > 0) {
                updateData.value = result.value;
            }

            await db.collection('deals').doc(dealToUpdate.id).update(updateData);

            // IMPORTANTE: Criar também uma Activity para aparecer na timeline
            const activityData = {
                clientId: result.clientId,
                dealId: dealToUpdate.id,
                type: 'Whatsapp',
                title: result.title || "Atualização de Card",
                description: result.description,
                dueDate: new Date().toISOString(),
                isDone: true,
                technicianId: userId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                attachments: commonAttachments,
                customAttributes: { source: 'whatsapp_update' }
            };
            await db.collection('activities').add(activityData);

            await updateLog({ status: 'success', message: 'Oportunidade Atualizada e Atividade Criada', dealId: dealToUpdate.id });
        } else {
            result.intent = 'NewDeal'; 
        }
    }

    if (result.intent === 'NewDeal') {
        const newDeal = {
            clientId: result.clientId,
            title: result.title || "Oportunidade WhatsApp",
            description: result.description + (mediaUrl ? `\n\n[Mídia Anexa: ${mediaUrl}]` : ''),
            value: result.value || 0,
            stageId: result.stageId || 'stg_1',
            pipelineId: result.pipelineId || 'pip_principal',
            status: 'Open',
            creatorId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            probability: 25,
            source: 'WhatsApp',
            products: result.products || [],
            attachments: commonAttachments
        };
        await db.collection('deals').add(newDeal);
        await updateLog({ status: 'success', message: 'Oportunidade (Deal) criada', data: newDeal });
    } 
    else if (result.intent === 'NewVisit') {
        const newVisit = {
            clientId: result.clientId,
            technicianId: userId,
            date: result.date || new Date().toISOString(),
            report: result.description,
            type: 'Técnica',
            status: 'Concluída',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            photos: mediaUrl ? [mediaUrl] : [],
            product: result.products?.[0] || '',
            lot: ''
        };
        await db.collection('visits').add(newVisit);
        await updateLog({ status: 'success', message: 'Visita criada', data: newVisit });
    }
    else if (result.intent === 'LogActivity') {
        let dealId = null;
        if (result.clientId) {
            const dealsRef = db.collection('deals');
            const dealsSnap = await dealsRef
                .where('clientId', '==', result.clientId)
                .where('status', 'in', ['Open', 'Won'])
                .get();
            
            if (!dealsSnap.empty) {
                const sortedDeals = dealsSnap.docs.sort((a, b) => (b.data().updatedAt || '').localeCompare(a.data().updatedAt || ''));
                dealId = sortedDeals[0].id;
            }
        }

        const newActivity = {
            clientId: result.clientId,
            dealId: dealId,
            type: 'Whatsapp',
            title: result.title || "Contato WhatsApp",
            description: result.description,
            dueDate: result.date || new Date().toISOString(),
            isDone: true,
            technicianId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: commonAttachments,
            customAttributes: {
                sentiment: result.sentiment || 'Neutro',
                products: result.products || [],
                source: 'whatsapp_integration',
                originalIntent: result.intent
            }
        };

        await db.collection('activities').add(newActivity);
        if (dealId) {
            await db.collection('deals').doc(dealId).update({
                updatedAt: new Date().toISOString(),
                lastStageChangeDate: new Date().toISOString()
            });
        }
        await updateLog({ status: 'success', message: 'Atividade criada', data: newActivity });
    }

    // 7. Enviar Resposta no WhatsApp
    if (result.replyToUser) {
        await enviarMensagemWhatsApp(rawPhone, result.replyToUser);
    }

  } catch (error) {
    console.error('[Logic Error]', error);
    await updateLog({ status: 'error', error: String(error) });
  }
}

// --- 1. WEBHOOK HTTP (RÁPIDO) ---
// Apenas recebe, salva no banco e responde 200 OK para o Twilio não dar timeout.
export const whatsappWebhook = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  if (req.method === 'POST') {
    try {
        // Salva na fila de processamento
        await db.collection('whatsapp_logs').add({
            payload: req.body,
            receivedAt: admin.firestore.Timestamp.now(),
            status: 'pending_processing', // Status inicial para o gatilho pegar
            step: 'queued'
        });
        
        // Responde IMEDIATAMENTE para o Twilio
        res.set('Content-Type', 'text/xml');
        res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    } catch (err) {
        console.error("Erro ao enfileirar:", err);
        res.status(500).send('Internal Server Error');
    }
    return;
  }

  res.status(200).send('Webhook Ativo (GET)');
});

// --- 2. GATILHO DE PROCESSAMENTO (BACKGROUND) ---
// Acionado automaticamente quando um novo documento é criado em 'whatsapp_logs'
export const processWhatsAppQueue = functions.firestore
    .document('whatsapp_logs/{logId}')
    .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot, context: functions.EventContext) => {
        const data = snap.data();
        
        // Só processa se estiver com status 'pending_processing'
        // Isso evita loops infinitos ou processamento de logs antigos/manuais
        if (data.status !== 'pending_processing') {
            return;
        }

        console.log(`Iniciando processamento do log ${context.params.logId}`);
        await processMessageLogic(data.payload, snap.ref);
    });
