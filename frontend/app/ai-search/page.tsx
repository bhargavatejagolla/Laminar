"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Loader2, Wifi, WifiOff, Scan, Activity,
  Crosshair, Cpu, Server, AlertTriangle, Eye, RefreshCw, Target,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface SearchResult {
  description: string;
  camera_id: string;
  timestamp: string;
  image_url: string | null;
  distance: number;
  bbox?: number[] | null;
}

interface IndexStatus {
  total_items: number;
  model_loaded: boolean;
  semantic_snapshots?: number;
  vector_store_integrity?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const API_BASE = "/api/v1";
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1")
  .replace(/\/api\/v1$/, "");
const FETCH_TIMEOUT_MS = 60_000;
const STATUS_POLL_MS = 15_000;

const PRESET_QUERIES = [
  "Person in a red shirt",
  "Person wearing blue clothing",
  "Individual near gate area",
  "Multiple people crowding",
  "Person in dark jacket",
];

const SCAN_PHASES = [
  { label: "NEURAL LINK INIT", icon: Cpu },
  { label: "VECTOR SCAN", icon: Server },
  { label: "TARGET ISOLATION", icon: Crosshair },
  { label: "MATCH EXTRACTION", icon: Activity },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function resolveImage(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  return `${BACKEND_BASE}${url}`;
}

function friendlyError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Search timed out. The AI is performing a deep forensic scan — try again in a moment or use a more specific query.";
  }
  if (err instanceof Error) return err.message;
  return "An unexpected error occurred.";
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function AISearchPage() {
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Status polling ─────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/search/status`, {}, 5000);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch {
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [fetchStatus]);

  // ── Phase cycling during load ──────────────────────────────
  useEffect(() => {
    if (!loading) { setPhase(0); return; }
    const id = setInterval(() => setPhase(p => (p + 1) % SCAN_PHASES.length), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // ── Search handler ─────────────────────────────────────────
  const handleSearch = useCallback(async (override?: string) => {
    const q = (override ?? query).trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);

    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/search/semantic`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, top_k: 8 }),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [query, loading]);

  // ── Derived state ──────────────────────────────────────────
  const indexReady =
    (status?.total_items ?? 0) > 0 || (status?.semantic_snapshots ?? 0) > 0;

  const PhaseIcon = SCAN_PHASES[phase].icon;

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-[#030508] text-white overflow-x-hidden"
      style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif" }}
    >
      {/* ── Background ─────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none select-none">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(56,189,248,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.025)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_50%_-10%,rgba(56,189,248,0.06),transparent)]" />
        <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#030508] to-transparent" />
      </div>

      {/* ── Content ────────────────────────────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center gap-5 mb-10"
        >
          <div className="relative p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/20 shadow-[0_0_24px_rgba(56,189,248,0.12)] shrink-0">
            <Scan className="h-7 w-7 text-sky-400" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping opacity-75" />
          </div>

          <div className="flex-1">
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.15em] bg-gradient-to-r from-white via-slate-200 to-slate-500 bg-clip-text text-transparent">
              {t("auto.AIVideoSearch_767") || "AI Video Search"}
            </h1>
            <p className="text-[11px] text-slate-600 uppercase tracking-widest mt-0.5">
              {t("auto.AdvancedNeuralT_1650") || "Advanced Neural Trajectory &amp; Object Core"}
            </p>
          </div>

          {/* Online badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-[11px] font-bold uppercase tracking-widest whitespace-nowrap transition-all duration-500 ${backendOnline === null
            ? "bg-slate-800/60 border-slate-700 text-slate-500"
            : backendOnline
              ? indexReady
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
            }`}>
            {backendOnline === null
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Connecting…</>
              : backendOnline
                ? indexReady
                  ? <><Wifi className="w-3 h-3" />{(status?.total_items || status?.semantic_snapshots || 0)} Nodes Online</>
                  : <><Wifi className="w-3 h-3" />{t("auto.Ready_1033") || "Ready"}</>
                : <><WifiOff className="w-3 h-3" />{t("auto.BackendOffline_1969") || "Backend Offline"}</>
            }
          </div>
        </motion.div>

        {/* Offline warning */}
        <AnimatePresence>
          {backendOnline === false && (
            <motion.div
              key="offline"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-500/8 border border-red-500/20 text-sm text-red-400 overflow-hidden"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Backend unreachable. Run{" "}
                <code className="font-mono bg-red-500/15 px-1.5 py-0.5 rounded text-xs">
                  {t("auto.pythonstartpy_1993") || "python start.py"}
                </code>{" "}
                from the project root, then{" "}
                <button onClick={fetchStatus} className="underline hover:text-red-300 inline-flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" />{t("auto.retry_1350") || "retry"}
                </button>.
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mb-6"
        >
          <div className="flex gap-2 p-1.5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-xl focus-within:border-sky-500/50 focus-within:shadow-[0_0_28px_rgba(56,189,248,0.08)] transition-all duration-300">
            <Search className="ml-3 my-auto h-4 w-4 text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder={t("auto.Describetargete_9420") || "Describe target — e.g. 'Person in a red shirt'"}
              className="flex-1 bg-transparent py-3 text-sm text-white placeholder-slate-600 outline-none"
              disabled={loading}
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className={`px-6 py-2.5 rounded-xl font-bold text-sm uppercase tracking-widest transition-all duration-200 ${loading || !query.trim()
                ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                : "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_18px_rgba(56,189,248,0.35)] hover:shadow-[0_0_30px_rgba(56,189,248,0.55)] hover:scale-[1.02] active:scale-[0.98]"
                }`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "ENGAGE"}
            </button>
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {PRESET_QUERIES.map(q => (
              <button
                key={q}
                onClick={() => { setQuery(q); handleSearch(q); }}
                disabled={loading}
                className="px-3 py-1.5 rounded-full text-xs text-slate-400 border border-white/8 bg-white/[0.03] hover:border-sky-500/40 hover:text-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
              >
                {q}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Loading panel */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="mb-8 p-8 rounded-2xl border border-sky-500/15 bg-sky-500/[0.03] flex flex-col items-center gap-5"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-sky-500/20 animate-spin border-t-sky-400" />
                <PhaseIcon className="absolute inset-0 m-auto w-5 h-5 text-sky-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sky-400 font-bold tracking-[0.2em] text-xs uppercase animate-pulse">
                  {SCAN_PHASES[phase].label}
                </p>
                <p className="text-slate-600 text-xs">Scanning snapshots for pattern match…</p>
              </div>
              <div className="w-56 h-0.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-1000"
                  style={{ width: `${(phase + 1) * 25}%` }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {error && !loading && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-500/8 border border-amber-500/25 text-amber-400 text-sm"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{error}</span>
              </div>
              <button
                onClick={() => { setError(null); handleSearch(); }}
                className="text-xs underline hover:text-amber-300 flex items-center gap-1 shrink-0"
              >
                <RefreshCw className="w-3 h-3" />{t("auto.Retry_4276") || "Retry"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No results */}
        {hasSearched && !loading && !error && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-4 py-24 text-slate-600"
          >
            <Eye className="w-12 h-12 opacity-25" />
            <p className="font-bold uppercase tracking-widest text-sm">{t("auto.NoTargetsIdenti_3332") || "No Targets Identified"}</p>
            <p className="text-xs text-slate-700">
              {t("auto.Tryadifferentco_9780") || "Try a different colour or description, or ensure snapshots have been captured."}
            </p>
          </motion.div>
        )}

        {/* Results grid */}
        <AnimatePresence>
          {!loading && results.length > 0 && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
            >
              {results.map((result, idx) => {
                const imgSrc = resolveImage(result.image_url);
                const confPct = Math.max(0, Math.min(100, Math.round((1 - result.distance) * 100)));

                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="group relative bg-[#0b0d12] border border-white/[0.08] rounded-2xl overflow-hidden shadow-xl hover:border-sky-500/35 hover:shadow-[0_0_28px_rgba(56,189,248,0.12)] transition-all duration-300 flex flex-col"
                  >
                    {/* Image area */}
                    <div className="relative aspect-video bg-black overflow-hidden shrink-0">
                      {/* Scanline overlay */}
                      <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(56,189,248,0.03)_0px,rgba(56,189,248,0.03)_1px,transparent_1px,transparent_4px)] z-10 pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent z-10 pointer-events-none" />

                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt="Match"
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          onError={e => {
                            const el = e.target as HTMLImageElement;
                            el.style.display = "none";
                            const parent = el.parentElement;
                            if (parent && !parent.querySelector(".img-fallback")) {
                              const fb = document.createElement("div");
                              fb.className = "img-fallback absolute inset-0 flex items-center justify-center text-slate-700 text-xs";
                              fb.innerText = "Snapshot unavailable";
                              parent.appendChild(fb);
                            }
                          }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-700 text-xs">
                          {t("auto.Nosnapshot_4411") || "No snapshot"}
                        </div>
                      )}

                      {/* Bounding box */}
                      {result.bbox && result.bbox.length === 4 && (
                        <div
                          className="absolute border border-sky-400 z-20 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                          style={{
                            left: `${result.bbox[0]}%`,
                            top: `${result.bbox[1]}%`,
                            width: `${result.bbox[2] - result.bbox[0]}%`,
                            height: `${result.bbox[3] - result.bbox[1]}%`,
                          }}
                        >
                          <span className="absolute -top-5 left-0 text-[9px] font-bold text-sky-400 bg-black/80 px-1 py-0.5 rounded whitespace-nowrap flex items-center gap-0.5">
                            <Target className="w-2 h-2" /> {t("auto.LOCK_2741") || "LOCK"}
                          </span>
                        </div>
                      )}

                      {/* Confidence pill */}
                      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 bg-black/65 border border-sky-500/35 rounded-full px-2 py-0.5 text-[10px] font-bold text-sky-400 backdrop-blur-sm">
                        <span className={`w-1.5 h-1.5 rounded-full ${confPct >= 70 ? "bg-emerald-400" : confPct >= 45 ? "bg-yellow-400" : "bg-red-400"} animate-pulse`} />
                        {confPct}%
                      </div>
                    </div>

                    {/* Meta */}
                    <div className="p-4 flex flex-col gap-2 flex-1">
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                        {result.description}
                      </p>
                      <div className="mt-auto pt-2 border-t border-white/[0.05] flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="opacity-60">⏱</span>
                          <span suppressHydrationWarning>
                            {new Date(result.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 font-mono truncate">
                          CAM: {result.camera_id.slice(0, 12)}…
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Landing idle state */}
        {!hasSearched && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.25 } }}
            className="flex flex-col items-center gap-6 py-28 text-center"
          >
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-sky-500/[0.05] border border-sky-500/15 flex items-center justify-center">
                <Crosshair className="w-9 h-9 text-sky-500/40" />
              </div>
              <div className="absolute inset-0 rounded-full border border-sky-500/10 animate-ping" />
            </div>
            <div>
              <p className="font-black text-base uppercase tracking-[0.2em] text-slate-500">
                {t("auto.AwaitingTargetD_3702") || "Awaiting Target Description"}
              </p>
              <p className="text-slate-700 text-xs mt-1">
                {t("auto.Describeclothin_1623") || "Describe clothing colour, object, or behaviour to begin"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {PRESET_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => { setQuery(q); handleSearch(q); }}
                  className="px-3 py-1.5 rounded-full text-xs text-slate-500 border border-white/8 bg-white/[0.03] hover:border-sky-500/40 hover:text-sky-400 transition-all duration-150"
                >
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
