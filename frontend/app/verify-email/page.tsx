"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/services/api";
import { ShieldCheck, Loader2, XCircle } from "lucide-react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying Operator Identity...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token provided.");
      return;
    }

    api.get(`/auth/verify-email?token=${token}`)
      .then((res) => {
        setStatus("success");
        setMessage(res.data.message || "Identity Confirmed.");
        setTimeout(() => router.push("/login"), 3000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.response?.data?.detail || "Verification failed. Link may be expired.");
      });
  }, [token, router]);

  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl relative w-full max-w-md text-center flex flex-col items-center">
      {status === "loading" && (
        <>
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
          <h2 className="text-xl font-bold text-slate-200 tracking-wider">Establishing Secure Link</h2>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </>
      )}

      {status === "success" && (
        <>
          <div className="w-16 h-16 bg-emerald-950/50 rounded-full flex items-center justify-center border border-emerald-900 mb-4 shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-emerald-400 tracking-wider">Clearance Granted</h2>
          <p className="text-sm text-slate-300 mt-2">{message}</p>
          <p className="text-xs text-slate-500 mt-6 animate-pulse">Redirecting to Control Panel...</p>
        </>
      )}

      {status === "error" && (
        <>
          <div className="w-16 h-16 bg-red-950/50 rounded-full flex items-center justify-center border border-red-900 mb-4 shadow-lg shadow-red-500/20">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-500 tracking-wider">Clearance Denied</h2>
          <p className="text-sm text-slate-300 mt-2">{message}</p>
          <button 
            onClick={() => router.push('/login')}
            className="mt-6 w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg tracking-wide transition-colors"
          >
            Return to Login
          </button>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] text-slate-300 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[120px] -z-10 animate-pulse"></div>

      {/* Wrapping in Suspense because useSearchParams causes client-side de-opt in Next.js 13+ */}
      <Suspense fallback={
        <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
            <p className="mt-4 text-cyan-400 font-mono text-sm tracking-widest">AWAITING SIGNAL...</p>
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
