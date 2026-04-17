"use client";

import { useState, useMemo } from "react";
import { useVenues } from "@/hooks/useVenues";
import { useQueryClient } from "@tanstack/react-query";
import { VenueService } from "@/services/venue.service";
import { Venue } from "@/types/venue";
import VenueCard from "@/components/venues/venue-card";
import AddVenueModal from "@/components/venues/add-venue-modal";
import { MapPin, Search, Filter, Plus, X, Loader2, Map, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

export default function VenuesPage() {
  const [isAddMode, setIsAddMode] = useState(false);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [showFilter, setShowFilter] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();

  const { data: venues, isLoading, isError } = useVenues();
  const queryClient = useQueryClient();

  const filtered = useMemo(() => {
    if (!venues) return [];
    return venues.filter((v: Venue) => {
      const matchesSearch =
        !search ||
        v.name?.toLowerCase().includes(search.toLowerCase()) ||
        v.city?.toLowerCase().includes(search.toLowerCase()) ||
        v.country?.toLowerCase().includes(search.toLowerCase());
      const matchesFilter =
        filterActive === "all" ||
        (filterActive === "active" && v.is_active) ||
        (filterActive === "inactive" && !v.is_active);
      return matchesSearch && matchesFilter;
    });
  }, [venues, search, filterActive]);

  const handleDelete = async (venue: Venue) => {
    if (!confirm(`Delete "${venue.name}"? This will also remove all associated cameras.`)) return;
    setDeletingId(venue.id);
    try {
      await VenueService.deleteVenue(venue.id);
      await queryClient.invalidateQueries({ queryKey: ["venues"] });
      toast.success(`Venue "${venue.name}" deleted successfully.`);
    } catch (err: any) {
      toast.error(`Failed to delete venue: ${err?.response?.data?.detail || err.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-white pb-12 relative">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 mt-4"
      >
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500/20 rounded-2xl blur-[15px] animate-pulse" />
            <div className="p-3 bg-cyan-950/40 backdrop-blur-md border border-cyan-500/40 rounded-2xl relative z-10 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
              <MapPin className="w-8 h-8 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-black tracking-[0.08em] uppercase text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.15)]">
                {t("venues.title")}
              </h1>
              {!isLoading && (
                <span className="px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 text-[10px] font-black uppercase tracking-[0.2em] font-mono">
                  {filtered.length}/{venues?.length ?? 0}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-slate-400 tracking-widest uppercase">
              {t("venues.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("venues.searchPlaceholder")}
              className="bg-white/5 border border-white/10 text-sm rounded-xl pl-9 pr-8 py-2.5 focus:outline-none focus:border-cyan-500/60 transition-colors w-52 text-slate-200 placeholder:text-slate-600 backdrop-blur-md"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300" />
              </button>
            )}
          </div>

          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilter(f => !f)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold rounded-xl border transition-all whitespace-nowrap backdrop-blur-md ${
                filterActive !== "all"
                  ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              <Filter className="w-4 h-4" />
              {filterActive === "all" ? t("venues.filter") : filterActive === "active" ? t("venues.active") : t("venues.inactive")}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <AnimatePresence>
              {showFilter && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                  className="absolute right-0 top-11 glass-panel border-white/15 rounded-2xl shadow-2xl z-50 min-w-[160px] overflow-hidden"
                >
                  {(["all", "active", "inactive"] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => { setFilterActive(opt); setShowFilter(false); }}
                      className={`w-full text-left px-5 py-3 text-sm font-bold capitalize transition-colors uppercase tracking-widest text-[11px] ${
                        filterActive === opt
                          ? "bg-cyan-500/10 text-cyan-400"
                          : "text-slate-400 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {opt === "all" ? "All Venues" : opt === "active" ? "✓ Active" : "✗ Inactive"}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add — Admin/Manager only */}
          {isAdmin && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsAddMode(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-black rounded-xl bg-cyan-500 text-black hover:bg-cyan-400 transition-colors whitespace-nowrap shadow-[0_0_20px_rgba(34,211,238,0.4)] uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            {t("venues.addVenue")}
          </motion.button>
          )}
        </div>
      </motion.div>

      {/* Grid */}
      <div className="mt-2">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[220px] rounded-3xl glass-panel animate-pulse border border-white/5" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-8 text-center glass-panel border border-rose-500/30 rounded-3xl">
            <p className="text-rose-400 font-bold uppercase tracking-widest text-sm">Failed to load venues. Please refresh.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 glass-panel rounded-3xl border border-dashed border-white/10 text-center">
            <Map className="w-12 h-12 text-slate-600 mb-5 opacity-30" />
            {search || filterActive !== "all" ? (
              <>
                <h3 className="text-slate-300 font-black uppercase tracking-widest mb-2 text-sm">{t("venues.noMatchSearch")}</h3>
                <button onClick={() => { setSearch(""); setFilterActive("all"); }} className="text-cyan-400 text-sm font-bold hover:underline mt-2 uppercase tracking-widest">
                  {t("venues.clearFilters")}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-slate-300 font-black uppercase tracking-widest mb-2 text-sm">{t("venues.noVenues")}</h3>
                <p className="text-slate-500 text-sm">{t("venues.noVenuesHint")}</p>
              </>
            )}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
          >
            {filtered.map((venue: Venue) => (
              <motion.div
                key={venue.id}
                variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                className="relative group/wrap"
              >
                <VenueCard venue={venue} />
                {isAdmin && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(venue); }}
                  disabled={deletingId === venue.id}
                  title="Delete venue"
                  className="absolute -top-2 -right-2 opacity-0 group-hover/wrap:opacity-100 transition-opacity p-2 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 border border-rose-500/50 disabled:opacity-50 z-10 backdrop-blur-md shadow-[0_0_10px_rgba(244,63,94,0.3)]"
                >
                  {deletingId === venue.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AddVenueModal isOpen={isAddMode} onClose={() => { setIsAddMode(false); queryClient.invalidateQueries({ queryKey: ["venues"] }); }} />
    </div>
  );
}
