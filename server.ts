import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/analyze-document", async (req, res) => {
    try {
      const { text, context } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the following legal document text for risks based on the context: ${context}. 
        Text: ${text}
        Return a JSON array of risks with fields: title, description, severity (low, medium, high, critical), probability (0-100), impact (0-100), recommendation.`,
      });

      const response = await model;
      const result = response.text;
      
      // Basic extraction if model returns markdown
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      const risks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

      res.json({ risks });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze document" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
