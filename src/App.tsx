import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Download,
  RefreshCw,
  Check,
  AlertTriangle,
  Copy,
  Trash2,
  X
} from "lucide-react";
import { GeneratedAssets, GenerationRequest } from "./types";

const GEMINI_API_KEY = "AQ.Ab8RN6Jfit30djn5-Zs14IhK9jK9EWILp7qPZ3fEyhXXOoJCMA";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const REPLICATE_API_KEY = "r8_E2oEt8kZAnsjIT5AHNX6dhVCdmzj6cV0NqilZ";
const REPLICATE_API_URL = "https://api.replicate.com/v1/predictions";

export default function App() {

  // Single inputs core state
  const [inputText, setInputText] = useState("");

  // Core assets generated state
  const [assets, setAssets] = useState<GeneratedAssets | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active copy feedback state
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [flashedItem, setFlashedItem] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTimeoutId, setToastTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const [suggestions, setSuggestions] = useState<string[]>([]);

  const shuffleSuggestions = () => {
    const defaultSuggestions = [
      "How to trick the algorithm in 2024",
      "Why your code isn't building",
      "The dopamine delay hack for deep work",
      "How I made $10k in 30 days",
      "Top 3 design tools you're missing",
      "Stop using React like it's 2019",
      "The invisible cost of multi-tasking",
      "Minimalist habits for maximum focus",
      "Why waking up at 4AM is a scam",
      "How to edit videos 10x faster"
    ];
    setSuggestions(prev => {
      let available = defaultSuggestions.filter(s => !prev.includes(s));
      if (available.length < 3) available = defaultSuggestions;
      const shuffled = [...available].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, 3);
    });
  };

  // Randomize suggestions on mount
  useEffect(() => {
    shuffleSuggestions();
  }, []);

  // Click-to-copy handler
  const handleCopy = (text: string, flashId?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      if (flashId) {
        setFlashedItem(flashId);
        setTimeout(() => setFlashedItem(null), 100);
      }
      setToastMessage("Copied to clipboard!");

      if (toastTimeoutId) clearTimeout(toastTimeoutId);

      const timeout = setTimeout(() => {
        setToastMessage(null);
        setCopiedText(null);
      }, 2000);
      setToastTimeoutId(timeout);
    }).catch(() => {
      alert("Failed to copy to clipboard.");
    });
  };

  // Parse JSON response from either API
  const parseJsonResponse = (text: string): GeneratedAssets => {
    try {
      // Try to extract JSON block from markdown code fence
      const jsonMatch = text.match(/```(?:json)?\n?([\s\S]*?)\n```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : text;
      const parsed = JSON.parse(jsonStr);

      return {
        video_hooks: Array.isArray(parsed.video_hooks) ? parsed.video_hooks : [],
        video_titles: Array.isArray(parsed.video_titles) ? parsed.video_titles : [],
        captions: Array.isArray(parsed.captions) ? parsed.captions : [],
        scripts: Array.isArray(parsed.scripts) ? parsed.scripts : [],
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
        retention_hooks: Array.isArray(parsed.retention_hooks) ? parsed.retention_hooks : [],
      };
    } catch (err) {
      console.error("Failed to parse response:", err);
      throw new Error("Failed to parse generated content. Please try again.");
    }
  };

  // Call Gemini API
  const callGeminiAPI = async (prompt: string) => {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ]
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("Gemini API Error:", errData);
      throw new Error(errData.error?.message || `Gemini error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error("Invalid response from Gemini.");
    }

    return data.candidates[0].content.parts[0].text;
  };

  // Call Replicate API (using llama-2 as fallback)
  const callReplicateAPI = async (prompt: string) => {
    // First, create prediction
    const createResponse = await fetch(REPLICATE_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Token ${REPLICATE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "13c3cdee13ee059ab779f0291d29f66ca2f0cee5b0f41053b20e5de6cdf64519", // Llama 2 70B
        input: {
          prompt: prompt,
          max_tokens: 2000,
          temperature: 0.7,
        }
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Replicate prediction creation failed: ${createResponse.status}`);
    }

    const prediction = await createResponse.json();
    const predictionId = prediction.id;

    // Poll for result
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes with 2s intervals

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`${REPLICATE_API_URL}/${predictionId}`, {
        headers: {
          "Authorization": `Token ${REPLICATE_API_KEY}`,
        },
      });

      const statusData = await statusResponse.json();

      if (statusData.status === "succeeded") {
        const output = Array.isArray(statusData.output) ? statusData.output.join("") : statusData.output;
        return output;
      } else if (statusData.status === "failed") {
        throw new Error("Replicate prediction failed");
      }

      // Wait 2 seconds before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    throw new Error("Replicate prediction timed out");
  };

  // Smart compiler parameter parsing & calling the API
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      setErrorMessage("Please input a topic, URL, or notes before generating.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    // Smart pickers to populate server request safely and extract the URL
    let detectedUrl = "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urlsFound = trimmedInput.match(urlRegex);
    if (urlsFound && urlsFound.length > 0) {
      detectedUrl = urlsFound[0];
    }

    // Capture the first line as tentative topic, remainder as notes
    const lines = trimmedInput.split("\n").map(l => l.trim()).filter(Boolean);
    const parsedTopic = lines[0] ? lines[0].substring(0, 100) : "Viral Strategy Batch";

    try {
      const prompt = `You are a viral content strategist. Generate short-form viral content assets based on this input:

Topic: ${parsedTopic}
${detectedUrl ? `URL: ${detectedUrl}` : ""}
Additional Notes: ${trimmedInput}
Tone: Controversial yet Educational
Platform: Short Form Content (TikTok, Instagram Reels, YouTube Shorts)

Generate exactly 5 items for each category and respond ONLY with valid JSON (no markdown, no extra text):
{
  "video_hooks": ["hook1", "hook2", "hook3", "hook4", "hook5"],
  "video_titles": ["title1", "title2", "title3", "title4", "title5"],
  "captions": ["caption1", "caption2", "caption3", "caption4", "caption5"],
  "scripts": ["script1", "script2", "script3", "script4", "script5"],
  "retention_hooks": ["trigger1", "trigger2", "trigger3", "trigger4", "trigger5"],
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"]
}`;

      let responseText = "";
      let usedAPI = "Gemini";

      // Try Gemini first
      try {
        console.log("Attempting Gemini API...");
        responseText = await callGeminiAPI(prompt);
        console.log("✅ Gemini API succeeded");
      } catch (geminiErr: any) {
        console.warn("⚠️ Gemini failed, trying Replicate fallback:", geminiErr.message);
        usedAPI = "Replicate";
        try {
          responseText = await callReplicateAPI(prompt);
          console.log("✅ Replicate API succeeded");
        } catch (replicateErr: any) {
          console.error("❌ Both APIs failed");
          throw new Error(`Both APIs failed. Gemini: ${geminiErr.message}. Replicate: ${replicateErr.message}`);
        }
      }

      const cleanData = parseJsonResponse(responseText);

      if (
        cleanData.video_hooks.length === 0 &&
        cleanData.video_titles.length === 0 &&
        cleanData.captions.length === 0
      ) {
        throw new Error("Resulting data fields are empty. Try another keyword input.");
      }

      setAssets(cleanData);
    } catch (err: any) {
      console.error("Generation error:", err);
      setErrorMessage(err.message || "Our servers are currently experiencing high traffic or an error occurred. Please try again in a few moments.");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadJson = () => {
    if (!assets) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(assets, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `viral-assets.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyAll = () => {
    if (!assets) return;

    const formatSection = (title: string, items: string[]) =>
      `${title}:\n${items.map(item => `- ${item}`).join('\n')}`;

    const fullText = [
      formatSection("Video Hooks", assets.video_hooks),
      formatSection("Video Titles", assets.video_titles),
      formatSection("Captions", assets.captions),
      formatSection("Scripts", assets.scripts),
      formatSection("Retention Triggers", assets.retention_hooks),
      formatSection("Hashtags", assets.hashtags)
    ].join('\n\n');

    navigator.clipboard.writeText(fullText).then(() => {
      setToastMessage("Copied all to clipboard!");
      if (toastTimeoutId) clearTimeout(toastTimeoutId);
      setToastTimeoutId(setTimeout(() => setToastMessage(null), 2000));
    }).catch(() => {
      alert("Failed to copy to clipboard.");
    });
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#E0E0E0] font-sans selection:bg-[#FF3E00]/30 selection:text-[#FF3E00]" id="minimalist-app-root">

      {/* Visual top border accent & Loading State */}
      <div className="h-[3px] bg-[#FF3E00]/20 w-full relative overflow-hidden">
        {isLoading ? (
          <div className="absolute top-0 left-0 h-full bg-[#FF3E00] w-[40%] animate-loading-scan" />
        ) : (
          <div className="absolute top-0 left-0 h-full bg-[#FF3E00] w-full" />
        )}
      </div>

      <div className="max-w-[1300px] mx-auto p-4 md:p-8 flex flex-col gap-8">

        {/* Simplified Header */}
        <header className="flex flex-col justify-center items-center border-b border-[#333] pb-10 pt-4 text-center relative" style={{ fontFamily: "Verdana", fontWeight: "bold" }}>
          <div className="absolute inset-0 bg-gradient-to-b from-[#FF3E00]/15 to-transparent blur-3xl rounded-full -z-10 h-32 w-[60%] mx-auto pointer-events-none" />
          <h1 className="text-6xl md:text-7xl font-black font-sans text-white tracking-tighter drop-shadow-sm">
            VIRALLY <span className="text-[#FF3E00]">AI</span>
          </h1>
          <p className="text-sm md:text-base text-[#888] mt-4 font-mono uppercase tracking-widest font-medium">
            High-Attention content asset engine for short form content
          </p>
        </header>

        {/* 1. Core Simple Input Panel */}
        <section className="bg-[#0b0b0b] border border-[#222] p-5 rounded-xl space-y-4" id="simple-input-container">
          <div className="flex items-center justify-between">
            <h2 className="text-lg md:text-xl font-black font-sans text-white tracking-tight flex items-center gap-2 drop-shadow-sm">
              <Sparkles className="w-5 h-5 text-[#FF3E00]" />
              Your Topic, Web Link, or Raw Notes Draft
            </h2>
          </div>

          {errorMessage && (
            <div className="bg-red-950/40 border border-red-900/60 px-4 py-3 rounded-lg text-xs text-red-200 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-[#FF3E00] shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="flex gap-2 mb-2 items-center overflow-x-auto whitespace-nowrap scrollbar-hide pb-1">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInputText(suggestion)}
                  className="text-[10px] bg-[#111] hover:bg-[#1a1a1a] text-[#888] hover:text-white border border-[#222] hover:border-[#444] px-3 py-1.5 rounded-full transition-colors duration-150 ease-in-out font-mono"
                >
                  {suggestion}
                </button>
              ))}
              <button
                type="button"
                onClick={shuffleSuggestions}
                className="text-[#666] hover:text-white p-1.5 transition-colors duration-150 ease-in-out ml-1"
                title="Shuffle ideas"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="relative">
              <textarea
                className="w-full h-32 min-h-[140px] bg-[#101010] border border-[#252525] focus:border-[#FF3E00] focus:ring-1 focus:ring-[#FF3E00] rounded-lg p-4 pb-14 text-xs font-mono text-white placeholder-[#555] focus:outline-none transition-all duration-150 ease-in-out leading-relaxed"
                placeholder="Dump a topic keyword, URL link, script idea, or messy speech transcript here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                required
              />

              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                <div className="flex gap-2 items-center">
                  {inputText && (
                    <button
                      type="button"
                      onClick={() => setInputText("")}
                      className="text-[#555] flex items-center gap-1.5 px-3 py-2 text-[11px] uppercase font-mono hover:bg-[#222] hover:text-white transition-all duration-150 ease-in-out rounded-md border border-transparent hover:border-[#333]"
                      title="Clear contents"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear
                    </button>
                  )}
                </div>
                <div className="text-[10px] font-mono text-[#555] pr-2">
                  {inputText.trim() ? inputText.trim().split(/\s+/).length : 0} WORDS
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <button
                type="submit"
                id="generate-button"
                disabled={isLoading || !inputText.trim()}
                className={`px-8 py-3 rounded-full font-mono font-bold text-[13px] tracking-widest transition-all duration-150 ease-in-out ${
                  isLoading || !inputText.trim()
                    ? "bg-[#181818] text-[#555] border border-[#252525] cursor-not-allowed"
                    : "bg-[#FF3E00] text-white hover:bg-[#e03700] hover:shadow-[0_0_20px_rgba(255,62,0,0.4)] cursor-pointer"
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center gap-1 uppercase">
                    [GENERATING<span className="animate-pulse">_</span>]
                  </span>
                ) : (
                  "CREATE VIRAL STRATEGY"
                )}
              </button>
              <span className="text-[10px] text-[#555] font-mono uppercase tracking-wider text-center">
                Get 5 Hooks, 5 Titles, 5 Captions, 5 Scripts, 5 Hashtags & 5 Triggers.
              </span>
            </div>
          </form>
        </section>

        {/* 2. Structured Clean Output Display */}
        {assets && (
        <section className="space-y-4" id="minimalist-output-viewport">
          <div className="flex items-center justify-between border-b border-[#222] pb-2">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#888] flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#FF3E00]"></span>
              Click items to instantly copy
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleCopyAll}
                className="text-[10px] font-mono uppercase text-[#999] hover:text-[#FF3E00] border border-[#333] hover:border-[#FF3E00] px-3 py-1 bg-[#111] transition-all rounded whitespace-nowrap"
              >
                Copy All
              </button>
              <button
                onClick={downloadJson}
                className="text-[10px] font-mono uppercase text-[#999] hover:text-[#FF3E00] border border-[#333] hover:border-[#FF3E00] px-3 py-1 bg-[#111] transition-all rounded whitespace-nowrap"
              >
                Download JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

            {/* Column 1: Video Hooks */}
            <div className="space-y-3" id="hooks-output-col">
              <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                • 5 Video Hooks
              </h3>
              <div className="space-y-3">
                {assets.video_hooks.map((hook, index) => {
                  const isCopied = copiedText === hook;
                  const isFlashed = flashedItem === `hook-${index}`;
                  return (
                    <div
                      key={index}
                      onClick={() => handleCopy(hook, `hook-${index}`)}
                      className={`group cursor-pointer border-b border-[#131313] pb-2 text-left transition-colors duration-150 ease-in-out ${isFlashed ? "bg-[#FF3E00]/20" : ""}`}
                    >
                      <span className="text-[9px] text-[#444] font-mono block group-hover:text-[#FF3E00] transition-colors duration-150 uppercase">
                        Hook {String(index+1).padStart(2, '0')} {isCopied ? "[COPIED]" : ""}
                      </span>
                      <p className={`text-xs leading-relaxed transition-colors duration-150 mt-0.5 ${
                        isCopied ? "text-white font-semibold" : "text-[#b2b2b2] group-hover:text-white"
                      }`}>
                        {hook}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Video Titles */}
            <div className="space-y-3" id="titles-output-col">
              <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                • 5 Video Titles
              </h3>
              <div className="space-y-3">
                {assets.video_titles.map((title, index) => {
                  const isCopied = copiedText === title;
                  const isFlashed = flashedItem === `title-${index}`;
                  return (
                    <div
                      key={index}
                      onClick={() => handleCopy(title, `title-${index}`)}
                      className={`group cursor-pointer border-b border-[#131313] pb-2 text-left transition-colors duration-150 ease-in-out ${isFlashed ? "bg-[#FF3E00]/20" : ""}`}
                    >
                      <span className="text-[9px] text-[#444] font-mono block group-hover:text-[#FF3E00] transition-colors duration-150 uppercase">
                        Title {String(index+1).padStart(2, '0')} {isCopied ? "[COPIED]" : ""}
                      </span>
                      <p className={`text-xs leading-snug font-semibold mt-0.5 transition-colors duration-150 ${
                        isCopied ? "text-[#FF3E00]" : "text-[#E0E0E0] group-hover:text-[#FF3E00]"
                      }`}>
                        {title}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 3: Captions */}
            <div className="space-y-3" id="captions-output-col">
              <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                • 5 Captions
              </h3>
              <div className="space-y-3">
                {assets.captions.map((caption, index) => {
                  const isCopied = copiedText === caption;
                  const isFlashed = flashedItem === `caption-${index}`;
                  return (
                    <div
                      key={index}
                      onClick={() => handleCopy(caption, `caption-${index}`)}
                      className={`p-3 rounded border transition-all duration-150 ease-in-out cursor-pointer ${
                        isFlashed ? "bg-[#FF3E00]/20 border-[#FF3E00]/50" :
                        isCopied
                          ? "bg-[#FF3E00]/10 border-[#FF3E00]"
                          : "bg-[#0b0b0b] hover:bg-[#101010] border-[#1f1f1f] hover:border-[#333]"
                      }`}
                    >
                      <p className={`text-xs italic leading-tight ${
                        isCopied ? "text-white font-medium" : "text-[#bbb]"
                      }`}>
                        "{caption}"
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start mt-6">
             {/* Column 1: Scripts (takes up 2 cols on lg) */}
             <div className="lg:col-span-2 space-y-3" id="scripts-output-col">
              <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                • 5 Short Video Scripts / Outlines
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {assets.scripts.map((script, index) => {
                  const isCopied = copiedText === script;
                  const isFlashed = flashedItem === `script-${index}`;
                  return (
                    <div
                      key={index}
                      onClick={() => handleCopy(script, `script-${index}`)}
                      className={`p-4 rounded border transition-all duration-150 ease-in-out cursor-pointer ${
                        isFlashed ? "bg-[#FF3E00]/20 border-[#FF3E00]/50" :
                        isCopied
                          ? "bg-[#FF3E00]/10 border-[#FF3E00]"
                          : "bg-[#0b0b0b] hover:bg-[#101010] border-[#1f1f1f] hover:border-[#333]"
                      }`}
                    >
                      <span className="text-[9px] text-[#444] font-mono block mb-1 uppercase">
                        Script {String(index+1).padStart(2, '0')} {isCopied ? "[COPIED]" : ""}
                      </span>
                      <p className={`text-[11px] leading-relaxed ${
                        isCopied ? "text-white font-medium" : "text-[#ccc]"
                      }`}>
                        {script}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Retention & Hashtags */}
            <div className="space-y-6" id="retention-tags-output-col">

              {/* Retention Hooks block */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                  • 5 3-Sec Triggers
                </h3>
                <div className="space-y-1.5 font-mono text-[10px]">
                  {assets.retention_hooks.map((trigger, index) => {
                    const isCopied = copiedText === trigger;
                    const isFlashed = flashedItem === `trigger-${index}`;
                    return (
                      <div
                        key={index}
                        onClick={() => handleCopy(trigger, `trigger-${index}`)}
                        className={`px-2 py-1.5 rounded cursor-pointer uppercase transition-all duration-150 ease-in-out ${
                          isFlashed ? "bg-[#FF3E00] text-white" :
                          isCopied ? "bg-[#FF3E00]/80 text-white" : "bg-[#111] hover:bg-[#181818] text-[#888] hover:text-white"
                        }`}
                      >
                        &gt;&gt; {trigger}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hashtags block */}
              <div className="space-y-3">
                <h3 className="text-[11px] font-bold text-[#FF3E00] uppercase tracking-widest border-b border-[#222] pb-1.5">
                  • 5 Modern Hashtags
                </h3>
                <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                  {assets.hashtags.map((tag, index) => {
                    const isCopied = copiedText === tag;
                    const isFlashed = flashedItem === `tag-${index}`;
                    return (
                      <span
                        key={index}
                        onClick={() => handleCopy(tag, `tag-${index}`)}
                        className={`border px-2.5 py-1 rounded cursor-pointer transition-all duration-150 ease-in-out ${
                          isFlashed ? "bg-[#FF3E00] text-white border-[#FF3E00]" :
                          isCopied
                            ? "bg-white text-black font-semibold border-white"
                            : "border-[#2c2c2c] hover:bg-white hover:text-black hover:border-white text-[#888]"
                        }`}
                      >
                        {tag}
                      </span>
                    );
                  })}
                </div>
              </div>

            </div>

          </div>
        </section>
        )}
      </div>

      {/* Floating minimalistic Toast Alert */}
      <div
        id="toast"
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-white text-black text-xs font-mono px-4 py-2.5 rounded shadow-[0_4px_25px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2 pointer-events-none transition-all duration-300 z-50 transform ${
          toastMessage ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95"
        }`}
      >
        <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
        <span className="font-bold tracking-wider text-[11px] uppercase">{toastMessage}</span>
      </div>

    </div>
  );
}
