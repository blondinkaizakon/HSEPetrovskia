import { GoogleGenAI, Type } from "@google/genai";
import { Risk } from "../types";

export async function analyzeDocument(
  file: File, 
  categoryId?: string, 
  isRag?: boolean, 
  existingDocs?: { title: string, content: string }[]
): Promise<{ clauses: string[], risk: Partial<Risk>, summary?: string, conflicts?: string[] }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const base64Data = await fileToBase64(file);
  const mimeType = file.type || "application/pdf";

  let promptPrefix = "Проанализируй этот юридический документ.";
  
  if (categoryId === 'tax') {
    promptPrefix = "Проанализируй этот документ на соответствие налоговому законодательству РФ. Ищи риски дробления, необоснованной выгоды и ошибок в расчетах.";
  } else if (categoryId === 'advertising') {
    promptPrefix = "Проанализируй этот документ на соответствие ФЗ 'О рекламе'. Ищи риски отсутствия маркировки, недостоверности и некорректных сравнений.";
  } else if (categoryId === 'infosec') {
    promptPrefix = "Проанализируй этот документ на соответствие ФЗ-152 'О персональных данных' и стандартам ИБ. Ищи риски отсутствия согласий, некорректных целей обработки и передачи третьим лицам.";
  } else if (categoryId === 'court') {
    promptPrefix = "Проанализируй этот документ на соответствие судебной практике и договорным рискам. Ищи риски проигрыша в суде, некорректной подсудности и отсутствия доказательной базы.";
  } else if (categoryId === 'lna_sync') {
    promptPrefix = "Проанализируй этот договор на соответствие локальным нормативным актам (ЛНА) компании. Ищи противоречия в сроках, суммах полномочиях и процедурах.";
  }

  if (isRag) {
    promptPrefix = "Проанализируй этот чек-лист. Используй его как базу знаний для последующих проверок документов. Выдели ключевые критерии проверки.";
  }

  const existingDocsContext = existingDocs && existingDocs.length > 0 
    ? `\n\nЭТАЛОННЫЕ ДОКУМЕНТЫ ДЛЯ ПРОВЕРКИ (ЛНА И ЧЕК-ЛИСТЫ):\n${existingDocs.map(d => `ДОКУМЕНТ [${d.title}]:\n${d.content.substring(0, 1500)}`).join('\n---\n')}\n`
    : "";

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
          text: `${promptPrefix} ${existingDocsContext}
        Твои задачи:
        1. Извлеки 4-5 ключевых пунктов (клаузул), которые могут содержать юридические риски. 
        ОБЯЗАТЕЛЬНО проверь пункт о подсудности (jurisdiction).
        2. Сформулируй один основной риск документа.
        3. ${existingDocsContext ? 'КРИТИЧЕСКАЯ ЗАДАЧА: СРАВНИ этот файл с ЭТАЛОННЫМИ ДОКУМЕНТАМИ (ЛНА и ЧЕК-ЛИСТЫ). Найди ВСЕ противоречия. Если в эталоне (ЛНА) указано условие X, а в этом файле Y — это КРИТИЧЕСКОЕ НЕСООТВЕТСТВИЕ.' : 'Документов для сравнения не предоставлено. Проанализируй только текущий файл.'}
        4. Составь экспертное заключение (summary). ${existingDocsContext ? 'В САМОМ НАЧАЛЕ summary четко укажи: соответствует ли документ ЛНА/чек-листам. Если найдены противоречия, напиши: "ВНИМАНИЕ! ОБНАРУЖЕНО НЕСООТВЕТСТВИЕ ЛНА: ..." и перечисли их.' : ''}
        
        Формат ответа JSON:
        {
          "clauses": ["пункт 1", ...],
          "risk": {
            "title": "...",
            "description": "...",
            "severity": "Критично" | "Высокий" | "Средний" | "Низкий",
            "recommendation": "...",
            "actionPlan": ["...", "..."]
          },
          "conflicts": ["описание противоречия 1", ...],
          "summary": "..."
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
          conflicts: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          summary: { type: Type.STRING }
        },
        required: ["clauses", "risk", "summary"],
      },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("AI response was empty");
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Parse error:", text);
    throw new Error("Не удалось разобрать ответ ИИ");
  }
}

export async function compareTwoDocuments(
  docA: { title: string, content: string },
  docB: { title: string, content: string }
): Promise<{ conflicts: string[], summary: string, risk: Partial<Risk> }> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      role: "user",
      parts: [{
        text: `ПЕРЕКРЕСТНЫЙ АНАЛИЗ ДОКУМЕНТОВ:
        
        ДОКУМЕНТ А (Договор): 
        Название: ${docA.title}
        Содержание: ${docA.content.substring(0, 4000)}
        
        ДОКУМЕНТ Б (Эталонный ЛНА/Политика):
        Название: ${docB.title}
        Содержание: ${docB.content.substring(0, 4000)}
        
        ЗАДАЧА:
        1. Найди противоречия между Договором (А) и Политикой (Б). 
           - Проверь сроки оплаты, лимиты ответственности, условия расторжения, подсудность.
           - Если в Политике указаны жесткие рамки, а в Договоре они нарушены — это коллизия.
        2. Оцени критичность противоречий.
        3. Сформулируй краткое заключение.
        
        Формат ответа JSON:
        {
          "conflicts": ["описание противоречия 1", "описание противоречия 2", ...],
          "summary": "Краткое экспертное заключение по итогам сравнения",
          "risk": {
            "title": "Главный риск несоответствия ЛНА",
            "description": "...",
            "severity": "Критично" | "Высокий" | "Средний" | "Низкий",
            "recommendation": "Как привести договор в соответствие с ЛНА",
            "actionPlan": ["...", "..."]
          }
        }`
      }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          conflicts: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          risk: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["Критично", "Высокий", "Средний", "Низкий"] },
              recommendation: { type: Type.STRING },
              actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["title", "description", "severity", "recommendation", "actionPlan"]
          }
        },
        required: ["conflicts", "summary", "risk"]
      }
    }
  });

  const text = response.text;
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Ошибка парсинга ответа сравнения");
  }
}

export async function compareAllDocuments(
  documents: { title: string, content: string }[]
): Promise<{ summary: string, conflicts: string[], healthScore: number }> {
  if (documents.length < 2) {
    return {
      summary: "Недостаточно документов для сравнения. Загрузите как минимум два документа.",
      conflicts: [],
      healthScore: 100
    };
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const docsContext = documents.map((d, i) => `ДОКУМЕНТ №${i + 1} [${d.title}]:\n${d.content.substring(0, 2000)}`).join('\n\n---\n\n');

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
      parts: [
        {
          text: `Проведи глубокий перекрестный анализ следующего набора документов на предмет ПРЯМЫХ ПРОТИВОРЕЧИЙ и КОЛЛИЗИЙ.
          
          ${docsContext}
          
          Твои задачи:
          1. Сравни каждый документ с каждым.
          2. Найди противоречия в сроках (например, в одном 30 дней, в другом 45), суммах, штрафах, подсудности, полномочиях.
          3. Оцени общую согласованность базы документов (healthScore от 0 до 100).
          4. Составь подробное резюме выявленных проблем.
          
          Формат ответа JSON:
          {
            "summary": "Общее резюме ситуации...",
            "conflicts": ["Конфликт 1: ...", "Конфликт 2: ..."],
            "healthScore": 85
          }
          `
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  try {
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error("Error parsing AI response:", e);
    return {
      summary: "Ошибка при анализе коллизий.",
      conflicts: ["Не удалось распарсить ответ ИИ"],
      healthScore: 50
    };
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
