"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  RefreshCw,
  ChevronDown,
  Zap,
  Brain,
} from "lucide-react";
import { VoiceCommandButton } from "@/components/advanced/VoiceCommandButton";

interface Message {
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
}

const SUGGESTED_PROMPTS = [
  "What venues have the highest crowd risk right now?",
  "Summarize the latest alerts from today",
  "What is the current occupancy trend?",
  "Which venue feels most crowded this hour?",
  "Show me the most recent critical alerts",
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

import { api } from "@/services/api";

async function queryAssistant(question: string, language?: string): Promise<string> {
  try {
    const lang = language || (typeof window !== "undefined" ? localStorage.getItem("laminar_language") || "en" : "en");
    const { data } = await api.post('/assistant/query', { question, user_language: lang });
    return data.answer ?? "No response from AI engine.";
  } catch (err: any) {
    throw new Error(`API error: ${err?.response?.data?.detail || err.message}`);
  }
}

interface IndexStatus {
  ollama_online: boolean;
  model_in_use: string;
  index_documents: number;
  index_ready: boolean;
  last_indexed_at: string | null;
  faiss_available: boolean;
  message: string;
}

import { motion, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

export default function AIAssistantChat() {
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  
  // Magnetic Button Logic
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 200, damping: 20 });
  const springY = useSpring(mouseY, { stiffness: 200, damping: 20 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    mouseX.set(x * 0.4);
    mouseY.set(y * 0.4);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hello! I'm Randy AI, your ultra-intelligent premium assistant. Ask me anything—from live analytics and crowd matrices to complex software patterns, general intelligence, or simply converse with me in Telugu or Hindi!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [isIndexing, setIsIndexing] = useState(false);
  const [backendOnline, setBackendOnline] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      fetchStatus();
    }
  }, [isOpen]);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/assistant/status', { timeout: 3000 });
      if (res && res.data) {
        setIndexStatus(res.data);
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch {
      // Backend unreachable — show graceful offline state
      setBackendOnline(false);
      setIndexStatus(null);
    }
  };

  const reindex = async () => {
    setIsIndexing(true);
    try {
      await api.post('/assistant/index');
      setTimeout(fetchStatus, 3000);
    } catch (e) {
      console.error("Failed to reindex:", e);
    } finally {
      setTimeout(() => setIsIndexing(false), 3000);
    }
  };

  const sendMessage = async (text: string) => {
    const question = text.trim();
    if (!question || isTyping) return;

    const userMsg: Message = { role: "user", content: question, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    setError(null);
    setShowSuggestions(false);

    try {
      const answer = await queryAssistant(question);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer, timestamp: new Date() },
      ]);
    } catch (e: any) {
      const errMsg =
        "🔄 Randy AI is momentarily unavailable. The intelligent systems are reconnecting—please try again in a moment.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg, timestamp: new Date() },
      ]);
      setError(e.message);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content:
          "Chat cleared. I'm ready to help you analyze crowd data, alerts, and venue activity.",
        timestamp: new Date(),
      },
    ]);
    setShowSuggestions(true);
    setError(null);
  };

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={() => setIsOpen(true)}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseEnter={() => setIsHovered(true)}
          style={{ x: springX, y: springY }}
          id="ai-assistant-toggle"
          className="fixed bottom-8 right-8 group flex items-center gap-3 pl-5 pr-6 py-4 rounded-full 
            bg-[#010410] text-white overflow-hidden
            border border-white/10
            shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)]
            hover:border-cyan-500/50 hover:shadow-[0_0_40px_rgba(34,211,238,0.25)] 
            transition-all duration-300 z-50 cursor-pointer"
        >
          {/* Animated Background Shimmer */}
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: "easeInOut" }}
            style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)", pointerEvents: "none" }}
          />

          {/* Dynamic BG Glow */}
          <div style={{ position: "absolute", inset: 0, zIndex: 0, background: "radial-gradient(circle at center, rgba(34,211,238,0.1), transparent 70%)", opacity: isHovered ? 1 : 0.5, transition: "opacity 0.3s" }} />

          <div className="relative z-10 flex items-center gap-3">
             <div className="relative">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              <motion.span 
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full border-2 border-[#010410]" 
              />
            </div>
            <span className="text-sm font-black uppercase tracking-[0.2em] text-white group-hover:text-cyan-100 transition-colors">{t("auto.RandyAI_9416") || "Randy AI"}</span>
          </div>

          {/* Glowing Border Sweep */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            style={{ position: "absolute", inset: -2, borderRadius: "999px", padding: "1px", background: "conic-gradient(from 0deg, transparent 60%, rgba(34,211,238,1) 80%, transparent 100%)", maskImage: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", maskComposite: "exclude", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", opacity: isHovered ? 1 : 0 }}
          />
        </motion.button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 w-[380px] sm:w-[480px] flex flex-col z-50 rounded-2xl overflow-hidden
            bg-[#020611]/95 backdrop-blur-[60px]
            border border-cyan-500/30
            shadow-[0_0_120px_rgba(6,182,212,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)]"
          style={{ maxHeight: "85vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-cyan-900/40 via-blue-900/40 to-[#020611] border-b border-cyan-500/20 shrink-0">
            <div className="flex items-center gap-4">
              <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                <Brain className="w-6 h-6 text-cyan-300" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#020611] bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,1)]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-white tracking-widest uppercase">{t("auto.RandyAI_9416") || "Randy AI"}</h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30 uppercase tracking-widest shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                    {t("auto.OmniV3_419") || "Omni-V3"}
                  </span>
                </div>
                <p className="text-[11px] text-cyan-200/50 font-mono tracking-wider">
                  {indexStatus ? `${indexStatus.index_documents} memory nodes synced` : 'Quantum Core Active'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={reindex}
                disabled={isIndexing}
                title="Re-index Data"
                className={`p-1.5 rounded-lg hover:bg-slate-800/60 transition-colors ${isIndexing ? 'animate-spin text-cyan-500' : 'text-slate-500 hover:text-cyan-400'}`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearChat}
                title="Clear chat"
                className="p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Minimize"
                className="p-1.5 rounded-lg hover:bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                title="Close"
                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-[300px] scrollbar-thin scrollbar-thumb-slate-700/50 scrollbar-track-transparent">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <Bot className="w-4 h-4 text-cyan-400" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed shadow-xl ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 text-white rounded-tr-sm shadow-[0_10px_25px_rgba(6,182,212,0.3)] border border-cyan-400/20"
                      : "bg-[#0b1221]/90 backdrop-blur-xl border border-cyan-500/20 text-slate-100 rounded-tl-sm shadow-[0_10px_25px_rgba(0,0,0,0.5)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-[9px] mt-1.5 font-mono ${msg.role === "user" ? "text-cyan-200/50 text-right" : "text-slate-600"}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-slate-700 flex-shrink-0 flex items-center justify-center mt-0.5">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex-shrink-0 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span className="text-[10px] ml-1 text-slate-500 font-mono">{t("auto.analyzingdata_2038") || "analyzing data..."}</span>
                </div>
              </div>
            )}

            {/* Suggested prompts */}
            {showSuggestions && messages.length <= 1 && !isTyping && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider px-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" /> {t("auto.Suggestedquesti_8885") || "Suggested questions"}
                </p>
                {SUGGESTED_PROMPTS.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(prompt)}
                    className="w-full text-left text-xs text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800/70 border border-slate-700/40 hover:border-cyan-500/30 rounded-lg px-3 py-2 transition-all duration-200 group"
                  >
                    <span className="text-cyan-500/60 group-hover:text-cyan-400 mr-1.5 transition-colors">›</span>
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Input Bar */}
          <div className="px-3 py-3 border-t border-slate-800/80 bg-[#060d1a]/80 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center bg-slate-900/70 border border-slate-700/60 rounded-xl focus-within:border-cyan-500/50 focus-within:shadow-[0_0_0_2px_rgba(6,182,212,0.1)] transition-all">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about venues, alerts, crowd data..."
                  disabled={isTyping}
                  className="flex-1 bg-transparent py-2.5 pl-3.5 pr-2 text-sm text-white placeholder:text-slate-600 focus:outline-none disabled:opacity-50"
                />
              </div>
              <VoiceCommandButton 
                onSpeechResult={setInput} 
                disabled={isTyping} 
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isTyping}
                className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-white transition-all duration-200 shadow-md hover:shadow-cyan-900/50 active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-center mt-3 mb-1 text-[10px] text-cyan-300/40 font-mono uppercase tracking-[0.25em]">
              POWERED BY RANDY AI · SECURE · MULTILINGUAL
            </p>
          </div>
        </div>
      )}
    </>
  );
}
