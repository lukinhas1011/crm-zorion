
import { GoogleGenAI, Type } from "@google/genai";
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';

// Inicialização segura usando a chave de ambiente
const getAiClient = () => {
  let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  
  // Clean the key: remove whitespace and surrounding quotes
  apiKey = apiKey.trim().replace(/^["']|["']$/g, '');

  if (!apiKey) {
    throw new Error("Neither GEMINI_API_KEY nor API_KEY is set in environment variables.");
  }
  return new GoogleGenAI({ apiKey });
};

async function logGeminiUsage(
  model: string,
  functionality: string,
  usage: any
) {
  try {
    await addDoc(collection(db, 'gemini_usage_logs'), {
      model,
      functionality,
      promptTokens: usage?.promptTokenCount || 0,
      completionTokens: usage?.candidatesTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.warn("Usage log error:", e);
  }
}

// Helper for persistent caching
async function getCache(collection: string, key: string) {
  try {
    const docRef = doc(db, 'ai_cache', `${collection}_${key.substring(0, 100)}`);
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data().result : null;
  } catch (e) {
    console.warn("Cache read error:", e);
    return null;
  }
}

async function setCache(collection: string, key: string, result: any) {
  try {
    const docRef = doc(db, 'ai_cache', `${collection}_${key.substring(0, 100)}`);
    await setDoc(docRef, {
      result,
      createdAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn("Cache write error:", e);
  }
}


export const summarizeVisitAudio = async (transcript: string, lot?: string, product?: string): Promise<string> => {
  if (!transcript || transcript.length < 10) return "Transcrição muito curta para resumir.";

  const cacheKey = JSON.stringify({ transcript, lot, product });
  const cached = await getCache('summary', cacheKey);
  if (cached) {
    console.log("Using persistent cache for summary.");
    return cached;
  }

  const ai = getAiClient();
  const model = "gemini-3.1-flash-lite-preview";
  
  const prompt = `
    Resuma a transcrição técnica abaixo em tópicos curtíssimos (bullet points).
    Foque apenas em Ações, Observações e Recomendações.
    
    REGRAS RÍGIDAS:
    - Máximo 5 tópicos.
    - Máximo 10 palavras por tópico.
    - Use "•" para os tópicos.
    - Ignore saudações ou textos irrelevantes.
    - NÃO repita o texto original, apenas extraia os pontos chave.
    
    CONTEXTO: Lote ${lot || 'N/A'}, Produto ${product || 'N/A'}.
    TEXTO: "${transcript}"
  `;

  try {
    const response = await ai.models.generateContent({ 
      model: model, 
      contents: prompt,
      config: { temperature: 0 }
    });

    // @ts-ignore
    await logGeminiUsage(model, 'visit_summary', response.usageMetadata);

    const result = response.text?.trim() || "Resumo não disponível.";
    await setCache('summary', cacheKey, result);
    return result;
  } catch (error) {
    console.error("Erro Gemini Summarize:", error);
    return "• Erro ao processar resumo técnico via IA.";
  }
};

