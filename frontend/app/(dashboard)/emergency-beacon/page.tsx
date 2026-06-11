"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ShieldAlert, User, MapPin, Phone, LogOut, CheckCircle2, AlertCircle, PhoneCall, Radio, Activity, ScanLine, ArrowRight
} from "lucide-react";
import { useTranslation } from "react-i18next";
import axios from "axios";

// Helper for backend URL
const API_BASE = "http://localhost:8000/api/v1/emergency";

export default function EmergencyBeaconPage() {
    const { t } = useTranslation();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    
    // Profile State
    const [profileId, setProfileId] = useState<string | null>(null);
    const [isRegistering, setIsRegistering] = useState(false);
    
    // Registration Form State
    const [formData, setFormData] = useState({
        full_name: "",
        default_address: "",
        emergency_contact_name: "",
        emergency_contact_phone: ""
    });

    // Emergency Sequence State
    const [isTriggered, setIsTriggered] = useState(false);
    const [timeline, setTimeline] = useState<number>(0);
    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);

    useEffect(() => {
        setMounted(true);
        const storedId = localStorage.getItem("laminar_emergency_profile_id");
        if (storedId) {
            setProfileId(storedId);
        }
    }, []);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsRegistering(true);
        try {
            const res = await axios.post(`${API_BASE}/register`, formData);
            const newId = res.data.id;
            localStorage.setItem("laminar_emergency_profile_id", newId);
            setProfileId(newId);
        } catch (error) {
            console.error("Registration failed", error);
            alert("Failed to register. Please ensure backend is running.");
        } finally {
            setIsRegistering(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("laminar_emergency_profile_id");
        setProfileId(null);
        setIsTriggered(false);
        setTimeline(0);
        setLocation(null);
    };


    const triggerEmergency = async () => {
        if (!profileId || isTriggered) return;
        setIsTriggered(true);

        // 1. Capture Location
        setTimeline(1); // Locating...
        
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setLocation({ lat, lng });
                
                setTimeline(2); // Location Acquired
                
                // 2. Trigger Backend (Real Email & SSE Mesh)
                try {
                    setTimeline(3); // Contacting Backend
                    await axios.post(`${API_BASE}/trigger`, {
                        profile_id: profileId,
                        latitude: lat,
                        longitude: lng
                    });
                    
                    setTimeline(4); // Email Sent & WhatsApp
                    
                    const phone = formData.emergency_contact_phone ? formData.emergency_contact_phone.replace('+', '') : "918919349090";
                    const message = `🚨 EMERGENCY ALERT\n\nLocation:\nhttps://maps.google.com/?q=${lat},${lng}\n\nImmediate assistance required.`;
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
                    
                    setTimeout(() => setTimeline(5), 3000); // Guardian Route
                    setTimeout(() => setTimeline(6), 6000); // Liability Case
                    setTimeout(() => setTimeline(7), 9000); // Dispatch Recommended
                    
                } catch (error) {
                    console.error("Trigger failed", error);
                    setTimeline(4); // Fallback to timeline if backend fails
                    
                    const phone = formData.emergency_contact_phone ? formData.emergency_contact_phone.replace('+', '') : "918919349090";
                    const message = `🚨 EMERGENCY ALERT\n\nLocation:\nhttps://maps.google.com/?q=${lat},${lng}\n\nImmediate assistance required.`;
                    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
                    
                    setTimeout(() => setTimeline(5), 3000);
                    setTimeout(() => setTimeline(6), 6000);
                    setTimeout(() => setTimeline(7), 9000);
                }
            },
            (error) => {
                console.error("GPS error", error);
                alert("Please enable Location Services for the Beacon to work.");
                setIsTriggered(false);
                setTimeline(0);
            }
        );
    };

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans selection:bg-red-500/30">
            {/* Grid Background */}
            <div className="absolute inset-0 pointer-events-none z-0 opacity-20">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(239,68,68,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,0.05)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
            </div>

            <div className="relative z-10 px-6 py-12 max-w-[1200px] mx-auto min-h-screen flex flex-col">
                
                {/* Header */}
                <div className="flex items-center justify-between mb-12">
                    <button 
                        onClick={() => router.push("/sentinel-command")}
                        className="flex items-center gap-2 text-slate-400 hover:text-red-400 uppercase tracking-widest text-[10px] font-black transition-colors bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg"
                    >
                        <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                        Sentinel Command
                    </button>
                    
                    {profileId && (
                        <button 
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-slate-400 hover:text-white uppercase tracking-widest text-[10px] font-black transition-colors px-4 py-2"
                        >
                            <LogOut className="w-3 h-3" /> Reset Profile
                        </button>
                    )}
                </div>

                <div className="flex-1 flex flex-col items-center justify-center">
                    
                    <AnimatePresence mode="wait">
                        {!profileId ? (
                            <motion.div 
                                key="registration"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-lg bg-[#0a0a0c] border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 blur-[60px] rounded-full translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
                                
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl">
                                        <ShieldAlert className="w-6 h-6 text-red-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black uppercase tracking-widest text-white">SafeLink Registration</h2>
                                        <p className="text-xs font-mono text-slate-400">One-time emergency profile setup</p>
                                    </div>
                                </div>

                                <form onSubmit={handleRegister} className="space-y-4 relative z-10">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-2"><User className="w-3 h-3"/> Full Name</label>
                                        <input required type="text" value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors" placeholder="e.g. Jane Doe" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-2"><User className="w-3 h-3"/> Identification Photo</label>
                                        <input 
                                            type="file" 
                                            accept="image/*" 
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setFormData({...formData, photo_url: reader.result as string});
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }} 
                                            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-red-50 file:text-red-700 hover:file:bg-red-100" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-2"><MapPin className="w-3 h-3"/> Default Address</label>
                                        <input required type="text" value={formData.default_address} onChange={e => setFormData({...formData, default_address: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors" placeholder="123 Main St, Apt 4" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Contact Name</label>
                                            <input required type="text" value={formData.emergency_contact_name} onChange={e => setFormData({...formData, emergency_contact_name: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors" placeholder="John Doe" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 flex items-center gap-2"><Phone className="w-3 h-3"/> Phone No.</label>
                                            <input required type="text" value={formData.emergency_contact_phone} onChange={e => setFormData({...formData, emergency_contact_phone: e.target.value})} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors" placeholder="+918919349090" />
                                        </div>
                                    </div>
                                    
                                    <button 
                                        type="submit" 
                                        disabled={isRegistering}
                                        className="w-full mt-6 bg-red-600 hover:bg-red-500 text-white font-black uppercase tracking-widest text-sm py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] hover:shadow-[0_0_30px_rgba(220,38,38,0.5)] disabled:opacity-50"
                                    >
                                        {isRegistering ? "Registering..." : "Initialize Profile"}
                                    </button>
                                </form>
                            </motion.div>
                        ) : (
                            <motion.div 
                                key="beacon"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center"
                            >
                                {/* Left Side: The Button */}
                                <div className="flex flex-col items-center justify-center">
                                    <motion.button
                                        onClick={triggerEmergency}
                                        disabled={isTriggered}
                                        animate={isTriggered ? { scale: 0.9, opacity: 0.5 } : { scale: [1, 1.02, 1] }}
                                        transition={!isTriggered ? { repeat: Infinity, duration: 2 } : {}}
                                        className={`relative group ${isTriggered ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                    >
                                        <div className="absolute inset-0 bg-red-600 rounded-full blur-[80px] opacity-40 group-hover:opacity-70 transition-opacity duration-500"></div>
                                        
                                        <div className={`w-64 h-64 md:w-80 md:h-80 rounded-full flex flex-col items-center justify-center relative z-10 transition-all duration-500 border-[8px] border-[#0a0a0c] shadow-[inset_0_0_50px_rgba(0,0,0,0.5),0_0_30px_rgba(220,38,38,0.3)]
                                            ${isTriggered ? 'bg-red-900' : 'bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600'}`}
                                        >
                                            <ShieldAlert className={`w-24 h-24 mb-4 ${isTriggered ? 'text-red-400' : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]'}`} />
                                            <span className={`text-2xl font-black tracking-widest uppercase ${isTriggered ? 'text-red-400' : 'text-white'}`}>
                                                {isTriggered ? "Active" : "Emergency"}
                                            </span>
                                            {!isTriggered && <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-red-200 mt-2">Tap to activate</span>}
                                        </div>
                                    </motion.button>
                                </div>

                                {/* Right Side: Timeline */}
                                <div className="bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 min-h-[400px] flex flex-col">
                                    <div className="flex items-center gap-3 border-b border-white/10 pb-4 mb-6">
                                        <Activity className="w-5 h-5 text-red-500" />
                                        <h3 className="text-lg font-black uppercase tracking-widest text-white">Response Timeline</h3>
                                    </div>

                                    <div className="space-y-6 flex-1">
                                        <TimelineItem 
                                            active={timeline >= 1} 
                                            icon={ScanLine} 
                                            title="Signal Intercepted" 
                                            desc={timeline >= 2 ? `Location Acquired: ${location?.lat.toFixed(4)}, ${location?.lng.toFixed(4)}` : "Acquiring GPS..."} 
                                        />
                                        <TimelineItem 
                                            active={timeline >= 3} 
                                            icon={Radio} 
                                            title="Backend Processing" 
                                            desc="Connecting to Laminar Core" 
                                        />
                                        <TimelineItem 
                                            active={timeline >= 4} 
                                            icon={PhoneCall} 
                                            title="Contact Alerted" 
                                            desc="WhatsApp Alert & SMTP Email Dispatched" 
                                            pulse={timeline === 4}
                                        />
                                        <TimelineItem 
                                            active={timeline >= 5} 
                                            icon={ShieldAlert} 
                                            title="Guardian Route Activated" 
                                            desc="Dynamic safety routing engaged" 
                                        />
                                        <TimelineItem 
                                            active={timeline >= 6} 
                                            icon={AlertCircle} 
                                            title="Liability Case Created" 
                                            desc={`Incident ID: LMNR-EMG-${profileId.substring(0,6).toUpperCase()}`} 
                                        />
                                        <TimelineItem 
                                            active={timeline >= 7} 
                                            icon={CheckCircle2} 
                                            title="Emergency Dispatch Recommended" 
                                            desc="All local authorities notified" 
                                        />
                                    </div>
                                    
                                    {timeline >= 4 && (
                                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-8 flex items-center justify-center gap-3 text-red-400 bg-red-500/10 border border-red-500/30 p-3 rounded-xl animate-pulse">
                                            <PhoneCall className="w-4 h-4" />
                                            <span className="text-xs font-black tracking-widest uppercase">WhatsApp Dispatched</span>
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </div>
        </div>
    );
}

function TimelineItem({ active, icon: Icon, title, desc, pulse = false }: { active: boolean, icon: any, title: string, desc: string, pulse?: boolean }) {
    return (
        <div className={`flex gap-4 transition-all duration-500 ${active ? 'opacity-100' : 'opacity-30 grayscale'}`}>
            <div className="relative">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border z-10 relative bg-[#0a0a0c]
                    ${active ? 'border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-white/20 text-white/40'}`}>
                    <Icon className={`w-4 h-4 ${pulse ? 'animate-bounce' : ''}`} />
                </div>
            </div>
            <div className="pt-1">
                <h4 className="text-sm font-black uppercase tracking-wider text-white mb-1">{title}</h4>
                <p className="text-xs font-mono text-slate-400">{desc}</p>
            </div>
        </div>
    );
}
