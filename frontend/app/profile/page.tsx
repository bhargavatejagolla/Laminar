"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  User,
  Phone,
  Mail,
  ShieldCheck,
  Bell,
  BellOff,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Edit3,
  Save,
  X,
  ArrowLeft,
  Activity,
  Trophy,
  Shield,
  Zap,
  Star,
  Settings,
  UserCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { api } from "@/services/api";
import BorderGlow from "@/components/ui/BorderGlow";
import { useTranslation } from "react-i18next";


// ─── Types ────────────────────────────────────────────────────────────
type Status = "idle" | "saving" | "success" | "error";

interface ProfileData {
  name: string;
  phone_number: string;
  receive_sms_alerts: boolean;
  alert_email?: string;
  receive_email_alerts: boolean;
  profile_picture?: string;
  role?: string;
  email?: string;
}

// ─── Indian phone helpers ──────────────────────────────────────────────
function normalisePhone(raw: string): string {
  // Strip all non-digit/plus chars
  let digits = raw.replace(/[^\d]/g, "");
  // If starts with 91 and length is 12, prepend +
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  // If 10-digit raw number, add +91
  if (digits.length === 10) return `+91${digits}`;
  // Already had the +
  if (raw.startsWith("+")) return `+${digits}`;
  return raw;
}

function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

// ─── Stat Card ────────────────────────────────────────────────────────
function StatCard({ label, value, accent, icon: Icon }: { label: string; value: string; accent: string; icon: any }) {
  const { t } = useTranslation();

  return (
    <motion.div 
      whileHover={{ scale: 1.02, backgroundColor: "rgba(7, 21, 42, 0.8)" }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl bg-[#07152a]/60 border ${accent} transition-colors group`}
    >
      <div className={`p-2 rounded-lg bg-slate-800/50 group-hover:bg-cyan-500/10 transition-colors`}>
        <Icon className="w-4 h-4 text-cyan-400 group-hover:text-cyan-300" />
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-bold text-slate-200">{value}</span>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, refreshProfile } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<ProfileData>({
    name: "",
    phone_number: "",
    receive_sms_alerts: false,
    alert_email: "",
    receive_email_alerts: true
  });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");

  // ── Fetch profile ──
  useEffect(() => {
    if (!user) return;
    api.get("/users/profile")
      .then((r) => {
        const d = r.data;
        setData({
          name: d.name || "",
          phone_number: d.phone_number || "",
          receive_sms_alerts: d.receive_sms_alerts ?? false,
          alert_email: d.alert_email || "",
          receive_email_alerts: d.receive_email_alerts ?? true,
          profile_picture: d.profile_picture,
          role: d.role,
          email: d.email
        });
        setPhoneRaw(d.phone_number || "");
        if (d.profile_picture) {
          setAvatarUrl(
            d.profile_picture.startsWith("http")
              ? d.profile_picture
              : `${api.defaults.baseURL?.replace('/api/v1', '')}${d.profile_picture}`
          );
        }
      })
      .catch(() => {});
  }, [user]);

  // ── Save profile ──
  const handleSave = async () => {
    const normPhone = phoneRaw ? normalisePhone(phoneRaw) : "";

    if (normPhone && !isValidIndianPhone(normPhone)) {
      setStatus("error");
      setErrorMsg("Enter a valid Indian mobile number (10 digits, starts with 6-9). E.g. 8919349090 or +918919349090");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    try {
      const res = await api.put("/users/profile/update", {
        name: data.name || null,
        phone_number: normPhone || null,
        receive_sms_alerts: data.receive_sms_alerts,
        alert_email: data.alert_email || null,
        receive_email_alerts: data.receive_email_alerts
      });

      const updated = res.data;
      setData((prev) => ({
        ...prev,
        name: updated.name || "",
        phone_number: updated.phone_number || "",
        receive_sms_alerts: updated.receive_sms_alerts,
        alert_email: updated.alert_email || "",
        receive_email_alerts: updated.receive_email_alerts
      }));
      setPhoneRaw(updated.phone_number || "");
      setStatus("success");
      setEditing(false);
      setTimeout(() => setStatus("idle"), 4000);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  };

  // ── Cancel editing ──
  const handleCancel = () => {
    setPhoneRaw(data.phone_number || "");
    setEditing(false);
    setStatus("idle");
    setErrorMsg("");
  };

  // ── Avatar upload ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview immediately with blob URL
    const blobUrl = URL.createObjectURL(file);
    setAvatarUrl(blobUrl);

    const form = new FormData();
    form.append("file", file);
    try {
      const res = await api.post("/users/profile/picture", form, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      const updated = res.data;
      // Set the actual server URL (so it persists after page reload)
      if (updated.profile_picture) {
        const picUrl = updated.profile_picture.startsWith("http")
          ? updated.profile_picture
          : `${api.defaults.baseURL?.replace('/api/v1', '')}${updated.profile_picture}`;
          setAvatarUrl(picUrl);
          setData(prev => ({ ...prev, profile_picture: updated.profile_picture }));
        }
        // Refresh global auth state so navbar updates immediately
        await refreshProfile();
      setStatus("success");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setAvatarUrl(null);
      setStatus("error");
      setErrorMsg("Picture upload failed. Please try again.");
    }
  };

  const displayName = data.name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();
  const roleLabel = (data.role || (user as any)?.role || "viewer").toUpperCase();
  const roleBadgeColor =
    roleLabel === "ADMIN"
      ? "border-cyan-500/30 text-cyan-400 bg-cyan-500/10"
      : roleLabel === "MANAGER"
      ? "border-violet-500/30 text-violet-400 bg-violet-500/10"
      : "border-slate-600 text-slate-400 bg-slate-800/60";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-[#020c1a] text-slate-100 relative overflow-hidden"
    >
      {/* ── Background Decorative Elements ── */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none -z-10 anime-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none -z-10 anime-pulse" style={{ animationDelay: '2s' }}></div>

      {/* ── Page Header ── */}
      <div className="px-6 py-6 border-b border-[#0f2440] bg-[#050f1f]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl bg-[#0a1929] border border-[#1e3a5f] text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-all flex items-center justify-center shrink-0"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                {t("auto.MyProfile_8735") || "My Profile"}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">{t("auto.Manageyouraccou_6328") || "Manage your account and SMS alert preferences"}</p>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {!editing ? (
              <motion.button
                key="edit-btn"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                onClick={() => setEditing(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a1929] border border-[#1e3a5f] text-sm text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-all group overflow-hidden relative shadow-lg shadow-cyan-500/5"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-500/5 to-cyan-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <Edit3 className="w-4 h-4" />
                {t("auto.EditProfile_3358") || "Edit Profile"}
              </motion.button>
            ) : (
              <motion.div 
                key="edit-actions"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="flex items-center gap-2"
              >
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-slate-200 transition-all font-medium"
                >
                  <X className="w-4 h-4" />
                  {t("auto.Cancel_9092") || "Cancel"}
                </button>
                <button
                  onClick={handleSave}
                  disabled={status === "saving"}
                  className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-500/30 transition-all disabled:opacity-60 relative overflow-hidden"
                >
                  {status === "saving" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {status === "saving" ? "Syncing..." : "Commit Changes"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Status Banner ── */}
        {status === "success" && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            {t("auto.Profileupdateds_2656") || "Profile updated successfully!"}
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* ── Left column: Avatar + Stats ── */}
          <div className="space-y-4">
            {/* Avatar card */}
            <BorderGlow
              borderRadius={16}
              backgroundColor="#050f1f"
              glowColor="200 100 50"
              glowIntensity={0.8}
              animated={true}
              className="w-full"
            >
              <div className="relative p-6 flex flex-col items-center text-center gap-4 overflow-hidden w-full">
                <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-transparent pointer-events-none" />

                {/* Avatar */}
                <div className="relative group">
                  <div className="w-24 h-24 rounded-2xl ring-4 ring-[#0a1929] overflow-hidden shadow-2xl">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-2xl font-black text-white">
                        {initials}
                      </div>
                    )}
                  </div>
                  {/* Upload overlay */}
                  <label
                    htmlFor="avatar-upload"
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer gap-1"
                  >
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[10px] text-white font-medium">{t("auto.Change_6163") || "Change"}</span>
                  </label>
                  <input
                    id="avatar-upload"
                    type="file"
                    ref={fileRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileChange}
                  />
                </div>

                <div>
                  <h2 className="font-bold text-slate-100 text-lg leading-tight">{displayName}</h2>
                  <p className="text-xs text-slate-500 flex items-center justify-center gap-1 mt-1">
                    <Mail className="w-3 h-3" />
                    {data.email || user?.email}
                  </p>
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    className={`inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider shadow-[0_0_15px_rgba(34,211,238,0.15)] ${roleBadgeColor}`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    {roleLabel}
                  </motion.div>
                </div>

                <div className="w-full border-t border-[#0f2440]/60 pt-4 space-y-3 text-left">
                  <div className="px-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t("auto.ProfileStrength_9791") || "Profile Strength"}</span>
                      <span className="text-[10px] font-bold text-cyan-400">85%</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800/50 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "85%" }}
                        transition={{ duration: 1, delay: 0.5 }}
                        className="h-full bg-gradient-to-r from-cyan-600 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <StatCard
                      label="SMS Alerts"
                      value={data.receive_sms_alerts ? "Enabled" : "Disabled"}
                      accent={data.receive_sms_alerts ? "border-cyan-500/20" : "border-slate-700/50"}
                      icon={Bell}
                    />
                    <StatCard
                      label="Account Access"
                      value={roleLabel}
                      accent="border-slate-700/50"
                      icon={Shield}
                    />
                  </div>
                </div>
              </div>
            </BorderGlow>
          </div>

          {/* ── Right column: Form ── */}
          <div className="md:col-span-2 space-y-5">
            {/* Personal info */}
            <BorderGlow
              borderRadius={16}
              backgroundColor="#050f1f"
              glowColor="200 100 50"
              glowIntensity={0.6}
              className="w-full"
            >
              <div className="p-6 space-y-5">
                <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-[#0f2440]/60 pb-3">
                  {t("auto.PersonalInforma_3986") || "Personal Information"}
                </h3>

                {/* Name */}
                <div className="space-y-1.5 group/field">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">{t("auto.FullName_7282") || "Full Name"}</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-cyan-400 transition-colors" />
                    <input
                      type="text"
                      value={data.name}
                      readOnly={!editing}
                      onChange={(e) => setData((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Your full name"
                      className={`w-full rounded-xl pl-11 pr-4 py-2.5 text-sm transition-all duration-300
                        ${editing
                          ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                          : "bg-transparent border border-transparent text-slate-300 cursor-default"
                        }`}
                    />
                  </div>
                </div>

                {/* Email (read-only always) */}
                <div className="space-y-1.5 opacity-60">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">{t("auto.LoginEmailAddre_667") || "Login Email Address"}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      type="email"
                      value={data.email || user?.email || ""}
                      readOnly
                      className="w-full rounded-xl pl-11 pr-4 py-2.5 text-sm bg-transparent border border-transparent text-slate-500 cursor-default"
                    />
                  </div>
                </div>

                {/* Alert Email */}
                <div className="space-y-1.5 group/field">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Critical Alerts Email (Optional)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-cyan-400 transition-colors" />
                    <input
                      type="email"
                      value={data.alert_email || ""}
                      readOnly={!editing}
                      onChange={(e) => setData((p) => ({ ...p, alert_email: e.target.value }))}
                      placeholder="e.g. your-gmail@gmail.com"
                      className={`w-full rounded-xl pl-11 pr-4 py-2.5 text-sm transition-all duration-300
                        ${editing
                          ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10"
                          : "bg-transparent border border-transparent text-slate-300 cursor-default"
                        }`}
                    />
                  </div>
                  {editing && (
                    <p className="text-[10px] text-slate-500 ml-1 opacity-70">
                      {t("auto.Ifsetsystemaler_1483") || "If set, system alerts will be sent here instead of your login email."}
                    </p>
                  )}
                </div>

                {/* Phone */}
                <div className="space-y-1.5 group/field">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">{t("auto.MobileNumber_9290") || "Mobile Number"}</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within/field:text-cyan-400 transition-colors" />
                    <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500 pointer-events-none select-none">
                      {editing && !phoneRaw.startsWith("+") ? "+91 " : ""}
                    </div>
                    <input
                      type="tel"
                      value={editing ? phoneRaw : (data.phone_number || "")}
                      readOnly={!editing}
                      onChange={(e) => setPhoneRaw(e.target.value)}
                      placeholder={editing ? "8919349090" : "Not set"}
                      className={`w-full rounded-xl text-sm transition-all duration-300
                        ${editing
                          ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 pl-11 pr-4 py-2.5"
                          : "bg-transparent border border-transparent text-slate-300 cursor-default pl-11 pr-4 py-2.5"
                        }`}
                    />
                  </div>
                  {editing && (
                    <p className="text-[10px] text-slate-500 ml-1 opacity-70">
                      Indian numbers only · +91 will be added automatically
                    </p>
                  )}
                </div>
              </div>
            </BorderGlow>

            {/* SMS Alert Preference */}
            <BorderGlow
              borderRadius={16}
              backgroundColor="#050f1f"
              glowColor="200 100 50"
              glowIntensity={0.6}
              className="w-full"
            >
              <div className="p-6">
                <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-[#0f2440]/60 pb-3 mb-5">
                  {t("auto.AlertPreference_6778") || "Alert Preferences"}
                </h3>

                <div
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 ${
                    data.receive_sms_alerts
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : "border-slate-700/40 bg-slate-900/20"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    data.receive_sms_alerts ? "bg-cyan-500/15" : "bg-slate-800"
                  }`}>
                    {data.receive_sms_alerts
                      ? <Bell className="w-5 h-5 text-cyan-400" />
                      : <BellOff className="w-5 h-5 text-slate-500" />
                    }
                  </div>

                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-200">{t("auto.CriticalSMSAler_7799") || "Critical SMS Alerts"}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {t("auto.Receiveinstantt_976") || "Receive instant text messages for critical crowd events, even without internet. Requires a valid Indian mobile number."}
                    </p>
                    {data.receive_sms_alerts && !data.phone_number && (
                      <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {t("auto.Addaphonenumber_7335") || "Add a phone number above to receive alerts"}
                      </p>
                    )}
                  </div>

                  {/* Toggle SMS */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 group">
                    <input
                      type="checkbox"
                      checked={data.receive_sms_alerts}
                      disabled={!editing}
                      onChange={(e) => setData((p) => ({ ...p, receive_sms_alerts: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className={`w-14 h-7 rounded-full transition-all duration-500 relative border-2
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                      after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-[0_0_10px_rgba(255,255,255,0.5)]
                      peer-checked:after:translate-x-7
                      ${editing ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                      ${data.receive_sms_alerts 
                        ? "bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] after:bg-cyan-100" 
                        : "bg-slate-900 border-slate-700 after:bg-slate-500"}
                    `}>
                      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                        <span className={`text-[8px] font-black transition-opacity ${data.receive_sms_alerts ? "opacity-0" : "opacity-30 text-slate-400"}`}>{t("auto.OFF_8103") || "OFF"}</span>
                        <span className={`text-[8px] font-black transition-opacity ${data.receive_sms_alerts ? "opacity-100 text-cyan-400" : "opacity-0"}`}>ON</span>
                      </div>
                    </div>
                  </label>
                </div>

                <div
                  className={`flex items-center gap-4 p-4 mt-4 rounded-xl border transition-all duration-300 ${
                    data.receive_email_alerts
                      ? "border-cyan-500/30 bg-cyan-500/5"
                      : "border-slate-700/40 bg-slate-900/20"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    data.receive_email_alerts ? "bg-cyan-500/15" : "bg-slate-800"
                  }`}>
                    {data.receive_email_alerts
                      ? <Mail className="w-5 h-5 text-cyan-400" />
                      : <BellOff className="w-5 h-5 text-slate-500" />
                    }
                  </div>

                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-slate-200">{t("auto.EmailAlerts_3772") || "Email Alerts"}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {t("auto.ReceiverichHTML_6978") || "Receive rich HTML emails with embedded snapshots for critical crowd events."}
                    </p>
                  </div>

                  {/* Toggle Email */}
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 group">
                    <input
                      type="checkbox"
                      checked={data.receive_email_alerts}
                      disabled={!editing}
                      onChange={(e) => setData((p) => ({ ...p, receive_email_alerts: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className={`w-14 h-7 rounded-full transition-all duration-500 relative border-2
                      after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                      after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-[0_0_10px_rgba(255,255,255,0.5)]
                      peer-checked:after:translate-x-7
                      ${editing ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                      ${data.receive_email_alerts 
                        ? "bg-cyan-500/20 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.2)] after:bg-cyan-100" 
                        : "bg-slate-900 border-slate-700 after:bg-slate-500"}
                    `}>
                      <div className="absolute inset-0 flex items-center justify-between px-2 pointer-events-none">
                        <span className={`text-[8px] font-black transition-opacity ${data.receive_email_alerts ? "opacity-0" : "opacity-30 text-slate-400"}`}>{t("auto.OFF_8103") || "OFF"}</span>
                        <span className={`text-[8px] font-black transition-opacity ${data.receive_email_alerts ? "opacity-100 text-cyan-400" : "opacity-0"}`}>ON</span>
                      </div>
                    </div>
                  </label>
                </div>

                {!editing && (
                  <p className="text-[10px] text-slate-600 mt-3 ml-1">
                    {t("auto.Click_1512") || "Click"} <span className="text-slate-400 font-medium">{t("auto.EditProfile_3358") || "Edit Profile"}</span> {t("auto.tomodifyyourpre_3033") || "to modify your preferences"}
                  </p>
                )}
              </div>
            </BorderGlow>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
