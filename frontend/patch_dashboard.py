import re
import sys

path = 'components/smart-city/SmartSectionDashboard.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = re.sub(
    r'import \{ useParkingInsights, useTrafficInsights \} from "@/hooks/useTelemetry";',
    'import { useParkingInsights, useTrafficInsights, useKineticInsights, useKineticEvents } from "@/hooks/useTelemetry";',
    content
)
content = re.sub(
    r'import \{ ArrowLeft.*?\} from "lucide-react";',
    'import { ArrowLeft, Car, AlertTriangle, Zap, Activity, BrainCircuit, Users, Upload, Thermometer, Video, FileText, Download, Globe, RotateCw, ShieldCheck, Shield, X } from "lucide-react";',
    content
)

# 2. Add State Variables
if 'activeKineticCameraId' not in content:
    state_vars = """
  const [activeKineticCameraId, setActiveKineticCameraId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const kineticEventsHook = useKineticEvents();"""
    content = re.sub(
        r'(const \[occupancyHistory, setOccupancyHistory\] = useState<number\[\]>\(Array\(20\)\.fill\(0\)\);)',
        r'\1\n' + state_vars,
        content
    )

# 3. Add Inject Kinetic Media & Clear Media buttons
if 'Inject Kinetic Media' not in content:
    inject_block = """
          {sectionType === "kinetic" && (
            <>
              {/* Inject AI Media — Kinetic */}
              <label className={`cursor-pointer px-4 py-2.5 rounded-2xl flex items-center gap-3 backdrop-blur-md border ${theme.borderClass} ${theme.glowClass} ${theme.textClass} hover:bg-white/5 transition-all shadow-lg`}>
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase mt-0.5">Inject Kinetic Media</span>
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  const camId = activeKineticCameraId || cameras[0]?.id;
                  if (!camId) {
                    toast.error("No active camera node detected for injection.");
                    return;
                  }

                  const uploadFile = async (file: File) => {
                    const formData = new FormData();
                    formData.append("file", file);
                    return api.post(`/kinetic/upload?camera_id=${camId}`, formData, {
                      headers: { "Content-Type": "multipart/form-data" }
                    });
                  };

                  if (files.length === 1) {
                    const lt = toast.loading("Injecting kinetic media...");
                    try {
                      await uploadFile(files[0]);
                      toast.success("Kinetic analysis started.", { id: lt });
                    } catch { toast.error("Injection failed.", { id: lt }); }
                  }
                }} />
              </label>
              
              {/* Clear Kinetic Media */}
              <button 
                onClick={async () => {
                  const camId = activeKineticCameraId || cameras[0]?.id;
                  if (!camId) return;
                  const lt = toast.loading("Clearing injected media...");
                  try {
                    await api.post(`/kinetic/clear-media/${camId}`);
                    toast.success("Live feed resumed.", { id: lt });
                  } catch { toast.error("Failed to clear media.", { id: lt }); }
                }} 
                className={`px-4 py-2.5 rounded-2xl flex items-center gap-2 backdrop-blur-md border ${theme.borderClass} text-slate-400 hover:bg-white/5 transition-all shadow-lg text-[10px] font-mono font-black tracking-[0.2em] uppercase`}
              >
                <X className="w-4 h-4" />
                <span className="mt-0.5">Clear Media</span>
              </button>
            </>
          )}
"""
    content = re.sub(
        r'(<div className={`px-5 py-2\.5 rounded-2xl flex items-center gap-3 backdrop-blur-md border \$\{theme\.headerBadge\}`}>\s*<div className={`w-2\.5 h-2\.5 rounded-full animate-pulse \$\{theme\.headerBadgeDot\}`})',
        inject_block.replace('$', '\\$') + r'\1',
        content
    )

# 4. Add select camera UI for Kinetic
if 'activeKineticCameraId)' not in content:
    select_cam_block = """
          {sectionType === 'kinetic' && cameras.length > 0 && (
            <div className="col-span-full mb-2 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest font-mono">Select Camera</span>
                <select 
                  className={`bg-black/50 border ${theme.borderClass} ${theme.textClass} text-xs font-mono rounded-xl px-4 py-2 outline-none focus:border-${theme.primary}-500/50 transition-colors`}
                  value={activeKineticCameraId || ''}
                  onChange={(e) => setActiveKineticCameraId(e.target.value)}
                >
                  {cameras.map(cam => (
                    <option key={cam.id} value={cam.id}>{cam.name} (Live Node)</option>
                  ))}
                </select>
              </div>
              <button 
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`px-4 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest border ${theme.borderClass} ${theme.textClass} hover:bg-white/5 transition-all`}
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
              </button>
            </div>
          )}
"""
    replace_cameras = """          {sectionType !== 'hub' && cameras.map(cam => {
            if (sectionType === 'kinetic' && cam.id !== activeKineticCameraId) return null;
            return (
              <motion.div key={cam.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className={isFullscreen ? 'fixed inset-0 z-50 bg-[#0a0a10] p-8' : ''}>
                {isFullscreen && (
                  <button 
                    onClick={() => setIsFullscreen(false)}
                    className="absolute top-12 right-12 z-50 bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-rose-500/20"
                  >
                    Close Fullscreen
                  </button>
                )}
                <CameraFeedCard camera={cam} sectionType={sectionType} insights={currentInsights} showHeatmap={showHeatmap} />
              </motion.div>
            )
          })}"""
    old_loop_pattern = r"\{\s*sectionType !== 'hub' && cameras\.map\(cam => \(\s*<motion\.div[^>]*>\s*<CameraFeedCard[^>]*/>\s*</motion\.div>\s*\)\)\s*\}"
    content = re.sub(old_loop_pattern, select_cam_block.replace('$', '\\$') + '\n' + replace_cameras.replace('$', '\\$'), content, flags=re.DOTALL)

# 6. Hide generic panels and insert Kinetic panel
if '{sectionType !== "kinetic" && (' not in content:
    # Infrastructure Load
    content = re.sub(
        r'(<div className={`bg-gradient-to-br \$\{theme\.bgClass\} \$\{theme\.borderClass\} border rounded-3xl p-6 relative overflow-hidden backdrop-blur-md shadow-2xl`}>)',
        r'{sectionType !== "kinetic" && (\n\1',
        content
    )
    # Close Infrastructure Load
    target_close_inf = r'(<p className={`text-xl font-black font-mono leading-none \$\{theme\.textSecondary\}`}>\{cameras\.length\}</p>\s*</div>\s*</div>\s*</div>)'
    content = re.sub(target_close_inf, r'\1\n          )}', content)

if 'Kinetic Intelligence Panel' not in content:
    kinetic_panel = """
          {/* Kinetic Intelligence Panel */}
          {sectionType === "kinetic" && (
            <div className={`bg-[#12121a]/80 backdrop-blur-xl border ${theme.borderClass} rounded-3xl p-6 relative shadow-[0_0_40px_rgba(99,102,241,0.03)] border-t-${theme.primary}-500/40`}>
              <div className="flex items-center justify-between mb-4">
                <p className={`${theme.textClass} font-bold text-[10px] uppercase tracking-[0.3em] font-mono`}>Kinetic Intelligence</p>
                {(() => {
                  const risk = currentInsights?.risk_level || "LOW";
                  const col = risk === "CRITICAL" ? 'text-red-400 bg-red-500/10 border-red-500/30' : 
                              risk === "HIGH" ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' : 
                              risk === "MEDIUM" ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30' : 
                              'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
                  return <span className={`text-[9px] font-mono font-black px-2 py-1 rounded-full border ${col}`}>{risk} RISK</span>;
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-[9px] text-slate-500 uppercase font-mono mb-1">Active Subjects</p>
                  <p className="text-xl font-black font-mono text-white">{currentInsights?.active_subjects ?? 0}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-[9px] text-slate-500 uppercase font-mono mb-1">Anomalies Detected</p>
                  <p className={`text-xl font-black font-mono ${currentInsights?.anomalies_detected > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                    {currentInsights?.anomalies_detected ?? 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <p className={`${theme.textClass} font-bold text-[10px] uppercase tracking-[0.3em] font-mono`}>Kinetic Alert Stream</p>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${theme.pulseSecondary}`} />
                  <span className={`text-[9px] ${theme.textClass}/70 font-mono`}>LIVE</span>
                </div>
              </div>
              
              {(!kineticEventsHook.events || kineticEventsHook.events.length === 0) ? (
                <p className="text-slate-600 text-xs font-mono text-center py-4">System nominal. No abnormal kinetic signatures.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {kineticEventsHook.events.slice(0, 20).map((ev: any, i: number) => {
                    const risk = ev.risk_level || "LOW";
                    const isHighRisk = risk === "CRITICAL" || risk === "HIGH";
                    return (
                      <div key={i} className={`flex flex-col gap-1 ${isHighRisk ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/3 border-white/5'} rounded-xl px-3 py-2 transition-colors border`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-mono font-black ${isHighRisk ? 'text-rose-400' : 'text-slate-300'}`}>
                            {ev.type}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            {ev.confidence ? `${ev.confidence}% CONF` : ''}
                          </span>
                        </div>
                        <span className={`text-[9px] ${isHighRisk ? 'text-rose-400/80' : 'text-slate-400'}`}>
                          {ev.message}
                        </span>
                        <span className="text-[8px] text-slate-600 mt-1">
                          {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
"""
    content = re.sub(r'(\{/\* Parking Intelligence Panel \*/\})', kinetic_panel.replace('$', '\\$') + r'\n          \1', content)

# Hide Decision Engine
if 'sectionType !== "kinetic"' not in content.split('Decision Engine')[0][-200:]:
    content = re.sub(
        r'(\{currentInsights && \(\s*<div className="bg-\[#12121a\]/80 backdrop-blur-xl border border-fuchsia-500/20 rounded-3xl p-6 relative shadow-\[0_0_40px_rgba\(217,70,239,0\.03\)\] border-t-fuchsia-500/40">)',
        r'{currentInsights && sectionType !== "kinetic" && (\n            <div className="bg-[#12121a]/80 backdrop-blur-xl border border-fuchsia-500/20 rounded-3xl p-6 relative shadow-[0_0_40px_rgba(217,70,239,0.03)] border-t-fuchsia-500/40">',
        content
    )

# Hide Sync State
if 'System Health Summary' in content and 'sectionType !== "kinetic"' not in content.split('System Health Summary')[1][:100]:
    content = re.sub(
        r'(\{/\* System Health Summary \*/\}\s*<div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">)',
        r'{/* System Health Summary */}\n          {sectionType !== "kinetic" && (\n          <div className="bg-white/5 border border-white/5 rounded-3xl p-6 flex flex-col gap-4">',
        content
    )
    target_close_sync_pattern = r"(<div\s*key=\{i\}\s*className={`flex-1 rounded-t-sm \$\{theme\.barCell\}`}\s*style=\{\{ height: `\$\{Math\.random\(\) \* 80 \+ 20\}%` \}\}\s*/>\s*\)\)}\s*</div>\s*</div>)"
    content = re.sub(target_close_sync_pattern, r'\1\n          )}', content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Patch written!")
