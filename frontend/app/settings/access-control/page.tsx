"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield, Users, MapPin, Crown, UserCheck, UserX, ChevronRight,
  Search, RefreshCw, X, Check, AlertTriangle, Loader2, Building2,
  Lock, Eye, Pencil, Save
} from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
  const meta = ROLE_META[role] ?? { label: role, color: "text-slate-400", bg: "bg-slate-400/10", border: "border-slate-400/20", icon: Eye };
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${meta.color} ${meta.bg} border ${meta.border}`}>
      <Icon className="w-3 h-3" />{meta.label}
    </span>
  );
}

function VenueAssignModal({
  user, allVenues, onClose, onSave
}: { user: UserRecord; allVenues: Venue[]; onClose: () => void; onSave: (uid: string, venueIds: string[]) => Promise<void> }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
      <div className="relative bg-[#080f1f] border border-white/10 rounded-2xl shadow-2xl shadow-cyan-500/10 w-full max-w-lg mx-4 overflow-hidden">
        {/* Glow top */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500/60 to-transparent" />

        <div className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-cyan-400" />
                Assign Locations
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-slate-200 font-medium">{user.email}</span> · {Array.from(selected).length} of {allVenues.length} locations
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
            {allVenues.length === 0 && (
              <p className="text-center py-6 text-slate-500 text-sm">No venues found. Create one first.</p>
            )}
            {allVenues.map(v => {
              const on = selected.has(v.id);
              return (
                <button key={v.id} onClick={() => toggle(v.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-200 text-left
                    ${on ? "bg-cyan-500/10 border-cyan-500/40 text-white" : "bg-white/2 border-white/5 text-slate-400 hover:border-white/15 hover:bg-white/5"}`}
                >
                  <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 transition-all ${on ? "bg-cyan-500 border-cyan-500" : "border-slate-600"}`}>
                    {on && <Check className="w-3 h-3 text-black" />}
                  </div>
                  <Building2 className={`w-4 h-4 flex-shrink-0 ${on ? "text-cyan-400" : "text-slate-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    {v.address && <p className="text-xs text-slate-500 truncate">{v.address}</p>}
                  </div>
                  {on && <Check className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2.5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 text-sm font-medium transition-all">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-400 hover:text-cyan-300 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save Access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccessControlPage() {
  const { isSuperAdmin, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignModal, setAssignModal] = useState<UserRecord | null>(null);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

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

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === "admin").length,
    superAdmins: users.filter(u => u.role === "super_admin").length,
    users: users.filter(u => u.role === "user").length,
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="relative p-3 bg-violet-500/10 border border-violet-500/20 rounded-xl shadow-[0_0_30px_rgba(139,92,246,0.2)] flex-shrink-0">
            <div className="absolute inset-0 rounded-xl bg-violet-500/5 animate-pulse" />
            <Shield className="w-8 h-8 text-violet-400 relative z-10" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Access Control Matrix</h1>
            <p className="text-sm font-medium text-slate-400">Assign roles and location boundaries to your team.</p>
          </div>
        </div>
        <button onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all text-sm font-medium">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Members", value: stats.total, icon: Users, color: "cyan" },
          { label: "Super Admins", value: stats.superAdmins, icon: Crown, color: "amber" },
          { label: "Admins", value: stats.admins, icon: Shield, color: "violet" },
          { label: "Users", value: stats.users, icon: UserCheck, color: "sky" },
        ].map(stat => {
          const Icon = stat.icon;
          const c = { cyan: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20", amber: "text-amber-400 bg-amber-400/10 border-amber-400/20", violet: "text-violet-400 bg-violet-400/10 border-violet-400/20", sky: "text-sky-400 bg-sky-400/10 border-sky-400/20" }[stat.color] ?? "text-slate-400 bg-slate-800 border-slate-700";
          return (
            <div key={stat.label} className="bg-[#0a0f1e]/80 backdrop-blur border border-white/5 rounded-2xl p-5 flex items-center gap-4 relative overflow-hidden group hover:border-white/10 transition-all">
              <div className={`p-2.5 rounded-xl border ${c} flex-shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white font-mono">{loading ? "—" : stat.value}</p>
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full bg-[#0a0f1e]/80 backdrop-blur border border-white/8 rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* User Table */}
      <div className="bg-[#0a0f1e]/80 backdrop-blur border border-white/5 rounded-2xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 px-6 py-3 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
          <div className="col-span-4">Member</div>
          <div className="col-span-3">Role</div>
          <div className="col-span-3">Location Access</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 text-cyan-500 animate-spin" />
            <p className="text-slate-500 text-sm">Loading organization roster...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <UserX className="w-10 h-10 text-slate-600" />
            <p className="text-slate-400 font-semibold">No users found</p>
            <p className="text-slate-600 text-sm">Try a different search term.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/3">
            {filtered.map((u, idx) => {
              const mappedVenueNames = venues.filter(v => u.venues_mapped.includes(v.id)).map(v => v.name);
              const isUpdating = updatingRole === u.id;
              return (
                <div key={u.id}
                  className="grid grid-cols-12 px-6 py-4 items-center hover:bg-white/2 transition-all duration-200 group"
                  style={{ animationDelay: `${idx * 30}ms` }}>

                  {/* Member */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white overflow-hidden">
                      {u.profile_picture
                        ? <img src={u.profile_picture} alt="" className="w-full h-full object-cover" />
                        : (u.name ?? u.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{u.name || <span className="text-slate-500 italic">No name</span>}</p>
                      <p className="text-xs text-slate-500 truncate">{u.email}</p>
                    </div>
                  </div>

                  {/* Role */}
                  <div className="col-span-3">
                    {isSuperAdmin && u.role !== "super_admin" ? (
                      <div className="relative">
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u.id, e.target.value)}
                          disabled={isUpdating}
                          className="appearance-none bg-[#070d1a] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-300 focus:outline-none focus:border-violet-500/50 cursor-pointer hover:border-white/20 transition-all pr-7 disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        {isUpdating
                          ? <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-violet-400 animate-spin pointer-events-none" />
                          : <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 rotate-90 pointer-events-none" />}
                      </div>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </div>

                  {/* Location Access */}
                  <div className="col-span-3">
                    {u.role === "super_admin" ? (
                      <span className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold">
                        <Lock className="w-3 h-3" /> All Locations
                      </span>
                    ) : mappedVenueNames.length === 0 ? (
                      <span className="flex items-center gap-1.5 text-xs text-rose-400/70">
                        <AlertTriangle className="w-3 h-3" /> No Access
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {mappedVenueNames.slice(0, 2).map(name => (
                          <span key={name} className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[10px] font-semibold text-cyan-400 truncate max-w-[100px]">{name}</span>
                        ))}
                        {mappedVenueNames.length > 2 && (
                          <span className="px-2 py-0.5 bg-slate-500/10 border border-slate-500/20 rounded-full text-[10px] font-semibold text-slate-400">+{mappedVenueNames.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex justify-end">
                    {u.role !== "super_admin" && (isAdmin || isSuperAdmin) && (
                      <button
                        onClick={() => setAssignModal(u)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/5 border border-transparent hover:border-cyan-400/20 transition-all"
                      >
                        <Pencil className="w-3 h-3" /> Assign
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Venue Assignment Modal */}
      {assignModal && (
        <VenueAssignModal
          user={assignModal}
          allVenues={venues}
          onClose={() => setAssignModal(null)}
          onSave={handleVenueSave}
        />
      )}
    </div>
  );
}
