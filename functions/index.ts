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

// --- FUNÇÃO AUXILIAR: DOWNLOAD E UPLOAD DE MÍDIA (TWILIO -> FIREBASE) ---
async function downloadAndUploadMedia(mediaUrl: string): Promise<string | null> {
    if (!mediaUrl) return null;

    try {
        console.log(`[Media] Baixando mídia: ${mediaUrl}`);
        
        const authHeader = 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
        
        // 1. Tenta fazer a requisição inicial com Auth e SEM seguir redirect automático
        // Isso é crucial porque o Twilio redireciona para o S3, e se mandarmos o header Auth para o S3, ele rejeita (400 Bad Request).
        let response = await fetch(mediaUrl, {
            headers: { 'Authorization': authHeader },
            redirect: 'manual' 
        });

        // 2. Se for redirecionamento (301, 302, 307), pega a nova URL e baixa sem auth
        if (response.status >= 300 && response.status < 400) {
            const redirectUrl = response.headers.get('location');
            if (redirectUrl) {
                console.log(`[Media] Redirecionado para S3/CDN. Baixando conteúdo...`);
                // Baixa da nova URL (S3) SEM os headers de autenticação do Twilio
                response = await fetch(redirectUrl); 
            } else {
                throw new Error(`Redirecionamento recebido sem header Location.`);
            }
        } 
        // 3. Se não for redirect mas der erro (ex: 401), tenta a URL original sem auth (fallback)
        else if (!response.ok) {
            console.log(`[Media] Falha com auth (${response.status}), tentando sem auth...`);
            response = await fetch(mediaUrl);
        }

        if (!response.ok) {
            throw new Error(`Falha final ao baixar mídia: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Detecta extensão pelo Content-Type
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        let ext = 'bin';
        if (contentType.includes('image/jpeg')) ext = 'jpg';
        else if (contentType.includes('image/png')) ext = 'png';
        else if (contentType.includes('audio/ogg')) ext = 'ogg';
        else if (contentType.includes('audio/mpeg')) ext = 'mp3';
        else if (contentType.includes('video/mp4')) ext = 'mp4';
        else if (contentType.includes('application/pdf')) ext = 'pdf';

        // 2. Upload para o Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `whatsapp-media/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
        const file = bucket.file(fileName);

        await file.save(buffer, {
            metadata: { contentType: contentType },
            public: true
        });

        // 3. Gerar URL Pública (Assinada de Longa Duração)
        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2225' 
        });

        console.log(`[Media] Upload concluído: ${signedUrl}`);
        return signedUrl;

    } catch (error) {
        console.error("[Media] Erro no processamento:", error);
        return mediaUrl; // Retorna a URL original em caso de falha (fallback)
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
export async function processMessageLogic(payload: WhatsAppPayload, logRef: admin.firestore.DocumentReference) {
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

    // --- PROCESSAMENTO DE MÍDIA (TWILIO -> FIREBASE) ---
    if (mediaUrl) {
        await updateLog({ step: 'downloading_media', originalUrl: mediaUrl });
        const newUrl = await downloadAndUploadMedia(mediaUrl);
        if (newUrl) {
            mediaUrl = newUrl;
            await updateLog({ step: 'media_uploaded', newUrl: mediaUrl });
        }
    }

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
      // AVISO DE USUÁRIO NÃO CADASTRADO COM O NÚMERO PARA FACILITAR
      await enviarMensagemWhatsApp(rawPhone, `🚫 Acesso Negado.\n\nO número *${phone}* não está vinculado a nenhum usuário no CRM Zorion.\n\nPeça ao administrador para cadastrar este número exato no seu perfil de usuário.`);
      return;
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    // AVISO IMEDIATO DE RECEBIMENTO (Feedback para o usuário)
    // Envia apenas se não for uma mensagem de mídia pura sem texto (para evitar spam em uploads múltiplos)
    if (messageText.length > 0) {
        const firstName = userData.name.split(' ')[0];
        await enviarMensagemWhatsApp(rawPhone, `Olá ${firstName}. Recebido. ⏳ Estou processando sua solicitação no CRM Zorion.`);
    }

    // 4. Buscar Clientes, Pipelines e Estágios
    await updateLog({ step: 'finding_data', userId });
    
    let clientsQuery;
    // Lógica de Permissão: Admin/Veterinário vê tudo; Outros só os vinculados
    if (userData.role === 'Admin' || userData.role === 'Veterinário' || userData.role === 'Master') {
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
      await enviarMensagemWhatsApp(rawPhone, "⚠️ Você não tem clientes vinculados à sua conta. Peça ao administrador para atribuir clientes a você.");
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
      
      DADOS DO USUÁRIO:
      - Nome: ${userData.name}
      - Cargo: ${userData.role} (Se for 'Master', 'Admin' ou 'Veterinário', tem ACESSO TOTAL a todas as abas/funis e clientes. Se for 'Técnico', acesso restrito aos seus clientes.)

      DADOS DO SISTEMA:
      - Texto Original: "${messageText}"
      - Tem Mídia? ${mediaUrl ? 'Sim' : 'Não'}
      - Clientes Disponíveis (ID: Nome - Fazenda): ${JSON.stringify(clientsList.map(c => ({ id: c.id, name: c.name, farm: c.farmName })))}
      - Pipelines (Funis/Abas): ${JSON.stringify(pipelinesList)}
      - Estágios (Colunas): ${JSON.stringify(stagesList)}
      
      OBJETIVO: Interpretar a mensagem e estruturar os dados para o CRM.
      
      REGRAS DE CLIENTE (SEGURANÇA):
      - O usuário "Técnico" SÓ PODE acessar os clientes listados em "Clientes Disponíveis". Se tentar acessar outro, bloqueie.
      - O usuário "Admin", "Master" ou "Veterinário" TEM PERMISSÃO TOTAL. Ele pode acessar, editar e criar registros para QUALQUER cliente, mesmo que não esteja na lista "Clientes Disponíveis".
      - Se o usuário for Admin/Master/Vet e mencionar um cliente que não está na lista, assuma que ele existe e use o nome fornecido para buscar ou criar.
      - Se for um NOVO CLIENTE (apenas para Admin/Master/Vet):
          - TENTE AO MÁXIMO extrair o nome do cliente e da fazenda do texto.
          - Preencha "newClientName" com o nome do responsável/cliente. Se não achar, use "Cliente WhatsApp [Telefone]".
          - Preencha "newFarmName" com o nome da fazenda. Se não achar, use "Fazenda sem Nome".
          - Deixe "clientId" como null.
          - Defina a intenção como "NewDeal" (para já criar uma oportunidade) ou "LogActivity" (apenas cadastro).
      - Se o usuário for "Técnico" e tentar criar cliente ou acessar um fora da lista, responda: "❌ Você não tem permissão para acessar/criar o cliente [Nome]."
      
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
      6. "QueryClient" (Consultar/Ler Dados):
         - Use quando o usuário perguntar sobre um cliente: "Como está o Ademar?", "Me passe a ficha do Sítio X", "Qual o telefone dele?".
      7. "UpdateClient" (Editar Cadastro):
         - Use quando o usuário quiser alterar dados CADASTRAIS: "Mude o telefone do Ademar", "Corrija o nome da fazenda".
      8. "ScheduleVisit" (Agendar Visita Futura):
         - Use quando o usuário quiser MARCAR um compromisso futuro: "Agende visita no Ademar para sexta-feira", "Marcar visita amanhã".
         - A data deve ser futura.
      10. "DeleteRecord" (Excluir Registro):
          - Use APENAS se o usuário pedir explicitamente para EXCLUIR, DELETAR ou REMOVER algo.
          - PERMISSÃO: 
             - Usuário Comum: Pode excluir APENAS o que ele mesmo criou (tarefas, visitas, atividades).
             - Admin/Master/Veterinário: Pode excluir QUALQUER registro de QUALQUER pessoa.
          - Identifique o tipo: 
             - "task" (tarefa rápida), 
             - "visit" (visita técnica completa), 
             - "activity" (visita rápida/registro no card),
             - "deal" (negócio/oportunidade), 
             - "client" (cliente).
          - Identifique o alvo: ID (se fornecido) ou descrição/nome para busca.
          - Preencha "deleteType" e "deleteTarget".

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
        "intent": "UpdateDeal" | "NewDeal" | "NewVisit" | "LogActivity" | "Clarification" | "QueryClient" | "UpdateClient" | "ScheduleVisit" | "CreateTask" | "DeleteRecord" | "Ignorar",
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
        "clientUpdates": { "phone": "...", "email": "...", "farmName": "...", "name": "..." },
        "assigneeName": "Nome da pessoa responsável (apenas se mencionado explicitamente)",
        "deleteType": "task" | "visit" | "deal" | "client" | "activity" | null,
        "deleteTarget": "Descrição ou ID do alvo para exclusão",
        "sentiment": "Positivo" | "Neutro" | "Negativo",
        "replyToUser": "Mensagem de resposta para o WhatsApp"
      }
    `;

    let result: any;
    try {
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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

    // --- LÓGICA DE EXCLUSÃO (DELETE) ---
    if (result.intent === 'DeleteRecord') {
        const isAdminEmail = (userData.email || '').toLowerCase() === 'l.rigolin@zorionan.com';
        const isAdmin = isAdminEmail || userData.role === 'Admin' || userData.role === 'Master' || userData.role === 'Veterinário';
        
        let deletedCount = 0;
        let collectionName = '';

        if (result.deleteType === 'task') collectionName = 'todos';
        else if (result.deleteType === 'visit') collectionName = 'visits';
        else if (result.deleteType === 'activity') collectionName = 'activities';
        else if (result.deleteType === 'deal') collectionName = 'deals';
        else if (result.deleteType === 'client') collectionName = 'clients';

        if (collectionName && result.deleteTarget) {
            // Tenta buscar por ID direto se parecer um ID
            let docRef = db.collection(collectionName).doc(result.deleteTarget);
            let docSnap = await docRef.get();
            let foundDoc = null;

            if (docSnap.exists) {
                foundDoc = docSnap;
            } else {
                // Busca por texto/descrição (busca simples)
                const snapshot = await db.collection(collectionName)
                    .orderBy('createdAt', 'desc') // Pega os mais recentes
                    .limit(20)
                    .get();
                
                const target = result.deleteTarget.toLowerCase();
                
                for (const doc of snapshot.docs) {
                    const data = doc.data();
                    let match = false;
                    
                    // Verifica campos comuns
                    if (data.title && data.title.toLowerCase().includes(target)) match = true;
                    if (data.description && data.description.toLowerCase().includes(target)) match = true;
                    if (data.text && data.text.toLowerCase().includes(target)) match = true; // Tasks
                    if (data.name && data.name.toLowerCase().includes(target)) match = true; // Clients
                    if (data.report && data.report.toLowerCase().includes(target)) match = true; // Visits

                    if (match) {
                        foundDoc = doc;
                        break; // Deleta apenas o primeiro encontrado para segurança
                    }
                }
            }

            if (foundDoc) {
                const data = foundDoc.data();
                // VERIFICAÇÃO DE PROPRIEDADE
                // Se for Admin, pode tudo.
                // Se não for Admin, só pode se for o criador.
                const isCreator = (data?.creatorId === userId) || (data?.technicianId === userId) || (data?.userId === userId);
                
                if (isAdmin || isCreator) {
                    await foundDoc.ref.delete();
                    deletedCount = 1;
                } else {
                    await enviarMensagemWhatsApp(rawPhone, "🚫 Você não tem permissão para excluir este registro (pertence a outro usuário).");
                    return;
                }
            }
        }

        if (deletedCount > 0) {
            await enviarMensagemWhatsApp(rawPhone, `🗑️ Registro excluído com sucesso.`);
            await updateLog({ status: 'success', message: 'Registro excluído', type: result.deleteType });
        } else {
            await enviarMensagemWhatsApp(rawPhone, `⚠️ Não encontrei nenhum registro correspondente a "${result.deleteTarget}" que você possa excluir.`);
        }
        return;
    }

    // --- LÓGICA DE CRIAÇÃO DE CLIENTE (ON THE FLY) ---
    if (!result.clientId && result.newClientName) {
        try {
            const newClientData = {
                name: result.newClientName || `Cliente WhatsApp ${phone.slice(-4)}`,
                farmName: result.newFarmName || 'Fazenda sem Nome',
                phone: phone, // Usa o telefone que mandou a mensagem
                email: '',
                assignedTechnicianId: userId,
                assignedTechnicianIds: [userId],
                status: 'Active', // Padronizado com o site
                tags: ['WhatsApp'], // Tag para identificar origem
                city: '',
                state: '',
                address: '',
                notes: `Criado via WhatsApp em ${new Date().toLocaleDateString('pt-BR')}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                active: true,
                origin: 'WhatsApp'
            };
            const newClientRef = await db.collection('clients').add(newClientData);
            result.clientId = newClientRef.id;
            await updateLog({ step: 'client_created', newClientId: result.clientId, data: newClientData });
        } catch (err) {
            console.error("Erro ao criar cliente:", err);
            await updateLog({ status: 'error', error: 'Falha ao criar cliente: ' + err });
        }
    }

    if (!result.clientId && result.intent !== 'LogActivity') {
        result.intent = 'LogActivity'; 
    }

    const commonAttachments = mediaUrl ? [{ type: 'image', url: mediaUrl, name: 'Mídia WhatsApp' }] : [];

    // --- NOVAS INTENÇÕES: CONSULTA E EDIÇÃO ---

    if (result.intent === 'UpdateClient' && result.clientId) {
        if (result.clientUpdates && Object.keys(result.clientUpdates).length > 0) {
            // Filtra apenas campos válidos e não vazios
            const validUpdates: any = {};
            if (result.clientUpdates.phone) validUpdates.phone = result.clientUpdates.phone;
            if (result.clientUpdates.email) validUpdates.email = result.clientUpdates.email;
            if (result.clientUpdates.farmName) validUpdates.farmName = result.clientUpdates.farmName;
            if (result.clientUpdates.name) validUpdates.name = result.clientUpdates.name;
            
            validUpdates.updatedAt = new Date().toISOString();

            await db.collection('clients').doc(result.clientId).update(validUpdates);
            await updateLog({ status: 'success', message: 'Cliente Atualizado', updates: validUpdates });
            await enviarMensagemWhatsApp(rawPhone, result.replyToUser || "✅ Dados do cliente atualizados com sucesso.");
        } else {
            await enviarMensagemWhatsApp(rawPhone, "⚠️ Entendi que você quer alterar dados, mas não identifiquei quais. Tente: 'Mude o telefone do Ademar para X'.");
        }
        return; // Encerra aqui para UpdateClient
    }

    if (result.intent === 'QueryClient' && result.clientId) {
        // 1. Buscar Dados do Cliente
        const clientDoc = await db.collection('clients').doc(result.clientId).get();
        const clientData = clientDoc.data();

        // 2. Buscar Último Deal
        const dealsSnap = await db.collection('deals')
            .where('clientId', '==', result.clientId)
            .orderBy('updatedAt', 'desc')
            .limit(1)
            .get();
        const lastDeal = dealsSnap.empty ? null : dealsSnap.docs[0].data();
        const dealStageName = lastDeal ? (stagesList.find(s => s.id === lastDeal.stageId)?.name || 'Desconhecido') : '-';

        // 3. Buscar Última Visita
        const visitsSnap = await db.collection('visits')
            .where('clientId', '==', result.clientId)
            .orderBy('date', 'desc')
            .limit(1)
            .get();
        const lastVisit = visitsSnap.empty ? null : visitsSnap.docs[0].data();

        // 4. Montar Resposta
        const responseMsg = `📋 *Ficha do Cliente: ${clientData?.name}*\n` +
                            `🏠 Fazenda: ${clientData?.farmName || 'N/A'}\n` +
                            `📞 Tel: ${clientData?.phone || 'N/A'}\n` +
                            `------------------------------\n` +
                            `💲 *Último Negócio:*\n` +
                            `   Fase: ${dealStageName}\n` +
                            `   Valor: R$ ${lastDeal?.value || 0}\n` +
                            `   Atualizado em: ${lastDeal ? new Date(lastDeal.updatedAt).toLocaleDateString('pt-BR') : '-'}\n` +
                            `------------------------------\n` +
                            `📅 *Última Visita:*\n` +
                            `   Data: ${lastVisit ? new Date(lastVisit.date).toLocaleDateString('pt-BR') : '-'}\n` +
                            `   Relato: ${lastVisit?.report ? lastVisit.report.substring(0, 50) + '...' : '-'}`;

        await enviarMensagemWhatsApp(rawPhone, responseMsg);
        await updateLog({ status: 'success', message: 'Consulta realizada' });
        return; // Encerra aqui para QueryClient
    }

    if (result.intent === 'ScheduleVisit') {
        const scheduledDate = result.date || new Date().toISOString();
        const newVisit = {
            clientId: result.clientId,
            technicianId: userId,
            date: scheduledDate,
            report: result.description || "Agendamento via WhatsApp",
            type: 'Técnica',
            status: 'Agendada', // Status DIFERENTE de Concluída
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            photos: [],
            product: '',
            lot: ''
        };
        await db.collection('visits').add(newVisit);
        
        const formattedDate = new Date(scheduledDate).toLocaleDateString('pt-BR');
        await enviarMensagemWhatsApp(rawPhone, `📅 Agendado! Visita marcada para *${formattedDate}* no cliente.`);
        await updateLog({ status: 'success', message: 'Visita Agendada', data: newVisit });
        return;
    }

    if (result.intent === 'CreateTask') {
        let assignedUserId = userId;
        let assignedUserName = userData.name;
        let warningMsg = '';

        // Se houver tentativa de atribuição a terceiros
        if (result.assigneeName) {
            const isAdminEmail = (userData.email || '').toLowerCase() === 'l.rigolin@zorionan.com';
            // Verifica permissão (Admin, Master, Veterinário ou email específico)
            if (isAdminEmail || userData.role === 'Admin' || userData.role === 'Master' || userData.role === 'Veterinário') {
                // Busca usuário pelo nome (busca em memória para flexibilidade)
                const usersSnap = await db.collection('users').get();
                const targetUser = usersSnap.docs.find(doc => {
                    const u = doc.data();
                    const name = (u.name || '').toLowerCase();
                    const email = (u.email || '').toLowerCase();
                    const search = (result.assigneeName || '').toLowerCase();
                    return name.includes(search) || email.includes(search);
                });

                if (targetUser) {
                    assignedUserId = targetUser.id;
                    assignedUserName = targetUser.data().name;
                } else {
                    warningMsg = ` (⚠️ Não encontrei "${result.assigneeName}", atribuí a você)`;
                }
            } else {
                warningMsg = ` (⚠️ Sem permissão para delegar, atribuí a você)`;
            }
        }

        const newTask = {
            userId: assignedUserId,
            userName: assignedUserName,
            text: (result.description || result.title || "Nova Tarefa via WhatsApp") + (mediaUrl ? `\n[Mídia: ${mediaUrl}]` : ''),
            isDone: false,
            dueDate: result.date ? result.date.split('T')[0] : null, // Apenas data YYYY-MM-DD
            creatorId: userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            origin: 'WhatsApp'
        };

        await db.collection('todos').add(newTask);
        
        // Se a IA já gerou uma resposta boa, usa ela, senão gera uma padrão
        const responseMsg = result.replyToUser && !warningMsg ? result.replyToUser : `✅ Tarefa criada para *${assignedUserName.split(' ')[0]}*!${warningMsg}`;
        
        await enviarMensagemWhatsApp(rawPhone, responseMsg);
        
        // Se foi delegado para outra pessoa, avisa ela também (se tiver telefone)
        if (assignedUserId !== userId) {
             const targetUserDoc = await db.collection('users').doc(assignedUserId).get();
             const targetPhone = targetUserDoc.data()?.phone;
             if (targetPhone) {
                 await enviarMensagemWhatsApp(targetPhone, `📝 *Nova Tarefa Atribuída*\n\n"${newTask.text}"\n\nPor: ${userData.name}`);
             }
        }

        await updateLog({ status: 'success', message: 'Tarefa Criada', data: newTask });
        return;
    }

    // Ações baseadas na intenção (ESCRITA)
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
        
        // Atualiza a data da última visita no cliente para o alerta de inatividade funcionar
        if (result.clientId) {
            await db.collection('clients').doc(result.clientId).update({
                lastVisitDate: new Date().toISOString()
            });
        }

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

// --- 2. GATILHO DE PROCESSAMENTO (ASSÍNCRONO) ---
// Monitora a coleção de logs e processa quando chega novo item
export const processWhatsAppQueue = functions.firestore
    .document('whatsapp_logs/{logId}')
    .onCreate(async (snap: functions.firestore.QueryDocumentSnapshot, context: functions.EventContext) => {
        const logData = snap.data();
        if (logData.status !== 'pending_processing') return;

        const logRef = snap.ref;
        const payload = logData.payload as WhatsAppPayload;

        await processMessageLogic(payload, logRef);
    });

// --- 3. FUNÇÕES AGENDADAS (CRON JOBS) ---

// A. Checagem Pós-Visita (Roda a cada hora)
// Cobra detalhes de visitas recém-criadas que estão "vazias" ou curtas
export const checkRecentVisits = functions.pubsub.schedule('every 1 hours').onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    // Janela de tempo: entre 1h e 4h atrás (dá tempo do técnico sair da fazenda e pegar sinal)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);

    const visitsSnap = await db.collection('visits')
        .where('createdAt', '>=', fourHoursAgo.toISOString())
        .where('createdAt', '<=', oneHourAgo.toISOString())
        .get();

    for (const doc of visitsSnap.docs) {
        const visit = doc.data();
        
        // Se já foi lembrado ou se tem um relatório decente (> 40 chars), ignora
        if (visit.reminderSent || (visit.report && visit.report.length > 40)) {
            continue;
        }

        // Busca o técnico para pegar o telefone
        if (!visit.technicianId) continue;
        const userDoc = await db.collection('users').doc(visit.technicianId).get();
        const userData = userDoc.data();

        if (userData && userData.phone) {
            // Busca nome do cliente
            let clientName = "Cliente";
            if (visit.clientId) {
                const clientDoc = await db.collection('clients').doc(visit.clientId).get();
                if (clientDoc.exists) clientName = clientDoc.data()?.name || "Cliente";
            }

            const msg = `🤖 Olá ${userData.name.split(' ')[0]}! \n\nVi que você registrou uma visita no *${clientName}* há pouco tempo, mas o relatório está curto.\n\nTem algum detalhe importante para acrescentar? Pode me mandar um áudio ou texto aqui que eu complemento a visita para você! 📝`;
            
            await enviarMensagemWhatsApp(userData.phone, msg);
            
            // Marca que já enviou para não floodar
            await doc.ref.update({ reminderSent: true });
        }
    }
    return null;
});

// --- 4. API DE LOGS (PARA O FRONTEND) ---
export const whatsappLogs = functions.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    const logsSnap = await db.collection('whatsapp_logs')
      .orderBy('receivedAt', 'desc')
      .limit(20)
      .get();
    
    const logs = logsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// B. Checagem Diária (Roda todo dia às 08:00)
// Lembretes de agenda e Clientes esquecidos
export const dailyCRMCheck = functions.pubsub.schedule('every day 08:00').timeZone('America/Sao_Paulo').onRun(async (context) => {
    const db = admin.firestore();
    const today = new Date();
    today.setHours(0,0,0,0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Lembretes de Agenda (Visitas marcadas para hoje)
    // Assumindo que visitas futuras têm status 'Agendada' ou data futura
    const scheduledVisits = await db.collection('visits')
        .where('date', '>=', today.toISOString())
        .where('date', '<', tomorrow.toISOString())
        .get();

    // Agrupa por técnico
    const visitsByTech: any = {};
    
    scheduledVisits.docs.forEach(doc => {
        const v = doc.data();
        // Filtra apenas as que parecem ser agendamentos (não concluídas no passado)
        if (v.status !== 'Concluída' && v.technicianId) {
            if (!visitsByTech[v.technicianId]) visitsByTech[v.technicianId] = [];
            visitsByTech[v.technicianId].push(v);
        }
    });

    // Envia Lembretes de Agenda
    for (const techId of Object.keys(visitsByTech)) {
        const userDoc = await db.collection('users').doc(techId).get();
        const userData = userDoc.data();
        if (!userData || !userData.phone) continue;

        const visits = visitsByTech[techId];
        let msg = `📅 *Bom dia, ${userData.name.split(' ')[0]}!* \n\nVocê tem *${visits.length} visitas* agendadas para hoje:\n`;
        
        for (const v of visits) {
            let clientName = "Cliente";
            if (v.clientId) {
                const c = await db.collection('clients').doc(v.clientId).get();
                clientName = c.data()?.name || "Cliente";
            }
            msg += `- ${clientName}\n`;
        }
        
        msg += `\nBoa jornada! 🚀`;
        await enviarMensagemWhatsApp(userData.phone, msg);
    }

    // 2. Alerta de Clientes "Esquecidos" (> 45 dias sem visita)
    const fortyFiveDaysAgo = new Date();
    fortyFiveDaysAgo.setDate(fortyFiveDaysAgo.getDate() - 45);

    const forgottenClients = await db.collection('clients')
        .where('lastVisitDate', '<', fortyFiveDaysAgo.toISOString())
        .where('active', '==', true)
        .limit(100) 
        .get();

    const forgottenByTech: any = {};
    forgottenClients.docs.forEach(doc => {
        const c = doc.data();
        const techId = c.assignedTechnicianId || (c.assignedTechnicianIds && c.assignedTechnicianIds[0]);
        if (techId) {
            if (!forgottenByTech[techId]) forgottenByTech[techId] = [];
            // Limita a 3 lembretes por dia por técnico para não floodar
            if (forgottenByTech[techId].length < 3) {
                forgottenByTech[techId].push(c.name);
            }
        }
    });

    for (const techId of Object.keys(forgottenByTech)) {
        const clients = forgottenByTech[techId];
        if (clients.length === 0) continue;

        const userDoc = await db.collection('users').doc(techId).get();
        const userData = userDoc.data();
        if (!userData || !userData.phone) continue;

        let msg = `⚠️ *Atenção, ${userData.name.split(' ')[0]}*\n\nEstes clientes estão há mais de 45 dias sem visita:\n`;
        clients.forEach((name: string) => msg += `- ${name}\n`);
        msg += `\nQue tal agendar uma visita ou mandar um "Oi"?`;

        await enviarMensagemWhatsApp(userData.phone, msg);
    }

    return null;
});
