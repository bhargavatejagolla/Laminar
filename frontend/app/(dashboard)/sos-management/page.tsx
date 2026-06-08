"use client";

import React, { useState } from 'react';
import { ShieldAlert, MapPin, CheckCircle, XCircle, Clock, AlertTriangle, ChevronRight, User } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';

interface SOSReport {
    id: string;
    tracking_id: string;
    reporter_name: string;
    reporter_contact: string;
    missing_name: string;
    last_seen_location: string;
    image_url: string | null;
    match_found: boolean;
    camera_location: string | null;
    status: 'OPEN' | 'RESOLVED' | 'FALSE_ALARM';
    created_at: string;
}

import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";

export default function SOSManagementPage() {
  const { t } = useTranslation();

    const router = useRouter();
    const queryClient = useQueryClient();
    const [selectedReport, setSelectedReport] = useState<SOSReport | null>(null);

    const { data: reports = [], isLoading } = useQuery<SOSReport[]>({
        queryKey: ['sos_reports'],
        queryFn: async () => {
            const res = await api.get('/sos/report');
            return res.data;
        },
        refetchInterval: 10000 // Poll every 10s to ensure real-time update backup
    });

    const updateStatus = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            const formData = new FormData();
            formData.append("status", status);
            return api.patch(`/sos/report/${id}/status`, formData);
        },
        onSuccess: () => {
            toast.success("SOS Report status updated");
            queryClient.invalidateQueries({ queryKey: ['sos_reports'] });
            setSelectedReport(null);
        },
        onError: () => {
            toast.error("Failed to update status. Check permissions.");
        }
    });

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'OPEN': return 'text-rose-500 bg-rose-500/10 border-rose-500/30';
            case 'RESOLVED': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30';
            case 'FALSE_ALARM': return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
            default: return 'text-slate-400';
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto h-[calc(100vh-4rem)] flex flex-col relative">
            <header className="mb-6 flex items-center justify-between relative z-10">
                <div>
                    <button 
                        onClick={() => router.push("/sentinel-command")}
                        className="mb-4 flex items-center gap-2 text-slate-400 hover:text-slate-300 uppercase tracking-widest text-xs font-bold transition-colors"
                    >
                        <ChevronRight className="w-4 h-4 rotate-180" />
                        {t("auto.BacktoCommand_4755") || "Back to Command"}
                    </button>
                    <h1 className="text-2xl font-black uppercase tracking-widest text-slate-100 flex items-center gap-3">
                        <ShieldAlert className="w-6 h-6 text-rose-500" />
                        {t("auto.SOSCrisisManage_2417") || "SOS Crisis Management"}
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">{t("auto.Managetriageand_4267") || "Manage, triage, and resolve incoming public SOS reports."}</p>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
                {/* Master List */}
                <div className="lg:col-span-2 bg-[#0a0a0a] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-800 bg-[#111] flex items-center justify-between">
                        <span className="font-bold text-sm uppercase tracking-wider text-slate-300">{t("auto.IncomingReports_7335") || "Incoming Reports"}</span>
                        <span className="text-xs font-mono bg-rose-500/20 text-rose-400 px-2 py-1 rounded">
                            {reports.filter(r => r.status === 'OPEN').length} OPEN
                        </span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
                        {isLoading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-rose-500 animate-spin" />
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-20 text-slate-500 flex flex-col items-center">
                                <CheckCircle className="w-12 h-12 mb-3 opacity-20" />
                                <p>{t("auto.NoSOSReportslog_8209") || "No SOS Reports logged."}</p>
                            </div>
                        ) : reports.map(report => (
                            <div 
                                key={report.id}
                                onClick={() => setSelectedReport(report)}
                                className={`p-4 rounded-xl border transition-all cursor-pointer flex gap-4 ${
                                    selectedReport?.id === report.id 
                                        ? 'bg-rose-950/20 border-rose-500/50' 
                                        : 'bg-[#111] border-slate-800 hover:border-slate-700'
                                }`}
                            >
                                <div className="w-16 h-16 shrink-0 bg-black border border-slate-800 rounded-lg flex items-center justify-center overflow-hidden">
                                    {report.image_url ? (
                                        <img src={`http://localhost:8000${report.image_url}`} alt="Missing" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-6 h-6 text-slate-700" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="font-bold text-slate-200 truncate">{report.missing_name}</h3>
                                        <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider border ${getStatusColor(report.status)}`}>
                                            {report.status}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 flex items-center gap-1.5 truncate">
                                        <MapPin className="w-3 h-3" />
                                        Last seen: {report.last_seen_location}
                                    </p>
                                    <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500 font-mono uppercase">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDistanceToNow(new Date(report.created_at), { addSuffix: true })}
                                        </span>
                                        <span>ID: {report.tracking_id}</span>
                                        {report.match_found && (
                                            <span className="text-rose-400 font-bold">{t("auto.AIMATCHED_3301") || "AI MATCHED"}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Detail View */}
                <div className="bg-[#0a0a0a] border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-800 bg-[#111]">
                        <span className="font-bold text-sm uppercase tracking-wider text-slate-300">{t("auto.TriageAction_4796") || "Triage Action"}</span>
                    </div>
                    
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                        {!selectedReport ? (
                            <div className="text-center py-20 text-slate-500">
                                <p>{t("auto.Selectareportto_1167") || "Select a report to manage."}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full">
                                <div className="mb-6 pb-6 border-b border-slate-800">
                                    <div className="flex items-center gap-2 text-rose-500 mb-2">
                                        <ShieldAlert className="w-5 h-5" />
                                        <h2 className="font-black text-lg tracking-wide uppercase">{t("auto.ReportDetails_7504") || "Report Details"}</h2>
                                    </div>
                                    <p className="text-xs text-slate-400 font-mono">ID: {selectedReport.tracking_id}</p>
                                </div>
                                
                                <div className="space-y-6 flex-1">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">{t("auto.MissingPerson_5227") || "Missing Person"}</label>
                                        <div className="flex items-center gap-4 mt-2">
                                            <div className="w-16 h-16 rounded-xl border border-slate-700 bg-black overflow-hidden flex shrink-0">
                                                {selectedReport.image_url ? (
                                                    <img src={`http://localhost:8000${selectedReport.image_url}`} alt="Missing" className="w-full h-full object-cover" />
                                                ) : (
                                                    <User className="w-6 h-6 text-slate-700 m-auto" />
                                                )}
                                            </div>
                                            <div className="text-slate-200 font-black text-2xl uppercase tracking-wider">{selectedReport.missing_name}</div>
                                        </div>
                                    </div>
                                    
                                    <div className="p-3 rounded-lg bg-[#111] border border-slate-800">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">{t("auto.ReporterDetails_3882") || "Reporter Details"}</label>
                                        <div className="flex items-center gap-2 text-sm text-slate-300 mb-1">
                                            <User className="w-4 h-4 text-slate-500" />
                                            {selectedReport.reporter_name}
                                        </div>
                                        <div className="text-slate-400 text-xs ml-6">
                                            {selectedReport.reporter_contact}
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">{t("auto.LastSeenLocatio_6852") || "Last Seen Location"}</label>
                                        <div className="text-slate-300 flex items-start gap-2">
                                            <MapPin className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                                            <span>{selectedReport.last_seen_location}</span>
                                        </div>
                                    </div>
                                    
                                    {selectedReport.match_found && (
                                        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30">
                                            <label className="text-[10px] font-bold text-rose-500 uppercase tracking-widest block mb-1">{t("auto.AIDetection_6583") || "AI Detection"}</label>
                                            <div className="text-rose-400 text-sm font-medium">
                                                Match acquired in: {selectedReport.camera_location}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="mt-8 pt-6 border-t border-slate-800">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-3">{t("auto.ResolutionStatu_4494") || "Resolution Status"}</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {selectedReport.status !== 'OPEN' && (
                                            <button 
                                                onClick={() => updateStatus.mutate({ id: selectedReport.id, status: 'OPEN' })}
                                                className="w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 transition-all"
                                            >
                                                {t("auto.REOPENCASE_4080") || "RE-OPEN CASE"}
                                            </button>
                                        )}
                                        {selectedReport.status === 'OPEN' && (
                                            <>
                                                <button 
                                                    onClick={() => updateStatus.mutate({ id: selectedReport.id, status: 'RESOLVED' })}
                                                    className="w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                    {t("auto.MarkasResolved_396") || "Mark as Resolved"}
                                                </button>
                                                <button 
                                                    onClick={() => updateStatus.mutate({ id: selectedReport.id, status: 'FALSE_ALARM' })}
                                                    className="w-full py-3 rounded-lg font-bold text-xs uppercase tracking-wider text-slate-400 bg-slate-800 hover:bg-slate-700 transition-all flex items-center justify-center gap-2"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    {t("auto.MarkasFalseAlar_956") || "Mark as False Alarm"}
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
