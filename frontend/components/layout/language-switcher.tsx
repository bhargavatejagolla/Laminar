"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check, ChevronDown, Languages } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { api } from "@/services/api";

const LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", region: "International" },
  { code: "hi", label: "Hindi", nativeLabel: "हिंदी", flag: "🇮🇳", region: "India" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", flag: "🇮🇳", region: "India" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", flag: "🇮🇳", region: "India" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", flag: "🇮🇳", region: "India" },
];

const STORAGE_KEY = "laminar_language";

/** Normalize 'en-US' → 'en', 'hi-IN' → 'hi', etc. */
function normalizeCode(lng: string): string {
  return (lng || "en").split("-")[0];
}

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  /**
   * We keep a local `currentCode` state so we can control the active indicator
   * immediately on click without waiting for i18n's async languageChanged event.
   * On mount, read from localStorage first (most reliable source of truth),
   * then fall back to i18n.language.
   */
  const [currentCode, setCurrentCode] = useState<string>(() => {
    if (typeof window === "undefined") return "en";
    const saved = localStorage.getItem(STORAGE_KEY);
    return normalizeCode(saved || i18n.language || "en");
  });
  const ref = useRef<HTMLDivElement>(null);

  // Keep currentCode in sync when the i18n module changes language externally
  useEffect(() => {
    const handleChange = (lng: string) => {
      setCurrentCode(normalizeCode(lng));
    };
    i18n.on("languageChanged", handleChange);
    // Sync on mount in case i18n already resolved to a locale code
    setCurrentCode(normalizeCode(i18n.language || "en"));
    return () => {
      i18n.off("languageChanged", handleChange);
    };
  }, [i18n]);

  const currentLang =
    LANGUAGES.find((l) => l.code === currentCode) ?? LANGUAGES[0];

  const handleSelect = async (code: string) => {
    if (code === currentCode) {
      setOpen(false);
      return;
    }

    try {
      // Update local state immediately for instant UI feedback
      setCurrentCode(code);
      // Persist selection
      localStorage.setItem(STORAGE_KEY, code);
      // Tell i18next to switch — this triggers re-renders in all useTranslation() hooks
      await i18n.changeLanguage(code);
      
      // Sync with backend
      try {
        await api.put("/users/profile/update", { language_preference: code });
      } catch (backendErr) {
        console.warn("Failed to sync language to backend:", backendErr);
      }
    } catch (err) {
      console.error("Language change failed:", err);
    } finally {
      // Close the dropdown AFTER the language switch has at least been initiated
      setOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setOpen((o) => !o)}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-300 group
          ${open
            ? "bg-cyan-500/20 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.2)]"
            : "bg-slate-900/40 border border-white/5 hover:border-white/20 backdrop-blur-md"
          }
        `}
      >
        <div className={`p-1 rounded-lg transition-colors duration-300 ${open ? "bg-cyan-500/20" : "bg-white/5 group-hover:bg-white/10"}`}>
          <Languages className={`w-4 h-4 ${open ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-200"}`} />
        </div>

        <div className="flex flex-col items-start leading-none mr-1">
          <span className={`text-[10px] font-bold uppercase tracking-widest ${open ? "text-cyan-300" : "text-slate-500"}`}>
            {t("language.label") || "Language"}
          </span>
          <span className="text-xs font-semibold text-slate-200 mt-0.5">
            {currentLang.nativeLabel}
          </span>
        </div>

        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-500 ease-out ${open ? "rotate-180 text-cyan-400" : "text-slate-500"}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute right-0 top-full mt-3 w-64 z-[100]"
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0f1a]/90 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
              {/* Animated Gradient Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />

              {/* Header */}
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                  {t("language.selectLocale") || "Select Locale"}
                </span>
                <Globe className="w-3.5 h-3.5 text-slate-600" />
              </div>

              {/* Language List */}
              <div className="p-2 space-y-1">
                {LANGUAGES.map((lang, idx) => {
                  const isActive = currentCode === lang.code;
                  return (
                    <motion.button
                      key={lang.code}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      onClick={() => handleSelect(lang.code)}
                      className={`
                        w-full group relative flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 cursor-pointer
                        ${isActive
                           ? "bg-cyan-500/10"
                           : "hover:bg-white/[0.03]"
                        }
                      `}
                    >
                      {/* Active Indicator Line */}
                      {isActive && (
                        <motion.div
                          layoutId="active-lang"
                          className="absolute left-0 w-1 h-2/3 bg-cyan-500 rounded-r-full"
                        />
                      )}

                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-slate-800/50 border border-white/5 flex items-center justify-center text-xl overflow-hidden group-hover:border-cyan-500/30 transition-colors">
                        {lang.flag}
                      </div>

                      <div className="flex flex-col items-start flex-1">
                        <span className={`text-sm font-bold transition-colors ${isActive ? "text-cyan-300" : "text-slate-300 group-hover:text-white"}`}>
                          {lang.nativeLabel}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium tracking-wide">
                          {lang.label} • {lang.region}
                        </span>
                      </div>

                      {isActive && (
                        <Check className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Footer Decoration */}
              <div className="h-1 w-full bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
