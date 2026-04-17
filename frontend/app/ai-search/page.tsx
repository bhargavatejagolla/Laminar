"use client";

import React, { useState, useEffect } from 'react';
import { Search, Loader2, Camera, Clock, Eye, AlertTriangle, Info, Wifi, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { api } from '@/services/api';

interface SearchResult {
  description: string;
  camera_id: string;
  timestamp: string;
  image_url: string | null;
  distance: number;
  bbox?: number[]; // [x1, y1, x2, y2] normalized 0-100
}

interface IndexStatus {
  total_items: number;
  model_loaded: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const EXAMPLE_QUERIES = [
  "Person in a red shirt",
  "Person wearing blue clothing",
  "Individual near gate area",
  "Multiple people crowding",
  "Person in dark jacket",
];

export default function AISearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexStatus, setIndexStatus] = useState<IndexStatus | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Poll index status every 5s to show if it's populated
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await api.get('/search/status');
        setIndexStatus(res.data);
      } catch {
        // non-critical
      }
    };
    checkStatus();
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, []);

  const handleSearch = async (q?: string) => {
    const searchQuery = q ?? query;
    if (!searchQuery.trim()) return;
    if (q) setQuery(q);

    setLoading(true);
    setError(null);
    setResults([]);
    setHasSearched(true);
    
    try {
      const res = await api.post('/search/semantic', { query: searchQuery.trim(), top_k: 8 });
      setResults(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'Search failed. Backend VQA system may be offline.');
    } finally {
      setLoading(false);
    }
  };

  const indexReady = (indexStatus?.total_items ?? 0) > 0;

  return (
    <div className="flex-1 overflow-auto custom-scrollbar bg-[#0a0a0f] text-slate-300 min-h-[calc(100vh-5rem)]">
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <div className="p-3 bg-cyan-500/10 rounded-xl border border-cyan-500/20 shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <Search className="h-6 w-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-[0.2em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              AI Video Search
            </h1>
            <p className="text-sm font-mono text-slate-400 mt-1 uppercase tracking-widest">
              Natural Language Object & Person Query Interface
            </p>
          </div>

          {/* Index Status Indicator */}
          <div className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest"
            style={{ 
              borderColor: indexReady ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.3)',
              background: indexReady ? 'rgba(16,185,129,0.05)' : 'rgba(100,116,139,0.05)'
            }}>
            {indexReady ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">{indexStatus!.total_items} Events Indexed</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-slate-500">Building Index...</span>
              </>
            )}
          </div>
        </div>

        {/* Index Not Ready Warning */}
        {!indexReady && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3 text-amber-400 font-mono mb-6 max-w-4xl mx-auto"
          >
            <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-bold mb-1">Semantic Index is Building</p>
              <p className="opacity-80 font-normal">
                The AI search engine indexes frames every 5 seconds as cameras detect people. 
                If your camera stream is active and detecting people, events will appear shortly. 
                Searches on an empty index will return no results.
              </p>
            </div>
          </motion.div>
        )}

        {/* Search Bar */}
        <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative mb-8 w-full max-w-4xl mx-auto group">
          <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-indigo-500 rounded-[20px] blur opacity-25 group-hover:opacity-40 transition duration-500"></div>
          <div className="relative flex items-center bg-[#111116] border border-white/10 rounded-2xl overflow-hidden focus-within:border-cyan-500/50 focus-within:ring-1 ring-cyan-500/50 transition-all shadow-inner">
            <div className="pl-6 text-cyan-500">
              <Search className="w-5 h-5" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g., 'Person wearing a red shirt near Gate 3'"
              className="w-full bg-transparent pl-4 pr-16 py-5 text-lg text-white placeholder-slate-500 focus:outline-none focus:ring-0 font-mono"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-3 px-6 py-2.5 bg-cyan-500/20 hover:bg-cyan-500 hover:text-white text-cyan-400 disabled:opacity-50 disabled:hover:bg-cyan-500/20 disabled:hover:text-cyan-400 font-bold uppercase tracking-widest text-xs rounded-xl transition-all border border-cyan-500/30"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "SEARCH"}
            </button>
          </div>
        </form>

        {/* Example Queries */}
        <div className="flex flex-wrap gap-2 mb-8 max-w-4xl mx-auto">
          <span className="text-xs text-slate-600 uppercase tracking-widest font-bold self-center mr-2">Try:</span>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleSearch(q)}
              className="text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all font-mono"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Error Handling */}
        {error && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-400 font-mono mb-8 max-w-4xl mx-auto">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        {/* Results Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {/* Empty State */}
            {!loading && hasSearched && results.length === 0 && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500"
              >
                <Eye className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-mono uppercase tracking-[0.2em] mb-2">No Matches Found</p>
                <p className="text-sm text-center max-w-md opacity-70">
                  {indexReady
                    ? `No events matching "${query}" were found in the ${indexStatus?.total_items} indexed frames. Try broader terms or different clothing colors.`
                    : "The semantic index is empty. Ensure your camera stream is active and detecting people. Searches populate as the live feed runs."}
                </p>
              </motion.div>
            )}

            {!loading && !hasSearched && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500"
              >
                <Eye className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-mono uppercase tracking-[0.2em]">Awaiting Search Query</p>
              </motion.div>
            )}

            {/* Loading state */}
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="col-span-full py-20 flex flex-col items-center justify-center text-slate-500"
              >
                <Loader2 className="h-12 w-12 mb-4 animate-spin text-cyan-400" />
                <p className="text-sm font-mono uppercase tracking-widest text-cyan-400">Scanning Semantic Index...</p>
              </motion.div>
            )}

            {/* Result cards */}
            {!loading && results.map((result, idx) => (
              <motion.div
                key={idx}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.05, duration: 0.3 }}
                className="group relative bg-[#111116] border border-white/5 rounded-2xl overflow-hidden shadow-lg hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all flex flex-col"
              >
                {/* Result Image with optional Bounding Box */}
                <div className="relative aspect-video bg-black/60 overflow-hidden shrink-0 border-b border-white/5">
                  {result.image_url ? (
                    <>
                      <img 
                        src={result.image_url.startsWith('http') ? result.image_url : `${(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '')}${result.image_url}`} 
                        alt="Search Match" 
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.jpg'; }}
                      />
                      {/* Bounding Box Overlay if coordinates are present */}
                      {result.bbox && result.bbox.length === 4 && (
                        <div 
                          className="absolute border-2 border-emerald-400 bg-emerald-400/20 shadow-[0_0_15px_rgba(16,185,129,0.5)] z-10 transition-all duration-300"
                          style={{
                            left: `${result.bbox[0]}%`,
                            top: `${result.bbox[1]}%`,
                            width: `${result.bbox[2] - result.bbox[0]}%`,
                            height: `${result.bbox[3] - result.bbox[1]}%`
                          }}
                        >
                          <span className="absolute -top-6 left-0 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-t-sm whitespace-nowrap">
                            TARGET MATCH
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 font-mono text-xs uppercase gap-2">
                       <Camera className="w-8 h-8 opacity-20" />
                       No Visual Data
                    </div>
                  )}
                  
                  {/* Confidence Badge */}
                  <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md border border-white/10 px-3 py-1 rounded-full text-xs font-black text-cyan-400 font-mono shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                    {((1 / (1 + result.distance)) * 100).toFixed(1)}% MATCH
                  </div>
                </div>

                {/* Result Details */}
                <div className="p-5 flex-1 flex flex-col">
                  <p className="text-sm text-slate-200 leading-relaxed font-medium mb-4 flex-1">
                    {result.description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                    <Link href={`/cameras/${result.camera_id}`} className="flex items-center space-x-2 text-xs text-slate-400 hover:text-cyan-400 transition-colors bg-white/5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-cyan-500/30 group/link">
                      <Camera className="w-3.5 h-3.5 text-cyan-500/60 group-hover/link:text-cyan-400" />
                      <span className="font-mono uppercase tracking-widest truncate max-w-[100px]">{result.camera_id.slice(0, 8)}</span>
                    </Link>
                    
                    <div className="flex items-center space-x-1.5 text-xs text-slate-500 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
