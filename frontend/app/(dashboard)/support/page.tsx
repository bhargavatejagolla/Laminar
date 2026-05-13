"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/services/api";
import { Plus, MessageSquare, CheckCircle, Clock, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

export default function SupportTicketsPage() {
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [error, setError] = useState("");

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await api.get("/tickets");
      setTickets(res.data);
    } catch (e) {
      console.error("Error fetching tickets", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/tickets", { title: newTitle, description: newDesc });
      setShowNewTicketModal(false);
      setNewTitle("");
      setNewDesc("");
      fetchTickets();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to create ticket. Please try again.");
      console.error("Failed to create ticket", err);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors mb-6 group w-max">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Dashboard
      </Link>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 font-heading">
            Support Headquarters
          </h1>
          <p className="text-slate-400">
            {isAdmin || isSuperAdmin
              ? "Manage and respond to user issues and tickets from across the platform."
              : "Need help? Create a ticket and the administration team will get back to you."}
          </p>
        </div>

        <button
          onClick={() => setShowNewTicketModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)]"
        >
          <Plus className="w-4 h-4" />
          <span>New Ticket</span>
        </button>
      </div>

      <div className="bg-[#0f1219] border border-white/10 rounded-xl shadow-xl overflow-hidden backdrop-blur-md">
        {loading ? (
          <div className="p-8 text-center text-slate-400 animate-pulse">Loading tickets...</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-cyan-900/40 flex items-center justify-center border border-cyan-500/30 mb-4">
              <MessageSquare className="w-8 h-8 text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">No Tickets Found</h3>
            <p className="text-slate-500 max-w-sm mt-2">
              You haven't opened any support requests yet. Everything looks good!
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                <th className="px-6 py-4">Title</th>
                <th className="px-6 py-4">Creator</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <Link href={`/support/${ticket.id}`} className="text-cyan-400 hover:text-cyan-300 font-medium tracking-wide">
                      {ticket.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {ticket.creator_email || "Anonymous"}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wider ${
                      ticket.status === 'open'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {ticket.status === 'open' ? <Clock className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-xs text-slate-500 font-mono">
                    {format(new Date(ticket.created_at), "MMM d, yyyy HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New Ticket Modal */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#0f1219] w-full max-w-md border border-white/10 rounded-xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-white mb-6">Create Support Ticket</h2>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Subject / Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-cyan-500/50 transition-colors"
                  placeholder="e.g. Issue viewing CCTV stream"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Description</label>
                <textarea
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2.5 text-white outline-none focus:border-cyan-500/50 transition-colors h-32 resize-none"
                  placeholder="Please describe the issue in detail..."
                />
              </div>

              {error && (
                <p className="text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowNewTicketModal(false); setError(""); }}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-6 py-2 rounded-lg transition-colors shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
