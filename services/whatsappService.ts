import { collection, addDoc, getDocs, runTransaction, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { COLLECTIONS } from './dbSchema.ts';
import { db, auth, storage } from './firebase.ts';
import { signInAnonymously } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import axios from 'axios';

// Interface para o Payload do WhatsApp (Z-API)
interface WhatsAppPayload {
  phone?: string; // Z-API
  text?: { message?: string }; // Z-API
  image?: { imageUrl?: string; caption?: string }; // Z-API
  audio?: { audioUrl?: string }; // Z-API
  video?: { videoUrl?: string; caption?: string }; // Z-API
  connectedPhone?: string; // Z-API (receiver)
  
  // Compatibilidade com outros (Twilio/Waha)
  Body?: string;
  From?: string;
  To?: string; // Twilio (receiver)
  MediaUrl0?: string;
  
  [key: string]: any;
}

export async function processWhatsAppMessage(payload: WhatsAppPayload): Promise<{ success: boolean; noAccess?: boolean; replyText?: string }> {
  try {
    // Ensure we are authenticated before any DB operation
    if (!auth.currentUser) {
        console.log('[WhatsApp Service] Authenticating anonymously...');
        await signInAnonymously(auth);
    }

    // Extrair dados básicos (Normalizar telefone e conteúdo)
    const rawPhone = payload.phone || payload.From || '';
    const rawReceiverPhone = payload.connectedPhone || payload.To || '';
    
    if (!rawPhone) {
      console.warn('[WhatsApp] Telefone não identificado no payload.');
      return { success: false };
    }

    const phone = rawPhone.replace(/\D/g, ''); 
    const receiverPhone = rawReceiverPhone.replace(/\D/g, '');

    // Log detalhado para o número problemático
    if (phone === '554499641172') {
        console.log('[WhatsApp Service] DEBUG 554499641172 Payload:', JSON.stringify(payload));
        try {
            await addDoc(collection(db, 'whatsapp_logs'), {
                phone,
                type: 'debug_payload',
                payload: JSON.stringify(payload),
                receivedAt: new Date().toISOString()
            });
        } catch (e) {
            console.error('Erro ao salvar log de debug:', e);
        }
    }

    // --- VERIFICAÇÃO DE ACESSO ---
    // Verifica se o número que enviou a mensagem pertence a algum usuário cadastrado
    const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    const authorizedUser = usersSnap.docs.find(doc => {
        const u = doc.data();
        return u.phone && u.phone.replace(/\D/g, '') === phone;
    });

    if (!authorizedUser) {
        console.warn(`[WhatsApp] Acesso negado para o número: ${phone}`);
        return { success: false, noAccess: true };
    }
    // --- FIM VERIFICAÇÃO ---

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
    } else if (payload.photo && payload.photo.photoUrl) {
        mediaUrl = payload.photo.photoUrl;
        mediaType = 'image';
    } else if (payload.document && payload.document.documentUrl) {
        mediaUrl = payload.document.documentUrl;
        mediaType = 'document';
    } else if (payload.audio && payload.audio.audioUrl) {
        mediaUrl = payload.audio.audioUrl;
        mediaType = 'audio';
        messageText = messageText || "[Áudio Enviado]"; // Garantir texto se for só áudio
    } else if (payload.video && payload.video.videoUrl) {
        mediaUrl = payload.video.videoUrl;
        mediaType = 'video';
    } else if (payload.MediaUrl0) {
        mediaUrl = payload.MediaUrl0;
        const twilioContentType = payload.MediaContentType0 || '';
        if (twilioContentType.includes('image')) mediaType = 'image';
        else if (twilioContentType.includes('audio')) mediaType = 'audio';
        else if (twilioContentType.includes('video')) mediaType = 'video';
        else mediaType = 'document';
        console.log(`[WhatsApp Service] Twilio media detected: ${mediaUrl} (${mediaType})`);
    } else if (payload.mediaUrl) {
        mediaUrl = payload.mediaUrl;
        mediaType = payload.mediaType || 'image';
    }

    // Se a mídia vem de fora (Twilio, Z-API, etc), tentamos baixar e re-upar para o Firebase Storage
    // para garantir que a URL seja permanente e acessível no CRM
    if (mediaUrl && !mediaUrl.includes('firebasestorage.googleapis.com')) {
        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;

            console.log('[WhatsApp Service] Downloading external media:', mediaUrl);
            console.log(`[WhatsApp Service] Twilio Credentials Check - SID: ${accountSid ? 'Present' : 'Missing'}, Token: ${authToken ? 'Present' : 'Missing'}`);
            
            const axiosConfig: any = {
                responseType: 'arraybuffer',
                timeout: 30000, // Aumentado para 30s
                httpsAgent: new (await import('https')).Agent({ rejectUnauthorized: false }),
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'image/*,video/*,audio/*,application/*'
                }
            };

            // Se for Twilio, adiciona autenticação básica
            if (mediaUrl.includes('twilio.com')) {
                if (accountSid && authToken) {
                    console.log('[WhatsApp Service] Using Twilio credentials for download');
                    axiosConfig.auth = {
                        username: accountSid,
                        password: authToken
                    };
                } else {
                    console.warn('[WhatsApp Service] Twilio URL detected but credentials missing!');
                }
            }

            const response = await axios.get(mediaUrl, axiosConfig);
            console.log('[WhatsApp Service] Download successful, size:', response.data.length);
            console.log('[WhatsApp Service] Headers:', JSON.stringify(response.headers));

            const contentType = response.headers['content-type'] || 'image/jpeg';
            const extension = contentType.split('/')[1]?.split(';')[0] || 'jpg';
            const fileName = `whatsapp_media/${Date.now()}_${payload.SmsMessageSid || Math.random().toString(36).substring(7)}.${extension}`;
            
            console.log('[WhatsApp Service] Uploading to Firebase Storage:', fileName);
            const storageRef = ref(storage, fileName);
            
            // Em ambiente Node.js, Uint8Array é mais compatível com o Firebase JS SDK (uploadBytes)
            const uint8Array = new Uint8Array(response.data);
            
            await uploadBytes(storageRef, uint8Array, {
                contentType: contentType,
                customMetadata: {
                    'whatsapp_sender': phone,
                    'original_url': mediaUrl
                }
            });

            const downloadUrl = await getDownloadURL(storageRef);
            mediaUrl = downloadUrl;
            console.log('[WhatsApp Service] Media re-uploaded successfully. New URL:', mediaUrl);
            
            if (contentType.includes('audio')) mediaType = 'audio';
            else if (contentType.includes('video')) mediaType = 'video';
            else mediaType = 'image';
        } catch (mediaErr: any) {
            console.error("[WhatsApp Service] Erro ao processar mídia externa:", mediaErr);
            // Log do erro para diagnóstico no Firestore
            try {
                await addDoc(collection(db, 'whatsapp_logs'), {
                    phone,
                    error: `Erro mídia: ${mediaErr.message || String(mediaErr)}`,
                    mediaUrl: mediaUrl || 'N/A',
                    receivedAt: new Date().toISOString(),
                    stack: mediaErr.stack || 'N/A'
                });
            } catch (logErr) {
                console.error("Erro ao salvar log de erro:", logErr);
            }
            // Mantemos a URL original se falhar, mas avisamos no log
        }
    }

    const senderName = payload.senderName || payload.ProfileName || payload.PushName || 'Desconhecido';
    let replyText: string | undefined = undefined;

    // Processar mensagem com agrupamento manual (FINALIZAR)
    const batchRef = doc(db, 'whatsapp_batches', phone);
    const isFinalizar = messageText.trim().toUpperCase() === 'FINALIZAR' || messageText.trim().toUpperCase() === 'CONCLUIR';
    const isAjuda = messageText.trim().toUpperCase() === 'AJUDA' || messageText.trim().toUpperCase() === 'HELP';

    if (isAjuda) {
        replyText = "🤖 *Assistente CRM Zorion* \n\n" +
                   "Como enviar arquivos em lote: \n" +
                   "1️⃣ Envie a primeira foto, vídeo ou documento. \n" +
                   "2️⃣ Continue enviando os outros arquivos normalmente. \n" +
                   "3️⃣ Quando terminar, digite *FINALIZAR*. \n\n" +
                   "O sistema agrupará tudo em uma única mensagem no seu Inbox do CRM!";
        return { success: true, replyText };
    }

    if (isFinalizar) {
        const batchDoc = await getDoc(batchRef);
        if (batchDoc.exists()) {
            const data = batchDoc.data();
            data.status = 'pending';
            data.updatedAt = new Date().toISOString();
            await addDoc(collection(db, COLLECTIONS.WHATSAPP_MESSAGES), data);
            await deleteDoc(batchRef);
            replyText = "✅ *Processo concluído!* Todos os seus arquivos foram agrupados e enviados para o Inbox do CRM.";
        } else {
            replyText = "⚠️ *Ops!* Não encontrei nenhum agrupamento pendente para o seu número. Envie uma imagem, documento ou texto primeiro.";
        }
        return { success: true, replyText };
    }

    let isNewBatch = false;
    const mediaItem = mediaUrl ? { url: mediaUrl, type: mediaType } : null;

    await runTransaction(db, async (transaction) => {
        const batchDoc = await transaction.get(batchRef);
        if (!batchDoc.exists()) {
            isNewBatch = true;
            const newBatchData: any = {
                phone,
                receiverPhone,
                text: messageText || (mediaItem ? '[Mídia Agrupada]' : ''),
                status: 'pending_batch',
                receivedAt: new Date().toISOString(),
                senderName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            if (mediaItem) newBatchData.mediaUrls = [mediaItem];
            transaction.set(batchRef, newBatchData);
        } else {
            const data = batchDoc.data();
            const mediaUrls = data.mediaUrls || [];
            if (data.mediaUrl && mediaUrls.length === 0) {
                mediaUrls.push({ url: data.mediaUrl, type: data.mediaType || 'image' });
            }
            if (mediaItem) mediaUrls.push(mediaItem);

            let newText = data.text || '';
            if (messageText && messageText !== '[Mídia Agrupada]') {
                newText = newText === '[Mídia Agrupada]' || !newText ? messageText : `${newText}\n${messageText}`;
            }

            transaction.update(batchRef, {
                mediaUrls,
                mediaUrl: null,
                mediaType: null,
                text: newText || '[Mídia Agrupada]',
                updatedAt: new Date().toISOString()
            });
        }
    });

    if (isNewBatch) {
        replyText = "📎 *Iniciando novo envio para o CRM!*\n\nRecebemos seu primeiro arquivo/mensagem.\n\n⚠️ *IMPORTANTE:* Você pode continuar enviando mais fotos, áudios ou textos agora.\n\n🛑 *Quando terminar TUDO, você OBRIGATORIAMENTE precisa digitar a palavra FINALIZAR* para que as informações sejam salvas no sistema.";
    } else {
        replyText = "➕ *Item adicionado ao lote!*\n\n(Continue enviando ou digite *FINALIZAR* para encerrar e salvar no CRM).";
    }

    // Log para diagnóstico
    await addDoc(collection(db, 'whatsapp_logs'), {
        phone,
        text: messageText,
        mediaUrl,
        mediaType,
        receivedAt: new Date().toISOString(),
        payload: JSON.stringify(payload).substring(0, 1000), // Limitar tamanho
        status: mediaUrl?.includes('firebasestorage') ? 'media_reuploaded' : 'media_original',
        message: 'Mensagem processada (agrupamento manual)'
    });

    console.log(`[WhatsApp] Mensagem processada: ${phone}`);
    return { success: true, replyText };

  } catch (error) {
    console.error('[WhatsApp Service Error]', error);
    return { success: false };
  }
}
