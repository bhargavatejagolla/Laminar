"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Shield, Users, MapPin, Crown, UserCheck, UserX, ChevronRight,
  Search, RefreshCw, X, Check, AlertTriangle, Loader2, Building2,
  Lock, Eye, Pencil, Save, ChevronLeft, ArrowLeft, MoreHorizontal,
  Activity, Globe, Terminal, Settings2
} from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ShapeGrid from "@/components/animations/ShapeGrid";
import { useTranslation } from "react-i18next";

interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  role: string;
  is_active: boolean;
  profile_picture: string | null;
  venues_mapped: string[];
}

interface Venue {
  id: string;
  name: string;
  address?: string;
}

const ROLE_META: Record<string, { label: string; color: string; bg: string; icon: any; border: string }> = {
  super_admin: { label: "Super Admin", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/30", icon: Crown },
  admin:       { label: "Admin",       color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/30", icon: Shield },
  user:        { label: "User",        color: "text-sky-400",    bg: "bg-sky-400/10",    border: "border-sky-400/30",    icon: UserCheck },
};

function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();

  const meta = ROLE_META[role] ?? { label: role, color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20", icon: Eye };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${meta.color} ${meta.bg} border ${meta.border} backdrop-blur-md`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function VenueAssignModal({
  user, allVenues, onClose, onSave
}: { user: UserRecord; allVenues: Venue[]; onClose: () => void; onSave: (uid: string, venueIds: string[]) => Promise<void> }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set(user.venues_mapped));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleSave = async () => {
    setSaving(true);
    await onSave(user.id, Array.from(selected));
    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-[#0a0f1e] border border-white/10 rounded-[2rem] shadow-3xl shadow-cyan-500/20 w-full max-w-xl overflow-hidden"
      >
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[100px] -mr-32 -mt-32 rounded-full" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/5 blur-[100px] -ml-32 -mb-32 rounded-full" />

        <div className="p-8 relative z-10">
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl text-cyan-400 shadow-lg shadow-cyan-500/10">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">{t("auto.AssignOperation_4852") || "Assign Operational Boundaries"}</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium italic">
                  Operator: <span className="text-slate-300 font-bold not-italic">{user.email}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("auto.AvailableSector_5440") || "Available Sectors"}</p>
            <p className="text-[10px] font-semibold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-md border border-cyan-400/20">
              {Array.from(selected).length} Selected
            </p>
          </div>

          <div className="space-y-3 max-h-[40vh] overflow-y-auto custom-scrollbar pr-3">
            {allVenues.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 opacity-50">
                <Building2 className="w-10 h-10 mb-2" />
                <p className="text-sm font-medium text-slate-500">{t("auto.Nosectorsidenti_3310") || "No sectors identified in database."}</p>
              </div>
            )}
            {allVenues.map((v, i) => {
              const on = selected.has(v.id);
              return (
                <motion.button
                  key={v.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => toggle(v.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border transition-all duration-300 text-left group
                    ${on
                      ? "bg-cyan-500/10 border-cyan-500/40 text-white shadow-lg shadow-cyan-500/5"
                      : "bg-white/[0.03] border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/[0.06]"}`}
                >
                  <div className={`w-6 h-6 rounded-lg border flex items-center justify-center flex-shrink-0 transition-all duration-500
                    ${on ? "bg-cyan-500 border-cyan-500 rotate-0 shadow-[0_0_15px_rgba(6,182,212,0.5)]" : "border-slate-700 bg-black/20 group-hover:border-slate-500"}`}>
                    {on && <Check className="w-4 h-4 text-black stroke-[3px]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate transition-colors ${on ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`}>{v.name}</p>
                    {v.address && <p className="text-[10px] text-slate-500 font-medium truncate mt-0.5">{v.address}</p>}
                  </div>
                  <div className={`p-2 rounded-lg transition-colors ${on ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-slate-600 group-hover:text-slate-400"}`}>
                    <Building2 className="w-4 h-4" />
                  </div>
                </motion.button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-10">
            <button
              onClick={onClose}
              className="py-3.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl text-slate-400 hover:text-white text-xs font-black uppercase tracking-widest transition-all"
            >
              {t("auto.AbortMission_9903") || "Abort Mission"}
            </button>
            <motion.button
              whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(6,182,212,0.2)" }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="py-3.5 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-black rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-xl shadow-cyan-900/20"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Processing..." : "Deploy Access"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function AccessControlPage() {
  const { t } = useTranslation();
  const { isSuperAdmin, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignModal, setAssignModal] = useState<UserRecord | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removingUser, setRemovingUser] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, venuesRes] = await Promise.all([
        api.get("/users/admin/all"),
        api.get("/venues"),
      ]);
      setUsers(usersRes.data);
      setVenues(venuesRes.data || []);
    } catch (e: any) {
      toast.error("Failed to load access control data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      await api.put(`/users/${userId}/role`, { role: newRole });
      toast.success("Role updated successfully");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch {
      toast.error("Failed to update role");
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleVenueSave = async (userId: string, venueIds: string[]) => {
    try {
      await api.put(`/users/${userId}/venues`, { venue_ids: venueIds });
      toast.success("Location access updated");
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, venues_mapped: venueIds } : u));
    } catch {
      toast.error("Failed to update location access");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!window.confirm("Are you sure you want to remove this operator? Their access will be revoked but data will be preserved.")) return;
    
    setRemovingUser(userId);
    try {
      await api.delete(`/users/${userId}`);
      toast.success("Operator removed from matrix");
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e: any) {
      toast.error(e.response?.data?.detail || "Failed to remove operator");
    } finally {
      setRemovingUser(null);
    }
  };

  const filtered = users.filter(u =>
    u.is_active && (
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name ?? "").toLowerCase().includes(search.toLowerCase())
    )
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === "admin").length,
    superAdmins: users.filter(u => u.role === "super_admin").length,
    users: users.filter(u => u.role === "user").length,
  };

  return (
    <div className="relative min-h-screen bg-[#020617] text-white selection:bg-cyan-500/30">
      {/* Global Dashboard Background Layers */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Layer 1: Matrix Base */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:64px_64px] opacity-60 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        

        {/* Layer 3: User Provided ShapeGrid */}
        <div className="absolute inset-0 opacity-30">
          <ShapeGrid 
            speed={0.5}
            squareSize={40}
            direction='diagonal'
            borderColor="rgba(207, 250, 254, 0.15)" // Slightly blue-white translucent
            hoverFillColor='rgba(34,211,238,0.2)' // Brighter cyan-blue hover
            shape='square'
            hoverTrailAmount={0}
          />
        </div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12 lg:py-20">
        {/* Main Glass Dashboard Shell */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-cyan-950/40 backdrop-blur-md border border-cyan-500/30 rounded-[3rem] overflow-hidden shadow-[0_10px_50px_rgba(0,0,0,0.5)] flex flex-col min-h-[85vh] relative"
        >
          {/* Identity & Navigation Bar */}
          <div className="px-8 py-6 border-b border-cyan-500/10 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-cyan-500/[0.02] relative z-10">
            <div className="flex items-center gap-6">
              <Link href="/settings">
                <motion.button
                  whileHover={{ scale: 1.05, x: -5 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-3 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-slate-400 hover:text-white transition-all group"
                >
                  <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                  <span className="text-sm font-bold tracking-tight">{t("auto.SystemSettings_5766") || "System Settings"}</span>
                </motion.button>
              </Link>
              <div className="h-8 w-[1px] bg-white/10 hidden md:block" />
              <div className="flex items-center gap-4">
                <div className="p-3 bg-violet-600/20 border border-violet-500/30 rounded-2xl text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.2)]">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight leading-none">{t("auto.AccessControl_6520") || "Access Control"} <span className="text-violet-400">{t("auto.Matrix_9766") || "Matrix"}</span></h1>
                  <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1.5 ml-0.5 opacity-60">Laminar Protocol / Roster</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={fetchData}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-2xl text-cyan-400 text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-cyan-900/10 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Syncing..." : "Sync Roster"}
              </motion.button>
              <button className="p-2.5 rounded-2xl bg-white/5 border border-white/5 text-slate-500 hover:text-white transition-all">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-8 flex-1 flex flex-col gap-10 overflow-y-auto custom-scrollbar">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Operators", value: stats.total, icon: Users, color: "cyan", trend: "+2" },
                { label: "Superuser", value: stats.superAdmins, icon: Crown, color: "amber", trend: "Stable" },
                { label: "Admin Core", value: stats.admins, icon: Shield, color: "violet", trend: "Secure" },
                { label: "Auth Users", value: stats.users, icon: UserCheck, color: "sky", trend: "+1" },
              ].map((stat, idx) => {
                const Icon = stat.icon;
                const colors: any = {
                  cyan: "text-cyan-400",
                  amber: "text-amber-400",
                  violet: "text-violet-400",
                  sky: "text-sky-400"
                };
                return (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + idx * 0.1 }}
                    className="p-5 rounded-3xl bg-black/40 border border-white/5 hover:border-cyan-500/40 transition-all group relative overflow-hidden shadow-2xl"
                  >
                    <div className="flex items-center justify-between mb-3 relative z-10">
                      <div className={`p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 ${colors[stat.color]}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-black text-cyan-500 tracking-[0.2em] group-hover:text-white transition-colors uppercase">{stat.trend}</span>
                    </div>
                    <p className="text-2xl font-black tracking-widest relative z-10 text-white uppercase drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">{loading ? "—" : stat.value}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] relative z-10">{stat.label}</p>
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-cyan-500/[0.03] blur-[40px] opacity-0 group-hover:opacity-100 transition-opacity rounded-full pointer-events-none" />
                  </motion.div>
                );
              })}
            </div>

            {/* Tactical Search */}
            <div className="relative group max-w-2xl">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/30 to-cyan-500/30 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
              <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-cyan-400 transition-colors" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Query operational roster by identity or credentials..."
                  className="w-full bg-white/[0.03] border border-white/5 rounded-2xl pl-12 pr-4 py-4 text-xs font-medium text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/30 transition-all shadow-xl"
                />
              </div>
            </div>

            {/* Operator Grid */}
            <div className="flex-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-32 gap-6">
                  <div className="relative">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-cyan-500/20 blur-md animate-pulse" />
                    <Loader2 className="w-12 h-12 text-cyan-500 animate-spin relative z-10" />
                  </div>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em] animate-pulse">{t("auto.SynchronizingCr_8027") || "Synchronizing Cryptographic Ledger..."}</p>
                </div>
              ) : filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-32 gap-6"
                >
                  <div className="p-6 rounded-[2.5rem] bg-white/[0.02] border border-white/5 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <UserX className="w-16 h-16 text-slate-800 relative z-10" />
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400 font-black text-xl tracking-tight">{t("auto.AccessDeniedNoO_9599") || "Access Denied: No Operators Found"}</p>
                    <p className="text-slate-600 text-xs mt-2 font-medium">{t("auto.Verifyyoursearc_8392") || "Verify your search query or refresh the operational roster."}</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  variants={{
                    visible: { transition: { staggerChildren: 0.05 } }
                  }}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  <AnimatePresence mode="popLayout">
                    {filtered.map((u) => {
                      const mappedVenueNames = venues.filter(v => u.venues_mapped.includes(v.id)).map(v => v.name);
                      const isUpdating = updatingRole === u.id;
                      const roleTag = ROLE_META[u.role] ?? ROLE_META.user;

                      return (
                        <motion.div
                          key={u.id}
                          layout
                          variants={{
                            hidden: { opacity: 0, scale: 0.9, y: 20 },
                            visible: { opacity: 1, scale: 1, y: 0 }
                          }}
                          whileHover={{ y: -8 }}
                          className="relative group h-full"
                        >
                          <div className="absolute inset-0 bg-transparent rounded-[2.5rem] ring-2 ring-cyan-500/0 group-hover:ring-cyan-500/50 transition-all duration-500 pointer-events-none z-30" />
                          <div className="relative h-full bg-black/40 border border-white/10 rounded-[2.5rem] p-6 overflow-hidden flex flex-col gap-6 shadow-[0_10px_30px_rgba(0,0,0,0.8)] transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-[0_20px_50px_rgba(34,211,238,0.15)] group-hover:border-cyan-500/40 active:scale-95 active:shadow-[0_0_40px_rgba(34,211,238,0.5)]">
                             <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-10 mix-blend-overlay"></div>
                             <div className="relative z-20 flex flex-col h-full gap-6">
                            {/* Card Header: Identity */}
                            <div className="flex items-start justify-between">
                              <div className="relative">
                                <div className={`absolute -inset-1 rounded-full blur-md opacity-0 group-hover:opacity-40 transition-opacity ${u.role === 'super_admin' ? 'bg-amber-500' : 'bg-cyan-500'}`} />
                                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-center text-xl font-black text-white overflow-hidden relative z-10 shadow-2xl">
                                  {u.profile_picture
                                    ? <img src={u.profile_picture} alt="" className="w-full h-full object-cover" />
                                    : (u.name ?? u.email)[0].toUpperCase()}
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-[3px] border-[#0a0f1e] rounded-full z-20 shadow-lg shadow-emerald-500/20" />
                              </div>

                              {(isAdmin || isSuperAdmin) && (
                                <div className="flex gap-2">
                                  {isSuperAdmin && u.role !== "super_admin" && (
                                    <div className="relative h-8 w-8">
                                      <select
                                        value={u.role}
                                        onChange={e => handleRoleChange(u.id, e.target.value)}
                                        disabled={isUpdating}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                      >
                                        <option value="user">{t("auto.User_4674") || "User"}</option>
                                        <option value="admin">{t("auto.Admin_1387") || "Admin"}</option>
                                        <option value="super_admin">{t("auto.SuperAdmin_7985") || "Super Admin"}</option>
                                      </select>
                                      <div className="w-full h-full bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-500 group-hover:text-white transition-colors relative z-10">
                                        {isUpdating ? <Loader2 className="w-3 h-3 animate-spin text-cyan-400" /> : <Settings2 className="w-4 h-4" />}
                                      </div>
                                    </div>
                                  )}
                                  {u.role !== "super_admin" && (
                                    <>
                                      <motion.button
                                        whileHover={{ scale: 1.1, rotate: 5 }}
                                        onClick={() => setAssignModal(u)}
                                        className="w-8 h-8 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-500 hover:text-cyan-400 hover:border-cyan-500/30 transition-all shadow-lg"
                                      >
                                        <MapPin className="w-4 h-4" />
                                      </motion.button>
                                      {isSuperAdmin && (
                                        <motion.button
                                          whileHover={{ scale: 1.1, rotate: -5 }}
                                          onClick={() => handleRemoveUser(u.id)}
                                          disabled={removingUser === u.id}
                                          className="w-8 h-8 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-500 hover:text-rose-400 hover:border-rose-500/30 transition-all shadow-lg disabled:opacity-50"
                                        >
                                          {removingUser === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserX className="w-4 h-4" />}
                                        </motion.button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Identity Info */}
                            <div className="flex-1">
                              <p className="text-lg font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                                {u.name || <span className="text-slate-600 italic font-medium">{t("auto.GhostOperator_4442") || "Ghost Operator"}</span>}
                              </p>
                              <p className="text-xs text-slate-500 font-medium truncate mt-0.5 opacity-60 uppercase tracking-widest">{u.email}</p>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${roleTag.border} ${roleTag.bg} ${roleTag.color} shadow-sm`}>
                                  <roleTag.icon className="w-3 h-3" />
                                  {roleTag.label}
                                </span>
                              </div>
                            </div>

                            {/* Tactical Boundaries Summary */}
                            <div className="pt-4 border-t border-white/5">
                              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                <Globe className="w-3 h-3 translate-y-[0.5px]" /> {t("auto.OperationalSect_8617") || "Operational Sectors"}
                              </p>
                              {u.role === "super_admin" ? (
                                <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                  <p className="text-[10px] font-bold text-amber-500/80 flex items-center gap-2">
                                    <Lock className="w-3 h-3" /> {t("auto.UNRESTRICTEDGLO_9479") || "UNRESTRICTED GLOBAL ACCESS"}
                                  </p>
                                </div>
                              ) : mappedVenueNames.length === 0 ? (
                                <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                                  <p className="text-[10px] font-bold text-rose-500/80 flex items-center gap-2">
                                    <AlertTriangle className="w-3 h-3" /> {t("auto.NOSECTORACCESSA_2500") || "NO SECTOR ACCESS ASSIGNED"}
                                  </p>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {mappedVenueNames.map(name => (
                                    <span key={name} className="px-2.5 py-1 bg-white/5 border border-white/5 rounded-lg text-[9px] font-bold text-slate-400 group-hover:bg-cyan-500/5 group-hover:border-cyan-500/20 group-hover:text-cyan-400 transition-all">
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Venue Assignment Modal Overlay */}
      <AnimatePresence>
        {assignModal && (
          <VenueAssignModal
            user={assignModal}
            allVenues={venues}
            onClose={() => setAssignModal(null)}
            onSave={handleVenueSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
