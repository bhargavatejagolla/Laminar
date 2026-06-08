"use client";
import AmberDashboard from "@/components/amber/AmberDashboard";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function AmberRescuePage() {
  const { t } = useTranslation();

    const router = useRouter();
    return (
        <div className="relative min-h-screen">
            
            {/* Floating Back Button */}
            <button 
                onClick={() => router.push("/sentinel-command")}
                className="absolute top-6 left-6 z-50 flex items-center gap-2 text-slate-400 hover:text-white uppercase tracking-widest text-[10px] font-black transition-colors bg-black/50 hover:bg-black/80 backdrop-blur-md border border-white/10 px-4 py-2 rounded-lg"
            >
                <svg className="w-4 h-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                {t("auto.BacktoCommand_4755") || "Back to Command"}
            </button>

            <div className="relative z-10 pt-16">
                <AmberDashboard />
            </div>
        </div>
    );
}
