"use client";

import React, { useState } from 'react';
import { Search, Loader2, Camera, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/services/api';

// Replace with actual API URL or proxy path
const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

interface SearchResult {
  description: string;
  camera_id: string;
  timestamp: string;
  image_url: string | null;
  distance: number;
  bbox?: number[];
}

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      const { data } = await api.post('/search/semantic', { 
        query: query.trim(), 
        top_k: 5 
      });
      setResults(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err.message || 'An error occurred during search.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl mt-8">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <Search className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">
            AI Video Search
          </h2>
          <p className="text-sm text-neutral-500">
            Ask natural language questions about your video history.
          </p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="relative mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., 'Person wearing a red shirt near Gate 3'"
          className="w-full bg-black/50 border border-neutral-800 rounded-lg pl-4 pr-12 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono text-sm"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="absolute right-2 top-2 p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 rounded-md transition-colors"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Search className="h-4 w-4 text-white" />}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        <AnimatePresence>
          {results.length === 0 && !loading && !error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-10 text-neutral-600 flex flex-col items-center"
            >
              <Search className="h-10 w-10 mb-3 opacity-20" />
              <p>Enter a query to search semantic events.</p>
            </motion.div>
          )}

          {results.map((result, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-black/40 border border-neutral-800 rounded-lg overflow-hidden hover:border-blue-500/30 transition-colors group"
            >
              <div className="p-4">
                <p className="text-sm text-white mb-3 leading-relaxed">
                  {result.description}
                </p>
                <div className="flex items-center space-x-4 text-xs text-neutral-500">
                  <div className="flex items-center space-x-1">
                    <Camera className="h-3 w-3" />
                    <span className="truncate max-w-[120px]">{result.camera_id}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Clock className="h-3 w-3" />
                    <span>{new Date(result.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-400 font-mono">
                    Match: {((1 / (1 + result.distance)) * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              {result.image_url && (
                <div className="w-full bg-black border-t border-neutral-800 overflow-hidden relative group">
                  <img 
                    src={result.image_url.startsWith('http') ? result.image_url : `${(process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/v1$/, '')}${result.image_url}`} 
                    alt="Event Snapshot" 
                    className="w-full h-auto block opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={(e) => {
                       (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                    }}
                  />
                  {result.bbox && result.bbox.length === 4 && (
                    <div 
                      className="absolute border-2 border-blue-500 bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-300"
                      style={{
                        left: `${result.bbox[0]}%`,
                        top: `${result.bbox[1]}%`,
                        width: `${Math.max(0, result.bbox[2] - result.bbox[0])}%`,
                        height: `${Math.max(0, result.bbox[3] - result.bbox[1])}%`
                      }}
                    >
                      <div className="absolute -top-10 left-[-2px] flex flex-col items-start font-bold tracking-wider whitespace-nowrap z-10">
                        <div className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-t flex items-center shadow-lg">
                          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse mr-1.5" />
                          LIVE CAM: {result.camera_id.toUpperCase()}
                        </div>
                        <div className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-br rounded-bl shadow-lg border-t border-blue-400">
                          TARGET MATCH: {((1 / (1 + result.distance)) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
