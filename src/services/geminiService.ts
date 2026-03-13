import { GoogleGenAI } from "@google/genai";

// Initialize the Gemini API
// Note: The API key is handled by the platform via process.env.GEMINI_API_KEY
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/**
 * Service to interact with Gemini AI.
 * Optimized to prevent excessive API key consumption.
 */
export const geminiService = {
  /**
   * Generates a response from Gemini.
   * @param prompt The prompt to send to the model.
   * @param systemInstruction Optional system instruction.
   * @returns The generated text.
   */
  async generateResponse(prompt: string, systemInstruction?: string) {
    try {
      // Use gemini-3-flash-preview for better performance/cost balance
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || "Você é um assistente especializado em pecuária de corte e nutrição animal.",
          temperature: 0.7,
        },
      });

      return response.text || "Não foi possível gerar uma resposta.";
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      throw error;
    }
  },

  /**
   * Analyzes cattle data and provides nutritional recommendations.
   * This is a specific use case for the app.
   */
  async analyzeNutrition(data: any) {
    const prompt = `Analise os seguintes dados nutricionais de um lote de bovinos e forneça recomendações: ${JSON.stringify(data)}`;
    return this.generateResponse(prompt);
  }
};
