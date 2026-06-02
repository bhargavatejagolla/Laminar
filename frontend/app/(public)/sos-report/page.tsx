"use client";

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, AlertTriangle, Upload, Send, ShieldAlert, CheckCircle, MapPin, Phone, User, Clock } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from 'sonner';

import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function SOSReportPage() {
    const router = useRouter();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    
    const [missingName, setMissingName] = useState("");
    const [reporterName, setReporterName] = useState("");
    const [reporterContact, setReporterContact] = useState("");
    const [lastSeen, setLastSeen] = useState("");
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [trackingId, setTrackingId] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch public active missing cases
    const { data: missingCases = [], isLoading } = useQuery({
        queryKey: ['public_sos_reports'],
        queryFn: async () => {
            const res = await api.get('/sos/report/public');
            return res.data;
        },
        refetchInterval: 15000
    });

    const handleFile = (f: File) => {
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            toast.error("Please provide a photo of the missing person.");
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("missing_name", missingName);
        formData.append("reporter_name", reporterName);
        formData.append("reporter_contact", reporterContact);
        formData.append("last_seen_location", lastSeen);

        try {
            const res = await api.post("/sos/report", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            
            setTrackingId(res.data.tracking_id);
            setSubmitted(true);
            if (res.data.match_found) {
                toast.success("AI MATCH FOUND ALREADY! Security dispatched.");
            }
        } catch (err) {
            console.error(err);
            toast.error("Failed to submit report. Please find security immediately.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="w-full min-h-screen bg-[#050000] text-red-50 flex flex-col lg:flex-row relative isolate custom-scrollbar overflow-hidden">
            {/* Background elements */}
            <div className="absolute inset-0 bg-gradient-to-b from-red-950/20 to-black pointer-events-none z-0" />
            <div className="absolute top-0 inset-x-0 h-1 bg-red-600 animate-pulse z-10" />
            
            {/* Main Dashboard Area */}
            <div className="flex-1 overflow-y-auto p-6 lg:p-10 z-10 custom-scrollbar relative">
                
                {/* Back Button */}
                <button 
                    onClick={() => router.push('/')}
                    className="absolute top-6 left-6 lg:top-10 lg:left-10 z-20 flex items-center gap-2 text-red-500/70 hover:text-red-400 uppercase tracking-widest text-xs font-bold transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Go Back
                </button>

                <header className="mb-10 flex flex-col items-center lg:items-start border-b border-red-900/30 pb-6 mt-12 lg:mt-0 lg:pl-28">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center animate-pulse shadow-[0_0_30px_rgba(239,68,68,0.6)]">
                            <AlertTriangle className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black uppercase tracking-widest text-white">Active Missing Persons</h1>
                            <p className="text-red-400/80 uppercase tracking-widest text-xs font-mono">Laminar Global Network Watchlist</p>
                        </div>
                    </div>
                </header>

                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-10 h-10 rounded-full border-4 border-red-900 border-t-red-500 animate-spin" />
                    </div>
                ) : missingCases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-red-500/30">
                        <CheckCircle className="w-16 h-16 mb-4 opacity-50" />
                        <h2 className="text-xl font-bold uppercase tracking-widest text-red-500/50">Network Clear</h2>
                        <p className="text-sm font-mono mt-2">No active missing person reports.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {missingCases.map((c: any) => (
                            <div key={c.id} className="bg-red-950/20 border border-red-900/50 rounded-2xl overflow-hidden flex flex-col hover:border-red-500/50 transition-colors">
                                <div className="h-48 bg-black/60 relative flex items-center justify-center border-b border-red-900/50">
                                    {c.image_url ? (
                                        <img src={`http://localhost:8000${c.image_url}`} alt={c.missing_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-16 h-16 text-red-900" />
                                    )}
                                    <div className="absolute top-3 right-3 bg-red-600 text-white text-[10px] font-black uppercase px-2 py-1 rounded shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse">
                                        ACTIVE SEARCH
                                    </div>
                                    {c.match_found && (
                                        <div className="absolute bottom-3 left-3 bg-red-500/20 text-red-400 border border-red-500/50 text-[10px] font-bold uppercase px-2 py-1 rounded backdrop-blur-md flex items-center gap-1">
                                            <Camera className="w-3 h-3" /> AI Matched
                                        </div>
                                    )}
                                </div>
                                <div className="p-5">
                                    <h3 className="text-xl font-black uppercase text-white mb-3">{c.missing_name}</h3>
                                    <div className="space-y-2 text-sm text-red-100/70 font-medium">
                                        <p className="flex items-start gap-2">
                                            <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                            <span>Last seen: <strong className="text-white">{c.last_seen_location}</strong></span>
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <Clock className="w-4 h-4 text-red-500 shrink-0" />
                                            <span className="text-xs">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</span>
                                        </p>
                                    </div>
                                    <a 
                                        href={`/amber-rescue?track_id=${c.tracking_id}&sos=true`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-6 w-full py-2 bg-red-950 hover:bg-red-900 text-red-400 border border-red-900 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                                    >
                                        Join Search Feed
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Sidebar Upload Form */}
            <aside className="w-full lg:w-[400px] xl:w-[480px] bg-[#0a0000] border-t lg:border-t-0 lg:border-l border-red-900/50 flex flex-col z-20 shrink-0">
                <div className="p-6 border-b border-red-900/30 bg-red-950/10">
                    <h2 className="text-xl font-black uppercase tracking-widest text-red-500 flex items-center gap-2">
                        <Upload className="w-5 h-5" />
                        Report Missing
                    </h2>
                    <p className="text-xs text-red-500/60 font-mono mt-1">AI Network Dispatch Portal</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {submitted ? (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0 }} 
                                animate={{ scale: 1, opacity: 1 }}
                                className="w-full"
                            >
                                <CheckCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
                                <h2 className="text-2xl font-black uppercase text-red-500 tracking-wider mb-3">Transmitted</h2>
                                <p className="text-sm text-gray-300 font-medium mb-6">
                                    AI Spatial Engine is scanning for <strong>{missingName}</strong>. 
                                </p>
                                
                                <div className="flex flex-col gap-3">
                                    <a 
                                        href={`/amber-rescue?track_id=${trackingId}&sos=true`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                                    >
                                        Track Missing Person
                                    </a>
                                    <button 
                                        onClick={() => {
                                            setSubmitted(false);
                                            setFile(null);
                                            setPreviewUrl(null);
                                            setMissingName("");
                                            setReporterName("");
                                            setReporterContact("");
                                            setLastSeen("");
                                        }}
                                        className="w-full py-3 text-red-500 hover:bg-red-950/30 uppercase tracking-widest text-[10px] font-bold rounded-xl transition-all border border-red-900/50"
                                    >
                                        Submit Another Report
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                            
                            {/* Photo Upload */}
                            <div className="bg-black/40 border border-red-900/30 rounded-xl p-5">
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-red-500 mb-3">1. Photo *</label>
                                
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className={`w-full h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden relative ${previewUrl ? 'border-red-500/50' : 'border-red-900/50 hover:border-red-500/50 bg-red-950/10'}`}
                                >
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        ref={fileInputRef} 
                                        onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                                    />
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <Camera className="w-8 h-8 text-red-500/40 mb-2" />
                                            <span className="text-red-400/60 font-medium text-xs">Tap to upload photo</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Details */}
                            <div className="bg-black/40 border border-red-900/30 rounded-xl p-5 flex flex-col gap-4">
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-red-500 mb-1">2. Incident Details</label>
                                
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500/50" />
                                    <input 
                                        type="text" 
                                        required
                                        value={missingName}
                                        onChange={e => setMissingName(e.target.value)}
                                        placeholder="Missing Person's Name" 
                                        className="w-full bg-red-950/20 border border-red-900/40 rounded-lg py-3 pl-10 pr-3 text-sm text-white placeholder-red-500/30 focus:outline-none focus:border-red-500"
                                    />
                                </div>

                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500/50" />
                                    <input 
                                        type="text" 
                                        required
                                        value={lastSeen}
                                        onChange={e => setLastSeen(e.target.value)}
                                        placeholder="Last Seen Location" 
                                        className="w-full bg-red-950/20 border border-red-900/40 rounded-lg py-3 pl-10 pr-3 text-sm text-white placeholder-red-500/30 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                            </div>

                            {/* Your Contact */}
                            <div className="bg-black/40 border border-red-900/30 rounded-xl p-5 flex flex-col gap-4">
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-red-500 mb-1">3. Your Information</label>
                                
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500/50" />
                                    <input 
                                        type="text" 
                                        required
                                        value={reporterName}
                                        onChange={e => setReporterName(e.target.value)}
                                        placeholder="Your Name" 
                                        className="w-full bg-red-950/20 border border-red-900/40 rounded-lg py-3 pl-10 pr-3 text-sm text-white placeholder-red-500/30 focus:outline-none focus:border-red-500"
                                    />
                                </div>

                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500/50" />
                                    <input 
                                        type="tel" 
                                        required
                                        value={reporterContact}
                                        onChange={e => setReporterContact(e.target.value)}
                                        placeholder="Your Phone Number" 
                                        className="w-full bg-red-950/20 border border-red-900/40 rounded-lg py-3 pl-10 pr-3 text-sm text-white placeholder-red-500/30 focus:outline-none focus:border-red-500"
                                    />
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isSubmitting}
                                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-all py-4 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.3)] mt-2"
                            >
                                {isSubmitting ? (
                                    <span className="animate-pulse">Transmitting...</span>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Transmit SOS
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>
            </aside>
        </div>
    );
}
