import { GoogleGenAI, Type } from "@google/genai";
import { Risk } from "../types";

export async function analyzeDocument(file: File): Promise<{ clauses: string[], risk: Partial<Risk> }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || "application/pdf";

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType,
          },
        },
        {
          text: `Проанализируй этот юридический документ. 
        1. Извлеки 4-5 ключевых пунктов (клаузул), которые могут содержать юридические риски (например, сроки оплаты, ответственность, подсудность, реквизиты).
        2. Сформулируй один основной риск, который ты видишь в этом документе, основываясь на его содержании.
        
        Верни ответ в формате JSON:
        {
          "clauses": ["пункт 1", "пункт 2", ...],
          "risk": {
            "title": "Заголовок риска",
            "description": "Подробное описание риска на основе документа",
            "severity": "Критично" | "Высокий" | "Средний" | "Низкий",
            "recommendation": "Что нужно сделать, чтобы исправить",
            "actionPlan": ["шаг 1", "шаг 2", ...]
          }
        }`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          clauses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          risk: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["Критично", "Высокий", "Средний", "Низкий"] },
              recommendation: { type: Type.STRING },
              actionPlan: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ["title", "description", "severity", "recommendation", "actionPlan"],
          },
        },
        required: ["clauses", "risk"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Empty response from AI");
  }

  try {
    const result = JSON.parse(text);
    return result;
  } catch (e) {
    console.error("Failed to parse AI response", e, text);
    throw new Error("Не удалось проанализировать документ");
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}
