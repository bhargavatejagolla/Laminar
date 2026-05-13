"use client";

import {
  Save,
  User,
  Settings,
  Bell,
  Shield,
  Key,
  Activity,
  Server,
  Cpu,
  Database,
  HardDrive,
  Wifi,
  Users,
  ArrowLeft,
  Check,
  Copy,
  RefreshCw,
  Plus,
  Trash2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Zap,
  Globe,
  Mail,
  Smartphone,
  ChevronRight,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";

const tabs = [
  { id: "account",  icon: User,     label: "Operator Profile",    color: "cyan"   },
  { id: "api",      icon: Key,      label: "API Credentials",     color: "indigo" },
  { id: "health",   icon: Activity, label: "System Health",       color: "rose"   },
  { id: "alerts",   icon: Bell,     label: "Notification Rules",  color: "amber"  },
  { id: "security", icon: Users,    label: "Access Control",      href: "/settings/access-control", color: "emerald" },
];

const colorMap: Record<string, { border: string; text: string; bg: string; glow: string; bar: string }> = {
  cyan:    { border: "border-cyan-500/50",    text: "text-cyan-400",    bg: "bg-cyan-950/40",    glow: "shadow-[inset_0_0_20px_rgba(34,211,238,0.12)]",   bar: "bg-cyan-400"    },
  indigo:  { border: "border-indigo-500/50",  text: "text-indigo-400",  bg: "bg-indigo-950/40",  glow: "shadow-[inset_0_0_20px_rgba(99,102,241,0.12)]",   bar: "bg-indigo-400"  },
  rose:    { border: "border-rose-500/50",    text: "text-rose-400",    bg: "bg-rose-950/40",    glow: "shadow-[inset_0_0_20px_rgba(244,63,94,0.12)]",    bar: "bg-rose-400"    },
  amber:   { border: "border-amber-500/50",   text: "text-amber-400",   bg: "bg-amber-950/40",   glow: "shadow-[inset_0_0_20px_rgba(245,158,11,0.12)]",   bar: "bg-amber-400"   },
  emerald: { border: "border-emerald-500/50", text: "text-emerald-400", bg: "bg-emerald-950/40", glow: "shadow-[inset_0_0_20px_rgba(16,185,129,0.12)]",   bar: "bg-emerald-400" },
};

function InputField({
  label,
  value,
  onChange,
  type = "text",
  disabled,
  mono,
  accentColor = "cyan",
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  disabled?: boolean;
  mono?: boolean;
  accentColor?: string;
}) {
  const c = colorMap[accentColor] ?? colorMap.cyan;
  return (
    <div className="space-y-2 group">
      <label className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-2 ${disabled ? "text-slate-600" : c.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${disabled ? "bg-slate-700" : c.bar} ${!disabled && "group-focus-within:animate-ping"}`} />
        {label}
      </label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className={`w-full rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 outline-none border
          ${mono ? "font-mono" : ""}
          ${disabled
            ? "bg-black/30 border-white/5 text-slate-600 cursor-not-allowed"
            : `bg-[#020b16]/80 border-[#1e3a5f]/50 text-slate-100 
               focus:border-cyan-400/60 focus:bg-[#081428] focus:shadow-[0_0_20px_rgba(34,211,238,0.08)]
               hover:border-[#1e3a5f]`
          }`}
      />
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color = "cyan" }: { icon: any; title: string; color?: string }) {
  const { t } = useTranslation();
const c = colorMap[color] ?? colorMap.cyan;
  return (
    <div className={`flex items-center gap-3 border-b pb-4 mb-8 ${c.border.replace("50", "20")}`}>
      <div className={`p-2.5 rounded-xl border ${c.border} ${c.bg} backdrop-blur-sm`}>
        <Icon className={`w-5 h-5 ${c.text}`} />
      </div>
      <h2 className={`text-xl font-black tracking-widest uppercase ${c.text} drop-shadow-[0_0_12px_currentColor]`}>
        {title}
      </h2>
    </div>
  );
}

/* ─── ACCOUNT TAB ─── */
function AccountTab() {
  const { t } = useTranslation();
  const [name, setName] = useState("Admin Overwatch");
  const [email, setEmail] = useState("admin@laminar.ai");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8">
      <SectionHeader icon={User} title="Operator Parameters" color="cyan" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <InputField label="Callsign / Name"  value={name}  onChange={setName}  accentColor="cyan" />
        <InputField label="Clearance Level"  value="Commander (Level 5)"  disabled mono />
        <div className="md:col-span-2">
          <InputField label="Authentication Email" value={email} onChange={setEmail} type="email" accentColor="cyan" mono />
        </div>
      </div>

      {/* Avatar / ID Card */}
      <div className="flex items-center gap-6 p-5 bg-[#020b16]/60 border border-cyan-500/10 rounded-2xl">
        <div className="w-16 h-16 rounded-2xl bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(34,211,238,0.1)]">
          <User className="w-7 h-7 text-cyan-400" />
        </div>
        <div>
          <p className="text-white font-black text-sm uppercase tracking-widest">{name}</p>
          <p className="text-slate-500 text-xs font-mono mt-1">{email}</p>
          <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,1)]" />
            {t("auto.ActiveSession_5964") || "Active Session"}
          </span>
        </div>
        <div className="ml-auto">
          <button
            onClick={handleSave}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 border
              ${saved
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                : "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]"
              }`}
          >
            {saved ? <><Check className="w-4 h-4" /> {t("auto.Saved_4077") || "Saved"}</> : <><Save className="w-4 h-4" /> {t("auto.SaveProfile_8218") || "Save Profile"}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── API TAB ─── */
function ApiTab() {
  const { t } = useTranslation();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const keys = [
    { label: "Production Webhook Key", key: "lmr_prod_898492048992_xxxx_a1b2c3d4e5f6", env: "PROD", color: "indigo" as const },
    { label: "Development Integration", key: "lmr_dev_442010198281_xxxx_g7h8i9j0k1l2", env: "DEV",  color: "amber" as const },
  ];

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Key} title="Enterprise API Access" color="indigo" />
      <p className="text-sm text-slate-400 leading-relaxed border-l-2 border-indigo-500/40 pl-4 -mt-2 mb-6">
        {t("auto.Manageexternali_9825") || "Manage external integrations and API tokens for automated ingestion pipelines and third-party vision systems."}
      </p>

      <div className="space-y-4">
        {keys.map((k) => {
          const c = colorMap[k.color];
          return (
            <div key={k.key} className={`group p-5 bg-[#020b16]/70 border ${c.border.replace("50","20")} hover:${c.border} rounded-2xl transition-all duration-300`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className={`w-3.5 h-3.5 ${c.text}`} />
                    <h3 className={`text-xs font-black uppercase tracking-widest ${c.text}`}>{k.label}</h3>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${c.bg} ${c.text} border ${c.border}`}>{k.env}</span>
                  </div>
                  <p className="text-xs font-mono text-slate-400 bg-black/30 px-3 py-2 rounded-lg border border-white/5 truncate">
                    {showKey ? k.key : k.key.replace(/[^_]+$/, "••••••••••••")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 mt-1">
                  <button onClick={() => handleCopy(k.key)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 text-slate-400 hover:text-white transition-all">
                    {copied === k.key ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button className="px-3 py-2 text-[10px] font-black tracking-widest uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-all">
                    {t("auto.Revoke_8448") || "Revoke"}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => setShowKey((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest bg-slate-800/60 text-slate-400 border border-white/10 rounded-xl hover:text-white hover:border-white/20 transition-all"
        >
          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showKey ? "Mask Keys" : "Reveal Keys"}
        </button>
        <button className="flex items-center gap-2 flex-1 justify-center py-3 border border-dashed border-indigo-500/30 rounded-2xl text-indigo-400 text-xs font-black tracking-widest uppercase hover:border-indigo-400 hover:bg-indigo-500/10 transition-all">
          <Plus className="w-4 h-4" /> {t("auto.GenerateSecureT_6962") || "Generate Secure Token"}
        </button>
      </div>
    </div>
  );
}

/* ─── HEALTH TAB ─── */
function HealthTab() {
  const { t } = useTranslation();
  const { data: healthData, isLoading } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 border-t-2 border-b-2 border-rose-500 rounded-full animate-spin" />
          <div className="absolute inset-0 border-l-2 border-r-2 border-cyan-500 rounded-full animate-spin [animation-direction:reverse]" />
          <Activity className="w-6 h-6 text-rose-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!healthData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-500 font-mono text-sm tracking-widest uppercase border border-dashed border-slate-700/50 rounded-2xl bg-black/20">
        <Server className="w-10 h-10 mb-3 opacity-30" />
        {t("auto.DiagnosticPaylo_2406") || "Diagnostic Payload Unavailable"}
      </div>
    );
  }

  const metrics = [
    { icon: Cpu,       label: "CPU Load",  value: `${healthData.metrics.cpu_usage}%`,           color: "indigo",  large: true },
    { icon: HardDrive, label: "Memory",    value: `${healthData.metrics.memory_usage}%`,         color: "emerald", large: true },
    { icon: Database,  label: "DB Status", value: healthData.components.database,                color: "amber",   large: false },
    { icon: Server,    label: "Scheduler", value: healthData.components.scheduler_running ? "Running" : "Offline",
      color: healthData.components.scheduler_running ? "cyan" : "rose",                                             large: false,
      pulse: healthData.components.scheduler_running },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader icon={Activity} title="System Telemetry" color="rose" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map((m) => {
          const c = colorMap[m.color] ?? colorMap.cyan;
          return (
            <div key={m.label} className={`group relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border ${c.border.replace("50","20")} bg-[#020b16]/70 hover:${c.border} transition-all duration-300 overflow-hidden`}>
              <div className={`absolute top-0 right-0 w-20 h-20 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 ${c.bg}`} />
              {m.pulse && <div className={`absolute top-2.5 right-2.5 w-2 h-2 rounded-full ${c.bar} animate-pulse shadow-[0_0_8px_currentColor]`} />}
              <m.icon className={`w-7 h-7 ${c.text} group-hover:scale-110 transition-transform duration-300`} />
              <span className={`${m.large ? "text-3xl" : "text-base"} font-mono font-black text-white`}>{m.value}</span>
              <span className={`text-[9px] uppercase tracking-[0.2em] font-black ${c.text} ${c.bg} px-2 py-0.5 rounded`}>{m.label}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          {
            title: "Core Microservices",
            icon: Wifi,
            rows: [
              { label: "Active Cameras",    value: healthData.metrics.total_cameras,          color: "text-cyan-400"   },
              { label: "Vision Workers",    value: healthData.components.vision_workers,       color: "text-indigo-400" },
              { label: "Overall Diagnostic",value: healthData.status,                          color: healthData.status === "healthy" ? "text-emerald-400" : "text-rose-400" },
            ],
          },
          {
            title: "Matrix Traffic",
            icon: Activity,
            rows: [
              { label: "Network RX",  value: healthData.metrics.network_rx, color: "text-slate-200" },
              { label: "Network TX",  value: healthData.metrics.network_tx, color: "text-slate-200" },
              { label: "Last Sync",   value: healthData.metrics.last_minute_metric ? new Date(healthData.metrics.last_minute_metric).toLocaleTimeString() : "N/A", color: "text-amber-400" },
            ],
          },
        ].map((card) => (
          <div key={card.title} className="bg-[#020b16]/60 border border-[#1e3a5f]/40 p-6 rounded-2xl">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] border-b border-[#1e3a5f]/50 pb-3 mb-5 flex items-center gap-2">
              <card.icon className="w-4 h-4 text-slate-400" /> {card.title}
            </h4>
            <ul className="space-y-4">
              {card.rows.map((row) => (
                <li key={row.label} className="flex justify-between items-center text-sm border-b border-white/5 pb-3 last:border-0 last:pb-0">
                  <span className="text-slate-400 font-medium">{row.label}</span>
                  <span className={`font-mono font-bold ${row.color} text-xs`}>{row.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── ALERTS TAB ─── */
function AlertsTab() {
  const { t } = useTranslation();
  const [rules, setRules] = useState([
    { id: 1, label: "Surge Detection Alert",     channel: "Email",   enabled: true,  icon: Mail },
    { id: 2, label: "Camera Offline Warning",    channel: "Push",    enabled: true,  icon: Smartphone },
    { id: 3, label: "API Threshold Breach",      channel: "Webhook", enabled: false, icon: Globe },
    { id: 4, label: "System Health Critical",    channel: "Email",   enabled: true,  icon: Zap },
  ]);

  const toggle = (id: number) =>
    setRules((r) => r.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));

  return (
    <div className="space-y-6">
      <SectionHeader icon={Bell} title="Notification Rules" color="amber" />

      <p className="text-sm text-slate-400 leading-relaxed border-l-2 border-amber-500/40 pl-4 -mt-2 mb-6">
        {t("auto.Configureautoma_4286") || "Configure automated alert dispatches across channels. Rules apply globally to all monitored venues."}
      </p>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`group flex items-center gap-4 p-4 rounded-xl border transition-all duration-300
              ${rule.enabled
                ? "bg-amber-950/20 border-amber-500/20 hover:border-amber-500/40"
                : "bg-[#020b16]/40 border-white/5 hover:border-white/10"
              }`}
          >
            <div className={`p-2.5 rounded-xl border transition-all duration-300 flex-shrink-0
              ${rule.enabled ? "bg-amber-500/10 border-amber-500/30 text-amber-400" : "bg-white/5 border-white/10 text-slate-600"}`}>
              <rule.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-black uppercase tracking-wider transition-colors ${rule.enabled ? "text-white" : "text-slate-600"}`}>
                {rule.label}
              </p>
              <p className={`text-[10px] font-mono mt-0.5 transition-colors ${rule.enabled ? "text-amber-400/70" : "text-slate-700"}`}>
                Channel: {rule.channel}
              </p>
            </div>
            {/* Toggle switch */}
            <button
              onClick={() => toggle(rule.id)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 flex-shrink-0 border
                ${rule.enabled
                  ? "bg-amber-500/30 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                  : "bg-black/50 border-white/10"
                }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all duration-300 shadow-md
                ${rule.enabled ? "left-6 bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "left-0.5 bg-slate-600"}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Upgrade CTA */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-[#020b16]/80 p-5">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3 mb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h4 className="text-xs font-black uppercase tracking-widest text-amber-400">{t("auto.EnterpriseRules_7367") || "Enterprise Rules Engine"}</h4>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Unlock conditional rules, ML-driven thresholds, and multi-channel routing with{" "}
          <span className="text-cyan-400 font-bold">{t("auto.LaminarEnterpri_6600") || "Laminar Enterprise"}</span>.
        </p>
        <button className="mt-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:text-white transition-colors">
          {t("auto.ExplorePlans_2482") || "Explore Plans"} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── MAIN PAGE ─── */
export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("account");
  const [isSaving, setIsSaving] = useState(false);
  const [globalSaved, setGlobalSaved] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 900));
    setIsSaving(false);
    setGlobalSaved(true);
    setTimeout(() => setGlobalSaved(false), 2500);
  };

  const activeColor = tabs.find((t) => t.id === activeTab)?.color ?? "cyan";
  const c = colorMap[activeColor] ?? colorMap.cyan;

  return (
    <div className="min-h-screen bg-transparent text-white pb-16 relative overflow-hidden">

      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.015)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none -z-10 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)]" />
      <div className="absolute top-0 left-[30%] w-[700px] h-[250px] bg-cyan-700/8 rounded-[100%] blur-[140px] pointer-events-none" />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 relative z-10 mt-2">

        {/* Back button + title */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="group flex items-center justify-center w-10 h-10 bg-white/5 hover:bg-cyan-500/15 border border-white/10 hover:border-cyan-500/40 rounded-xl transition-all duration-300 flex-shrink-0 shadow-[0_0_15px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors group-hover:-translate-x-0.5 transition-transform duration-200" />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <div className="absolute inset-0 bg-cyan-500/20 blur-[18px] group-hover:blur-[28px] transition-all rounded-full" />
              <div className="p-3.5 bg-cyan-950/40 border border-cyan-500/40 rounded-2xl relative z-10 shadow-[inset_0_0_20px_rgba(34,211,238,0.2)]">
                <Settings className="w-7 h-7 text-cyan-400 group-hover:rotate-90 transition-transform duration-700" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-[0.05em] uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                {t("auto.SystemPreferenc_8133") || "System Preferences"}
              </h1>
              <p className="text-xs font-bold text-slate-500 tracking-widest uppercase mt-0.5">
                {t("auto.GlobalArchitect_7223") || "Global Architecture &amp; Operations"}
              </p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`group relative flex items-center gap-2.5 px-7 py-3 text-sm font-black rounded-xl transition-all duration-300 border overflow-hidden uppercase tracking-widest
            ${globalSaved
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              : "bg-cyan-500/10 hover:bg-cyan-400/20 text-cyan-400 border-cyan-500/30 hover:border-cyan-400/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)]"
            }`}
        >
          <div className="absolute inset-x-0 bottom-0 h-px bg-current scale-x-0 group-hover:scale-x-100 transition-transform origin-left opacity-50" />
          {isSaving
            ? <span className="w-4 h-4 rounded-full border-t-2 border-r-2 border-cyan-400 animate-spin" />
            : globalSaved
              ? <Check className="w-4 h-4" />
              : <Save className="w-4 h-4" />
          }
          {isSaving ? "Syncing Config..." : globalSaved ? "Config Saved" : "Update Config"}
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col md:flex-row gap-6 relative z-10">

        {/* Sidebar */}
        <nav className="w-full md:w-64 flex-shrink-0 space-y-1.5">
          {tabs.map((tab) => {
            const tc = colorMap[tab.color] ?? colorMap.cyan;
            const isActive = activeTab === tab.id;

            if (tab.href) {
              return (
                <Link key={tab.id} href={tab.href}
                  className="group relative w-full flex items-center gap-3 px-5 py-4 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-200 border border-transparent bg-[#081428]/40 hover:bg-[#081428]/80 hover:border-slate-700/50 text-slate-500 hover:text-slate-200"
                >
                  <tab.icon className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                  {tab.label}
                  <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative w-full flex items-center gap-3 px-5 py-4 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all duration-200 border overflow-hidden
                  ${isActive
                    ? `${tc.bg} ${tc.border} ${tc.text} ${tc.glow}`
                    : "bg-[#081428]/40 border-transparent text-slate-500 hover:bg-[#081428]/80 hover:border-slate-700/50 hover:text-slate-200"
                  }`}
              >
                {isActive && (
                  <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${tc.bar} shadow-[0_0_12px_currentColor]`} />
                )}
                <tab.icon className={`w-4 h-4 transition-colors ${isActive ? tc.text : "text-slate-600"}`} />
                {tab.label}
                {isActive && <span className={`ml-auto w-1.5 h-1.5 rounded-full ${tc.bar} animate-pulse`} />}
              </button>
            );
          })}

          {/* Sidebar version badge */}
          <div className="pt-4 px-5">
            <div className="p-3 rounded-xl bg-black/20 border border-white/5 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600">{t("auto.LaminarPlatform_3554") || "Laminar Platform"}</p>
              <p className="text-[10px] font-mono text-cyan-500/50 mt-0.5">{t("auto.v241enterprise_6017") || "v2.4.1-enterprise"}</p>
            </div>
          </div>
        </nav>

        {/* Content Panel */}
        <div className={`flex-1 min-h-[520px] relative rounded-2xl border border-slate-700/30 bg-gradient-to-br from-[#081428]/90 to-[#040a12]/95 backdrop-blur-2xl p-8 overflow-hidden shadow-[inset_0_0_60px_rgba(34,211,238,0.02)]`}>
          {/* Watermark */}
          <div className="absolute top-0 right-0 p-4 pointer-events-none text-[160px] leading-none font-black opacity-[0.03] select-none">
            {activeTab.toUpperCase().substring(0, 3)}
          </div>

          {/* Accent top border glow */}
          <div className={`absolute top-0 left-0 right-0 h-px ${c.bar} opacity-20`} />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative z-10"
            >
              {activeTab === "account" && <AccountTab />}
              {activeTab === "api"     && <ApiTab />}
              {activeTab === "health"  && <HealthTab />}
              {activeTab === "alerts"  && <AlertsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
