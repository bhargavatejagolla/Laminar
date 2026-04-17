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

async function queryAssistant(question: string): Promise<string> {
  try {
    const { data } = await api.post('/assistant/query', { question });
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

export default function AIAssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "👋 Hello! I'm your Laminar AI Copilot — powered by a local LLM and your real-time venue data. Ask me anything about crowd levels, alerts, or venue analytics.",
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
        "⚠️ Could not reach the AI engine. Make sure Ollama is running locally with a model like `llama3`.";
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
        <button
          onClick={() => setIsOpen(true)}
          id="ai-assistant-toggle"
          className="fixed bottom-6 right-6 group flex items-center gap-2 pl-4 pr-5 py-3 rounded-full 
            bg-gradient-to-r from-cyan-600 to-blue-600 text-white 
            shadow-[0_0_30px_rgba(6,182,212,0.5)] hover:shadow-[0_0_40px_rgba(6,182,212,0.7)] 
            hover:scale-105 active:scale-95 transition-all duration-300 z-50 cursor-pointer"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          </div>
          <span className="text-sm font-semibold tracking-wide">AI Copilot</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 w-[360px] sm:w-[420px] flex flex-col z-50 rounded-2xl overflow-hidden
            bg-[#070e1a]/95 backdrop-blur-2xl
            border border-cyan-500/20
            shadow-[0_25px_80px_rgba(0,0,0,0.8),0_0_0_1px_rgba(6,182,212,0.08),inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ maxHeight: "85vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#0c1829] to-[#091525] border-b border-cyan-500/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                <Brain className="w-5 h-5 text-cyan-400" />
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0c1829] ${
                  !backendOnline
                    ? 'bg-amber-500'
                    : indexStatus?.ollama_online
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
                }`} title={!backendOnline ? 'Backend offline' : indexStatus?.ollama_online ? 'Ollama online' : 'Ollama offline'} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-bold text-white tracking-wide">Laminar AI</h3>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded border border-cyan-500/20 uppercase tracking-wider">
                    {indexStatus?.model_in_use && indexStatus.model_in_use !== 'none' ? indexStatus.model_in_use.replace('-coder', '') : 'Local LLM'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono">
                  {indexStatus ? `${indexStatus.index_documents} docs · ${indexStatus.last_indexed_at ? new Date(indexStatus.last_indexed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Never'}` : 'Ollama · FAISS'}
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
                  className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-cyan-600 to-blue-600 text-white rounded-tr-sm shadow-lg shadow-cyan-900/30"
                      : "bg-slate-800/60 border border-slate-700/50 text-slate-200 rounded-tl-sm"
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
                  <span className="text-[10px] ml-1 text-slate-500 font-mono">analyzing data...</span>
                </div>
              </div>
            )}

            {/* Suggested prompts */}
            {showSuggestions && messages.length <= 1 && !isTyping && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider px-1 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-500" /> Suggested questions
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
            <p className="text-center mt-2 text-[9px] text-slate-700 font-mono uppercase tracking-widest">
              Powered by Ollama · Local · Offline · Private
            </p>
          </div>
        </div>
      )}
    </>
  );
}
