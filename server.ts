import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Helper to sanitize HTML tags
function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 8000); // Limit context size
}

// Lazy load Gemini AI to prevent server crash on startup if API key is missing
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it to your Secrets in AI Studio.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 1. Core Generation Endpoint
app.post("/api/generate", async (req, res) => {
  try {
    const { topic, url, transcript, notes, tone, targetAudience, platform } = req.body;

    if (!topic && !url && !transcript && !notes) {
      return res.status(400).json({ error: "Please provide a topic, URL, transcript, or notes to get started." });
    }

    let scrapedContent = "";
    if (url && !url.includes("youtube.com") && !url.includes("youtu.be")) {
      try {
        console.log(`Attempting to fetch content from URL: ${url}`);
        const response = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          signal: AbortSignal.timeout(6000), // 6 second timeout
        });
        if (response.ok) {
          const html = await response.text();
          scrapedContent = cleanHtml(html);
        } else {
          console.warn(`URL fetch returned status ${response.status}`);
        }
      } catch (err: any) {
        console.error("Error fetching URL:", err.message);
        // We proceed even if URL fetch fails, making Gemini rely on its offline knowledge of the URL or the text provided in prompt
      }
    }

    const ai = getGemini();

    // Construct prompt
    let contextPrompt = "Here is the input information provided by the user:\n";
    if (topic) contextPrompt += `- Topic: ${topic}\n`;
    if (url) contextPrompt += `- URL: ${url} (If it's a YouTube URL, use google search to get context about the video if necessary)\n`;
    if (scrapedContent) contextPrompt += `- Extracted Web Content context: ${scrapedContent}\n`;
    if (transcript) contextPrompt += `- Transcript: ${transcript}\n`;
    if (notes) contextPrompt += `- Notes: ${notes}\n`;
    if (tone) contextPrompt += `- Specific Tone Guideline: ${tone}\n`;
    if (targetAudience) contextPrompt += `- Target Audience: ${targetAudience}\n`;
    if (platform) contextPrompt += `- Target Platform: ${platform}\n`;

    const instructions = `You are a world-class viral content strategist. Your task is to generate ONLY high-attention content assets designed to maximize clicks, curiosity, retention, and engagement. 
Focus on short-form content platforms. EXCEL in copywriting, use dark psychology, pattern interrupts, and human curiosity to drive metrics. Focus on delivering extreme value or controversial insights.

Strictly adhere to these formatting rules inside the keys:
1. "video_hooks": Generate exactly 5 viral video hooks.
   - Maximum 12 words per hook.
   - Strong curiosity gap, fast attention capture. Start with controversy, secrets, or counter-narrative.
   - Distinctive, sleek, and high-impact. Do NOT use generic cliché phrases. Play on human psychology.
2. "video_titles": Generate exactly 5 short form video titles.
   - Maximum 60 characters each.
   - Designed for high click-through rate. Use emotion, curiosity, surprise, or subtle controversy.
3. "captions": Generate exactly 5 caption ideas.
   - Maximum 1 sentence each.
   - Encourage immediate engagement (e.g., share a polarizing opinion and ask for theirs, or create a debate).
4. "scripts": Generate exactly 5 short content scripts/outlines.
   - 3-5 sentences each.
   - Provide a brief, punchy flow of how the short content should unfold to maintain extreme high retention (Hook -> Re-hook -> Body -> Call to Action/Twist).
5. "hashtags": Generate exactly 5 highly relevant hashtags, complete with '#' prefix. Use a mix of broad and niche tags.
6. "retention_hooks": Generate exactly 5 "retention hooks" or audience triggers for the first 3 seconds of the video to maximize watch time. (e.g. "Do not skip if you...").`;

    const requestParts: any[] = [
      { text: instructions },
      { text: contextPrompt }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: requestParts,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            video_hooks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 high-attention viral hooks, max 12 words each."
            },
            video_titles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 viral video titles, max 60 characters each."
            },
            captions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 highly engaging single-sentence captions."
            },
            scripts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 short content scripts or outlines."
            },
            hashtags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 trending and relevant hashtags with '#' prefix."
            },
            retention_hooks: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of exactly 5 retention hooks for the first 3 seconds."
            }
          },
          required: ["video_hooks", "video_titles", "captions", "scripts", "hashtags", "retention_hooks"],
        },
      },
    });

    const jsonText = response.text?.trim() || "{}";
    const parsedData = JSON.parse(jsonText);
    res.json(parsedData);
  } catch (error: any) {
    console.error("Endpoint execution error:", error);
    
    // Check if it's a quota/rate limit error from Gemini
    if (error.status === 429 || (error.message && error.message.includes("quota"))) {
      return res.status(429).json({ 
        error: "API Quota Exceeded. You have hit the rate limit for the Gemini API. Please wait a moment or check your Google AI Studio plan." 
      });
    }

    res.status(500).json({ error: error.message || "An error occurred while generating viral strategist assets." });
  }
});

// Vite middleware integration for full-stack build/dev
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

startServer();
