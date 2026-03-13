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
  connectedPhone?: string; // Z-API (receiver)
  
  // Compatibilidade com outros (Twilio/Waha)
  Body?: string;
  From?: string;
  To?: string; // Twilio (receiver)
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

    // Extrair dados básicos (Normalizar telefone e conteúdo)
    const rawPhone = payload.phone || payload.From || '';
    const rawReceiverPhone = payload.connectedPhone || payload.To || '';
    
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

    const phone = rawPhone.replace(/\D/g, ''); 
    const receiverPhone = rawReceiverPhone.replace(/\D/g, '');

    // Salvar a mensagem na nova coleção para processamento manual
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

    await addDoc(collection(db, COLLECTIONS.WHATSAPP_MESSAGES), newMessage);
    console.log(`[WhatsApp] Mensagem salva na caixa de entrada: ${phone}`);

  } catch (error) {
    console.error('[WhatsApp Service Error]', error);
  }
}
