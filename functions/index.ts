import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// --- WEBHOOK WHATSAPP ---
// Apenas recebe e salva a mensagem na caixa de entrada para visualização no app
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
        const payload = req.body;
        
        // Extrair dados básicos
        const rawPhone = payload.phone || payload.From || '';
        const rawReceiverPhone = payload.connectedPhone || payload.To || '';
        
        let messageText = '';
        if (payload.text?.message) messageText = payload.text.message;
        else if (payload.image?.caption) messageText = payload.image.caption;
        else if (payload.video?.caption) messageText = payload.video.caption;
        else messageText = payload.Body || '';

        let mediaUrl = payload.image?.imageUrl || payload.audio?.audioUrl || payload.video?.videoUrl || payload.MediaUrl0 || null;
        let mediaType = payload.audio?.audioUrl ? 'audio' : (payload.video?.videoUrl ? 'video' : 'image');

        if (rawPhone) {
            const phone = rawPhone.replace(/\D/g, '');
            const receiverPhone = rawReceiverPhone.replace(/\D/g, '');

            const newMessage = {
                phone,
                receiverPhone,
                text: messageText,
                mediaUrl,
                mediaType,
                status: 'pending',
                receivedAt: new Date().toISOString(),
                senderName: payload.senderName || payload.ProfileName || 'Desconhecido',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await db.collection('whatsapp_messages').add(newMessage);
            
            // Log para diagnóstico
            await db.collection('whatsapp_logs').add({
                payload,
                receivedAt: admin.firestore.Timestamp.now(),
                status: 'success',
                message: 'Mensagem salva na caixa de entrada'
            });
        }
        
        // Responde para o provedor (Twilio/Z-API)
        res.status(200).send('OK');
    } catch (err) {
        console.error("Erro no webhook:", err);
        res.status(500).send('Internal Server Error');
    }
    return;
  }

  res.status(200).send('Webhook Ativo (GET)');
});

// --- API DE LOGS (PARA O FRONTEND) ---
export const whatsappLogs = functions.https.onRequest(async (req, res) => {
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
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

