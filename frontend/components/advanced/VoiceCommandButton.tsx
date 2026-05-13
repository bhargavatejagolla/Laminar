"use client";

/**
 * Laminar - Voice Command Button
 * --------------------------------
 * Mic button for the AI assistant chat UI.
 * Uses the native Web Speech API (SpeechRecognition) — no backend call needed.
 * Transcribed text is filled into the chat input via the provided callback.
 *
 * Browser support: Chrome, Edge (full), Firefox/Safari (limited)
 * Fallback: Shows "not supported" tooltip on unsupported browsers
 */

import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";

interface VoiceCommandButtonProps {
  onSpeechResult: (text: string) => void; // Called with recognized text
  onError?: (error: string) => void;      // Optional error callback
  className?: string;
  disabled?: boolean;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export function VoiceCommandButton({
  onSpeechResult,
  onError,
  className = "",
  disabled = false,
}: VoiceCommandButtonProps) {
  const { t } = useTranslation();

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // ── Browser support check ─────────────────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      setTranscript(final || interim);

      if (final) {
        onSpeechResult(final.trim());
        setIsListening(false);
        setTranscript("");
      }
    };

    recognition.onerror = (event: any) => {
      setIsListening(false);
      setTranscript("");
      const msg =
        event.error === "not-allowed"
          ? "Microphone permission denied"
          : event.error === "no-speech"
          ? "No speech detected"
          : `Voice error: ${event.error}`;
      onError?.(msg);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  }, [onSpeechResult, onError]);

  // ── Toggle recording ─────────────────────────────────────────────────────
  const toggle = useCallback(() => {
    if (!recognitionRef.current || disabled) return;

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setTranscript("");
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening, disabled]);

  // ── Keyboard shortcut: Ctrl+M ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  if (!isSupported) {
    return (
      <button
        disabled
        className={`relative flex items-center justify-center w-9 h-9 rounded-full bg-neutral-800 text-neutral-500 cursor-not-allowed ${className}`}
        title="Voice input not supported in this browser (use Chrome or Edge)"
      >
        <MicIcon crossed />
      </button>
    );
  }

  return (
    <div className="relative group flex items-center justify-center">
      {/* Dynamic ambient glow behind the button */}
      <div 
        className={`absolute inset-0 rounded-full blur-xl transition-all duration-500 ease-in-out ${
          isListening 
            ? "bg-gradient-to-r from-rose-500 via-fuchsia-500 to-rose-500 opacity-60 scale-150 animate-spin-slow" 
            : "bg-indigo-500/0 scale-100 group-hover:bg-indigo-500/20 group-hover:scale-125"
        }`} 
      />

      <button
        onClick={toggle}
        disabled={disabled}
        className={`
          relative z-10 flex items-center justify-center w-12 h-12 rounded-full
          transition-all duration-500 focus:outline-none overflow-hidden
          ${isListening
            ? "bg-black border border-rose-500/50 scale-110 shadow-[0_0_40px_rgba(244,63,94,0.4)]"
            : "bg-black/40 hover:bg-black/60 border border-white/10 hover:border-indigo-500/40 hover:scale-105 backdrop-blur-xl"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${className}
        `}
        title={isListening ? "Stop listening (Ctrl+M)" : "Start voice input (Ctrl+M)"}
        aria-label={isListening ? "Stop voice recognition" : "Start voice recognition"}
      >
        {/* Active state audio-wave rings */}
        {isListening && (
          <>
            <span className="absolute inset-0 rounded-full border border-rose-400 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite] opacity-50" />
            <span className="absolute inset-2 rounded-full border border-fuchsia-400 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite_0.3s] opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/20 to-transparent" />
          </>
        )}
        
        <MicIcon className={`relative z-20 w-5 h-5 transition-all duration-300 ${isListening ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] scale-110" : "text-indigo-300 group-hover:text-indigo-100"}`} />
      </button>

      {/* Elegant transcript toast */}
      {transcript && (
        <div className="absolute bottom-16 -right-2 transform translate-x-1/2 md:translate-x-0 md:right-0 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 text-sm text-white font-medium whitespace-nowrap max-w-[280px] truncate shadow-2xl flex items-center gap-3">
          <div className="flex space-x-1">
             <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
             <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
             <div className="w-1.5 h-1.5 bg-fuchsia-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
          <span className="truncate">{transcript}</span>
        </div>
      )}

      {/* Modern Tooltip */}
      {!isListening && (
        <div className="absolute bottom-16 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-neutral-900/90 backdrop-blur-md border border-white/10 rounded-lg px-3 py-1.5 text-xs text-neutral-300 whitespace-nowrap pointer-events-none shadow-xl font-medium">
          {t("auto.Voiceinput_8711") || "Voice input"} <span className="text-neutral-500 ml-1 font-mono">Ctrl+M</span>
        </div>
      )}
    </div>
  );
}

// ─── Mic Icon SVG ──────────────────────────────────────────────────────────────
function MicIcon({ crossed = false, className = "text-white" }: { crossed?: boolean; className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {crossed ? (
        <>
          <line x1="1" y1="1" x2="23" y2="23" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
          <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      ) : (
        <>
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </>
      )}
    </svg>
  );
}
