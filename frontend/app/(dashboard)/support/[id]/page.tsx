"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/services/api";
import { Send, ArrowLeft, UserCircle2, Clock, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useParams, useRouter } from "next/navigation";

export default function TicketDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user, isSuperAdmin, isAdmin } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/tickets/${id}`);
      setTicket(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404 || e?.response?.status === 403) {
        router.push("/support");
      }
      console.error("Error fetching ticket", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchTicketDetails();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [ticket?.messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      const res = await api.post(`/tickets/${id}/messages`, { message: newMessage });
      setTicket((prev: any) => ({
        ...prev,
        messages: [...prev.messages, res.data],
        status: "open",
      }));
      setNewMessage("");
    } catch (err) {
      console.error("Failed to send message", err);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = ticket.status === "open" ? "closed" : "open";
    try {
      const res = await api.patch(`/tickets/${id}/status`, { status: newStatus });
      setTicket((prev: any) => ({ ...prev, status: res.data.status }));
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-screen">
        <div className="text-slate-400 animate-pulse flex items-center gap-2">
          <Clock className="w-5 h-5 animate-spin" />
          Loading ticket details...
        </div>
      </div>
    );
  }

  if (!ticket) return null;

  return (
    <div className="p-8 max-w-4xl mx-auto min-h-screen flex flex-col">
      <Link href="/support" className="inline-flex items-center gap-2 text-slate-400 hover:text-cyan-400 transition-colors mb-6 group w-max">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to Support
      </Link>

      {/* Ticket Header */}
      <div className="bg-[#0f1219] border border-white/10 rounded-t-xl p-6 shadow-md relative overflow-hidden backdrop-blur-md">
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2 font-heading tracking-wide">{ticket.title}</h1>
            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <UserCircle2 className="w-4 h-4 text-cyan-500/70" />
                {ticket.creator_email || "User"}
              </span>
              <span>•</span>
              <span>{format(new Date(ticket.created_at), "MMM d, yyyy HH:mm")}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider ${
              ticket.status === 'open'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
            }`}>
              {ticket.status === 'open' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              {ticket.status}
            </span>

            {(isAdmin || isSuperAdmin || ticket.creator_id === user?.id) && (
              <button
                onClick={handleToggleStatus}
                className="bg-white/5 hover:bg-white/10 text-slate-300 font-medium px-4 py-1.5 rounded border border-white/10 transition-colors text-sm"
              >
                {ticket.status === "open" ? "Close Ticket" : "Reopen Ticket"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 p-4 bg-black/40 rounded-lg border border-white/5 text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
          {ticket.description}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-[#0a0c10] border-x border-white/5 p-6 flex flex-col gap-6 overflow-y-auto min-h-[400px]">
        {ticket.messages?.length === 0 ? (
          <div className="m-auto text-slate-500 italic text-sm text-center">
            No replies yet. Send a message to start the conversation.
          </div>
        ) : (
          ticket.messages?.map((msg: any) => {
            const isMe = msg.sender_id === user?.id;
            const isAgent = msg.sender_role === "super_admin" || msg.sender_role === "admin";

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl p-4 ${
                  isMe
                    ? "bg-cyan-600/20 border border-cyan-500/30 text-cyan-50 rounded-br-none"
                    : isAgent
                      ? "bg-rose-500/10 border border-rose-500/20 text-rose-50 rounded-bl-none"
                      : "bg-white/5 border border-white/10 text-slate-300 rounded-bl-none"
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      isMe ? "text-cyan-400" : isAgent ? "text-rose-400" : "text-slate-500"
                    }`}>
                      {msg.sender_email || "Unknown"} {isMe ? "(You)" : isAgent ? "(Support)" : ""}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {format(new Date(msg.created_at), "HH:mm")}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.message}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply Input */}
      <div className="bg-[#0f1219] border border-white/10 rounded-b-xl p-4 shadow-md backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="flex gap-4">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            placeholder={ticket.status === 'closed' ? "Reply to reopen ticket..." : "Type your reply..."}
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white outline-none focus:border-cyan-500/50 transition-colors h-14 resize-none"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(34,211,238,0.2)]"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[10px] text-slate-500 mt-2 text-center">Press Enter to send, Shift+Enter for new line.</p>
      </div>
    </div>
  );
}
