import { VercelRequest, VercelResponse } from "@vercel/node";
import { GoogleGenAI, Type } from "@google/genai";
import Replicate from "replicate";

// Helper to sanitize HTML tags
function cleanHtml(html: string): string {
  return html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 8000);
}

// Lazy load Gemini AI
let aiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please add it to your Vercel environment variables.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "vercel-deployment",
        },
      },
    });
  }
  return aiClient;
}

// Lazy load Replicate
let replicateClient: Replicate | null = null;
function getReplicate(): Replicate {
  if (!replicateClient) {
    const apiKey = process.env.REPLICATE_API_TOKEN;
    if (!apiKey) {
      throw new Error("REPLICATE_API_TOKEN is not defined.");
    }
    replicateClient = new Replicate({ auth: apiKey });
  }
  return replicateClient;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const html = await response.text();
          scrapedContent = cleanHtml(html);
        }
      } catch (err: any) {
        console.error("Error fetching URL:", err.message);
      }
    }

    // Construct prompt
    let contextPrompt = "Here is the input information provided by the user:\n";
    if (topic) contextPrompt += `- Topic: ${topic}\n`;
    if (url) contextPrompt += `- URL: ${url}\n`;
    if (scrapedContent) contextPrompt += `- Extracted Web Content context: ${scrapedContent}\n`;
    if (transcript) contextPrompt += `- Transcript: ${transcript}\n`;
    if (notes) contextPrompt += `- Notes: ${notes}\n`;
    if (tone) contextPrompt += `- Specific Tone Guideline: ${tone}\n`;
    if (targetAudience) contextPrompt += `- Target Audience: ${targetAudience}\n`;
    if (platform) contextPrompt += `- Target Platform: ${platform}\n`;

    const instructions = `You are a world-class viral content strategist. Your task is to generate ONLY high-attention content assets designed to maximize clicks, curiosity, retention, and engagement. 
Focus on short-form content platforms. EXCEL in copywriting, use dark psychology, pattern interrupts, and human curiosity to drive metrics.

Strictly adhere to these formatting rules:
1. "video_hooks": Generate exactly 5 viral video hooks, max 12 words each.
2. "video_titles": Generate exactly 5 video titles, max 60 characters each.
3. "captions": Generate exactly 5 captions, max 1 sentence each.
4. "scripts": Generate exactly 5 scripts, 3-5 sentences each.
5. "hashtags": Generate exactly 5 hashtags with '#' prefix.
6. "retention_hooks": Generate exactly 5 retention hooks for first 3 seconds.

IMPORTANT: Return ONLY valid JSON with no additional text.`;

    // Try Gemini first
    let parsedData = null;
    try {
      const ai = getGemini();
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
                description: "Array of exactly 5 viral hooks."
              },
              video_titles: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 5 video titles."
              },
              captions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 5 captions."
              },
              scripts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 5 scripts."
              },
              hashtags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 5 hashtags."
              },
              retention_hooks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 5 retention hooks."
              }
            },
            required: ["video_hooks", "video_titles", "captions", "scripts", "hashtags", "retention_hooks"],
          },
        },
      });

      const jsonText = response.text?.trim() || "{}";
      parsedData = JSON.parse(jsonText);
      console.log("✅ Generated with Gemini");
    } catch (geminiError: any) {
      console.warn("⚠️ Gemini failed, attempting Replicate fallback:", geminiError.message);

      try {
        const replicate = getReplicate();
        const fullPrompt = `${instructions}\n\n${contextPrompt}\n\nRespond with ONLY valid JSON, no extra text.`;

        const output = await replicate.run(
          "meta/llama-2-70b-chat:02e509cc789964a986fb50860c8e887d28375db3526150c66b79e4604eb3ff3f",
          {
            input: {
              prompt: fullPrompt,
              max_tokens: 2000,
              temperature: 0.7,
            }
          }
        );

        const jsonText = Array.isArray(output) ? output.join("") : String(output);
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Could not extract JSON from response");
        }
        parsedData = JSON.parse(jsonMatch[0]);
        console.log("✅ Generated with Replicate Llama 2");
      } catch (replicateError: any) {
        console.error("❌ Both APIs failed:", replicateError.message);
        throw replicateError;
      }
    }

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error("Endpoint error:", error);
    
    if (error.status === 429 || error.message?.includes("quota")) {
      return res.status(429).json({ 
        error: "API quota exceeded. Please wait and try again later." 
      });
    }

    return res.status(500).json({ 
      error: error.message || "An error occurred while generating content." 
    });
  }
}
