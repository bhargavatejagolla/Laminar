"use client";

import { useEffect, useRef, useState } from "react";
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
  X
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";


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
function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`flex flex-col gap-1 px-4 py-3 rounded-xl bg-[#07152a] border ${accent}`}>
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-bold text-slate-200">{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { user, refreshProfile } = useAuth();
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
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
    if (!token) return;

    fetch(`${API_BASE}/api/v1/users/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((r) => r.json())
      .then((d) => {
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
        // Prefix with backend URL so the image actually loads
        if (d.profile_picture) {
          setAvatarUrl(
            d.profile_picture.startsWith("http")
              ? d.profile_picture
              : `${API_BASE}${d.profile_picture}`
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
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/api/v1/users/profile/update`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: data.name || null,
          phone_number: normPhone || null,
          receive_sms_alerts: data.receive_sms_alerts,
          alert_email: data.alert_email || null,
          receive_email_alerts: data.receive_email_alerts
        })
      });

      if (!res.ok) {
        const err = await res.json();
        const detail = Array.isArray(err.detail) ? err.detail[0]?.msg : err.detail;
        throw new Error(detail || "Update failed");
      }

      const updated = await res.json();
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
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/api/v1/users/profile/picture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (res.ok) {
        const updated = await res.json();
        // Set the actual server URL (so it persists after page reload)
        if (updated.profile_picture) {
          const picUrl = updated.profile_picture.startsWith("http")
            ? updated.profile_picture
            : `${API_BASE}${updated.profile_picture}`;
          setAvatarUrl(picUrl);
          setData(prev => ({ ...prev, profile_picture: updated.profile_picture }));
        }
        // Refresh global auth state so navbar updates immediately
        await refreshProfile();
      }
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
    <div className="min-h-screen bg-[#020c1a] text-slate-100">
      {/* ── Page Header ── */}
      <div className="px-6 py-6 border-b border-[#0f2440] bg-[#050f1f]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
              <User className="w-5 h-5 text-cyan-400" />
              My Profile
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">Manage your account and SMS alert preferences</p>
          </div>

          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0a1929] border border-[#1e3a5f] text-sm text-slate-300 hover:text-cyan-400 hover:border-cyan-500/40 transition-all"
            >
              <Edit3 className="w-4 h-4" />
              Edit Profile
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-400 hover:text-slate-200 transition-all"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={status === "saving"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-60"
              >
                {status === "saving" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {status === "saving" ? "Saving…" : "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Status Banner ── */}
        {status === "success" && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            Profile updated successfully!
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
            <div className="relative p-6 rounded-2xl bg-[#050f1f]/80 border border-[#0f2440] flex flex-col items-center text-center gap-4 overflow-hidden">
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
                  <span className="text-[10px] text-white font-medium">Change</span>
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
                <div className={`inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wider ${roleBadgeColor}`}>
                  <ShieldCheck className="w-3 h-3" />
                  {roleLabel}
                </div>
              </div>

              <div className="w-full border-t border-[#0f2440] pt-4 space-y-2 text-left">
                <StatCard
                  label="SMS Alerts"
                  value={data.receive_sms_alerts ? "Enabled" : "Disabled"}
                  accent={data.receive_sms_alerts ? "border-cyan-500/20" : "border-slate-700/50"}
                />
                <StatCard
                  label="Phone"
                  value={data.phone_number || "Not set"}
                  accent="border-slate-700/50"
                />
              </div>
            </div>
          </div>

          {/* ── Right column: Form ── */}
          <div className="md:col-span-2 space-y-5">
            {/* Personal info */}
            <div className="p-6 rounded-2xl bg-[#050f1f]/80 border border-[#0f2440] space-y-5">
              <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-[#0f2440]/60 pb-3">
                Personal Information
              </h3>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={data.name}
                    readOnly={!editing}
                    onChange={(e) => setData((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Your full name"
                    className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm transition-all
                      ${editing
                        ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40"
                        : "bg-transparent border border-transparent text-slate-300 cursor-default"
                      }`}
                  />
                </div>
              </div>

              {/* Email (read-only always) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Login Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={data.email || user?.email || ""}
                    readOnly
                    className="w-full rounded-xl pl-10 pr-4 py-2.5 text-sm bg-transparent border border-transparent text-slate-500 cursor-default"
                  />
                </div>
                <p className="text-[10px] text-slate-600 ml-1">Login email cannot be changed</p>
              </div>

              {/* Alert Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Critical Alerts Email (Optional)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    value={data.alert_email || ""}
                    readOnly={!editing}
                    onChange={(e) => setData((p) => ({ ...p, alert_email: e.target.value }))}
                    placeholder="e.g. your-gmail@gmail.com"
                    className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm transition-all
                      ${editing
                        ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40"
                        : "bg-transparent border border-transparent text-slate-300 cursor-default"
                      }`}
                  />
                </div>
                {editing && (
                  <p className="text-[10px] text-slate-500 ml-1">
                    If set, system alerts will be sent here instead of your login email.
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-400">Mobile Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <div className="absolute left-10 top-1/2 -translate-y-1/2 text-sm font-mono text-slate-500 pointer-events-none select-none">
                    {editing && !phoneRaw.startsWith("+") ? "+91 " : ""}
                  </div>
                  <input
                    type="tel"
                    value={editing ? phoneRaw : (data.phone_number || "")}
                    readOnly={!editing}
                    onChange={(e) => setPhoneRaw(e.target.value)}
                    placeholder={editing ? "8919349090" : "Not set"}
                    className={`w-full rounded-xl text-sm transition-all
                      ${editing
                        ? "bg-[#0a1929] border border-[#1e3a5f] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40 pl-10 pr-4 py-2.5"
                        : "bg-transparent border border-transparent text-slate-300 cursor-default pl-10 pr-4 py-2.5"
                      }`}
                  />
                </div>
                {editing && (
                  <p className="text-[10px] text-slate-500 ml-1">
                    Indian numbers only · Enter 10 digits (e.g. <span className="text-cyan-600 font-mono">8919349090</span>) · +91 will be added automatically
                  </p>
                )}
              </div>
            </div>

            {/* SMS Alert Preference */}
            <div className="p-6 rounded-2xl bg-[#050f1f]/80 border border-[#0f2440]">
              <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest border-b border-[#0f2440]/60 pb-3 mb-5">
                Alert Preferences
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
                  <h4 className="text-sm font-semibold text-slate-200">Critical SMS Alerts</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Receive instant text messages for critical crowd events, even without internet. Requires a valid Indian mobile number.
                  </p>
                  {data.receive_sms_alerts && !data.phone_number && (
                    <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Add a phone number above to receive alerts
                    </p>
                  )}
                </div>

                {/* Toggle SMS */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={data.receive_sms_alerts}
                    disabled={!editing}
                    onChange={(e) => setData((p) => ({ ...p, receive_sms_alerts: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className={`w-12 h-6 rounded-full transition-colors duration-300 relative
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                    after:rounded-full after:h-5 after:w-5 after:transition-all
                    peer-checked:after:translate-x-6
                    ${editing ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                    ${data.receive_sms_alerts ? "bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)]" : "bg-slate-700"}
                  `} />
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
                  <h4 className="text-sm font-semibold text-slate-200">Email Alerts</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    Receive rich HTML emails with embedded snapshots for critical crowd events.
                  </p>
                </div>

                {/* Toggle Email */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={data.receive_email_alerts}
                    disabled={!editing}
                    onChange={(e) => setData((p) => ({ ...p, receive_email_alerts: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className={`w-12 h-6 rounded-full transition-colors duration-300 relative
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white 
                    after:rounded-full after:h-5 after:w-5 after:transition-all
                    peer-checked:after:translate-x-6
                    ${editing ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
                    ${data.receive_email_alerts ? "bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.4)]" : "bg-slate-700"}
                  `} />
                </label>
              </div>

              {!editing && (
                <p className="text-[10px] text-slate-600 mt-3 ml-1">
                  Click <span className="text-slate-400 font-medium">Edit Profile</span> to modify your preferences
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
