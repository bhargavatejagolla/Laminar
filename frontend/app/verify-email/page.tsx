"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyEmail, resendOtp } from "@/services/auth";
import { ShieldCheck, Loader2, XCircle, KeyRound, Mail, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

function VerifyEmailContent() {
  const { t } = useTranslation();
const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (otp.length < 6) return;
    if (!emailParam) {
      setStatus("error");
      setMessage("No email address provided for verification.");
      return;
    }

    setStatus("loading");
    setMessage("Verifying Operator Identity...");

    try {
      const res = await verifyEmail(emailParam, otp);
      setStatus("success");
      setMessage(res.data?.message || "Identity Confirmed.");
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.response?.data?.detail || "Verification failed. Code may be invalid or expired.");
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !emailParam) return;
    
    try {
      await resendOtp(emailParam);
      setResendCooldown(60); // 60 seconds cooldown
      setStatus("idle");
      setMessage("Code resent. Please check your inbox.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.response?.data?.detail || "Failed to resend code.");
    }
  };

  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-xl p-8 rounded-2xl border border-slate-800 shadow-2xl relative w-full max-w-md text-center flex flex-col items-center">
      {/* Back Button */}
      <button 
        onClick={() => router.push('/register')}
        className="absolute top-4 left-4 text-slate-500 hover:text-slate-300 transition-colors p-1"
        title={t("auto.BacktoRegistrat_5533") || "Back to Registration"}
      >
        <ArrowRight className="w-5 h-5 rotate-180" />
      </button>

      {status === "idle" && (
        <form onSubmit={handleVerify} className="w-full">
          <div className="w-16 h-16 bg-cyan-950/50 rounded-full flex items-center justify-center border border-cyan-900 mb-4 shadow-lg shadow-cyan-500/20 mx-auto">
            <Mail className="w-8 h-8 text-cyan-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 tracking-wider">{t("auto.AuthenticationR_9387") || "Authentication Required"}</h2>
          <p className="text-sm text-slate-400 mt-2 mb-6">
            {t("auto.Enterthe6digitv_7550") || "Enter the 6-digit verification code sent to"} <br/>
            <strong className="text-cyan-400 break-all">{emailParam || "your email address"}</strong>
          </p>

          <div className="relative mb-6">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input 
              type="text" 
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} // Numeric only
              placeholder="000000"
              className="w-full bg-slate-900/80 border border-slate-700 text-slate-200 text-center text-2xl tracking-[0.5em] font-mono py-3 rounded-xl focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none transition-all"
            />
          </div>

          <button 
            type="submit"
            disabled={otp.length < 6}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white py-3 rounded-xl font-bold tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase text-sm mb-4"
          >
            {t("auto.Verify_4230") || "Verify"} <ArrowRight className="w-4 h-4" />
          </button>

          <button 
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-xs text-slate-500 hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:hover:text-slate-500"
          >
            {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : "Didn't receive a code? Resend"}
          </button>
        </form>
      )}

      {status === "loading" && (
        <div className="py-8">
          <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4 mx-auto" />
          <h2 className="text-xl font-bold text-slate-200 tracking-wider">{t("auto.EstablishingSec_886") || "Establishing Secure Link"}</h2>
          <p className="text-sm text-slate-400 mt-2">{message}</p>
        </div>
      )}

      {status === "success" && (
        <div className="py-8">
          <div className="w-16 h-16 bg-emerald-950/50 rounded-full flex items-center justify-center border border-emerald-900 mb-4 shadow-lg shadow-emerald-500/20 mx-auto">
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-emerald-400 tracking-wider">{t("auto.ClearanceGrante_5361") || "Clearance Granted"}</h2>
          <p className="text-sm text-slate-300 mt-2">{message}</p>
          <p className="text-xs text-slate-500 mt-6 animate-pulse">{t("auto.RedirectingtoCo_5577") || "Redirecting to Control Panel..."}</p>
        </div>
      )}

      {status === "error" && (
        <div className="py-6">
          <div className="w-16 h-16 bg-red-950/50 rounded-full flex items-center justify-center border border-red-900 mb-4 shadow-lg shadow-red-500/20 mx-auto">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-red-500 tracking-wider">{t("auto.ClearanceDenied_9142") || "Clearance Denied"}</h2>
          <p className="text-sm text-slate-300 mt-2">{message}</p>
          <div className="mt-6 flex flex-col gap-3">
            <button 
              onClick={() => { setStatus("idle"); setOtp(""); }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg tracking-wide transition-colors"
            >
              {t("auto.TryAgain_2200") || "Try Again"}
            </button>
            <button 
              onClick={() => router.push('/login')}
              className="w-full bg-transparent hover:bg-slate-800/50 text-slate-400 text-sm py-2 rounded-lg transition-colors"
            >
              {t("auto.ReturntoLogin_8473") || "Return to Login"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617] text-slate-300 relative overflow-hidden font-sans">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[120px] -z-10 animate-pulse"></div>

      <Suspense fallback={
        <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
            <p className="mt-4 text-cyan-400 font-mono text-sm tracking-widest">{t("auto.AWAITINGSIGNAL_7733") || "AWAITING SIGNAL..."}</p>
        </div>
      }>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
