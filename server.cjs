var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_genai = require("@google/genai");
var import_vite = require("vite");
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
function cleanHtml(html) {
  return html.replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "").replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 8e3);
}
var aiClient = null;
function getGemini() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it to your Secrets in AI Studio.");
    }
    aiClient = new import_genai.GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}
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
        const response2 = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          signal: AbortSignal.timeout(6e3)
          // 6 second timeout
        });
        if (response2.ok) {
          const html = await response2.text();
          scrapedContent = cleanHtml(html);
        } else {
          console.warn(`URL fetch returned status ${response2.status}`);
        }
      } catch (err) {
        console.error("Error fetching URL:", err.message);
      }
    }
    const ai = getGemini();
    let contextPrompt = "Here is the input information provided by the user:\n";
    if (topic) contextPrompt += `- Topic: ${topic}
`;
    if (url) contextPrompt += `- URL: ${url} (If it's a YouTube URL, use google search to get context about the video if necessary)
`;
    if (scrapedContent) contextPrompt += `- Extracted Web Content context: ${scrapedContent}
`;
    if (transcript) contextPrompt += `- Transcript: ${transcript}
`;
    if (notes) contextPrompt += `- Notes: ${notes}
`;
    if (tone) contextPrompt += `- Specific Tone Guideline: ${tone}
`;
    if (targetAudience) contextPrompt += `- Target Audience: ${targetAudience}
`;
    if (platform) contextPrompt += `- Target Platform: ${platform}
`;
    const instructions = `You are a world-class viral content strategist. Your task is to generate ONLY high-attention content assets designed to maximize clicks, curiosity, retention, and engagement. 
Focus on short-form content platforms. EXCEL in copywriting, use dark psychology, pattern interrupts, and human curiosity to drive metrics. Focus on delivering extreme value or controversial insights.

Strictly adhere to these formatting rules inside the keys:
1. "video_hooks": Generate exactly 5 viral video hooks.
   - Maximum 12 words per hook.
   - Strong curiosity gap, fast attention capture. Start with controversy, secrets, or counter-narrative.
   - Distinctive, sleek, and high-impact. Do NOT use generic clich\xE9 phrases. Play on human psychology.
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
    const requestParts = [
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
          type: import_genai.Type.OBJECT,
          properties: {
            video_hooks: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 high-attention viral hooks, max 12 words each."
            },
            video_titles: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 viral video titles, max 60 characters each."
            },
            captions: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 highly engaging single-sentence captions."
            },
            scripts: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 short content scripts or outlines."
            },
            hashtags: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 trending and relevant hashtags with '#' prefix."
            },
            retention_hooks: {
              type: import_genai.Type.ARRAY,
              items: { type: import_genai.Type.STRING },
              description: "Array of exactly 5 retention hooks for the first 3 seconds."
            }
          },
          required: ["video_hooks", "video_titles", "captions", "scripts", "hashtags", "retention_hooks"]
        }
      }
    });
    const jsonText = response.text?.trim() || "{}";
    const parsedData = JSON.parse(jsonText);
    res.json(parsedData);
  } catch (error) {
    console.error("Endpoint execution error:", error);
    if (error.status === 429 || error.message && error.message.includes("quota")) {
      return res.status(429).json({
        error: "API Quota Exceeded. You have hit the rate limit for the Gemini API. Please wait a moment or check your Google AI Studio plan."
      });
    }
    res.status(500).json({ error: error.message || "An error occurred while generating viral strategist assets." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
