import { GoogleGenAI } from "@google/genai";

export async function askLexi(riskTitle: string, riskDescription: string, userMessage: string) {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: userMessage,
      config: {
        systemInstruction: `Ты - экспертный ИИ-ассистент Лекси по риск-менеджменту в сфере B2B. 
        Твоя специализация: HR-комплаенс, информационная безопасность (ПДн и КТ), судебные и налоговые риски.
        
        Контекст текущего риска:
        Название: ${riskTitle}
        Описание: ${riskDescription}
        
        Твои задачи:
        1. Объяснять сложные юридические последствия простым языком.
        2. Давать конкретные пошаговые инструкции по исправлению ситуации (Action Plan).
        3. Оценивать критичность ситуации.
        4. Отвечать строго на русском языке, профессионально, но доступно.
        
        Если пользователь спрашивает не по теме риска, вежливо верни его к обсуждению правовой безопасности бизнеса.`,
      },
    });
    return response.text || "Извините, я не получил ответа от системы.";
  } catch (error) {
    console.error("Lexi error:", error);
    return "Извините, я временно не могу ответить. Попробуйте позже.";
  }
}
