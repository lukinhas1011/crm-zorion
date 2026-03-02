
import { GoogleGenAI, Type } from "@google/genai";
import { Ingredient, DietRequirement, DietRecommendation } from '../types';

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

export const generateNutritionPlan = async (
  requirements: DietRequirement,
  availableIngredients: Ingredient[]
): Promise<DietRecommendation> => {
  const ai = getAiClient();
  const model = "gemini-3-pro-preview";
  const prompt = `Atue como um nutricionista especialista em bovinos de corte. Formule uma dieta diária de custo mínimo. 
    Dados: Peso ${requirements.animalWeight}kg, Ganho Alvo ${requirements.targetGain}kg, Raça ${requirements.breed}. 
    Ingredientes: ${availableIngredients.map(i => `${i.name} (P:${i.protein}%, E:${i.energy})`).join(', ')}`;

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amountKg: { type: Type.NUMBER },
                  cost: { type: Type.NUMBER }
                }
              }
            },
            totalCost: { type: Type.NUMBER },
            nutritionalAnalysis: {
              type: Type.OBJECT,
              properties: {
                protein: { type: Type.STRING },
                energy: { type: Type.STRING },
                fiber: { type: Type.STRING }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || '{}') as DietRecommendation;
  } catch (error) {
    console.error("Erro Nutrição:", error);
    throw new Error("Erro ao gerar dieta técnica.");
  }
};

export const summarizeVisitAudio = async (transcript: string, lot?: string, product?: string): Promise<string> => {
  const ai = getAiClient();
  const model = "gemini-3-flash-preview";
  
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
    const response = await ai.models.generateContent({ model: model, contents: prompt });
    return response.text?.trim() || "Resumo não disponível.";
  } catch (error) {
    console.error("Erro Gemini Summarize:", error);
    return "• Erro ao processar resumo técnico via IA.";
  }
};
