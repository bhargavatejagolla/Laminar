"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMap, Tooltip, Popup, useMapEvents, LayersControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Search, Loader2, Target, MapPin, Activity, Info, X, Globe, Zap, Filter, Maximize2, Minimize2, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";

// Types
interface POI {
  id: string;
  lat: number;
  lon: number;
  name: string;
  type: string;
  details?: any;
}

interface IntelligenceMapCoreProps {
  venues?: any[];
}

// Map Controller for FlyTo effects with safety guards
const MapController = ({ center, zoom = 14 }: { center: [number, number]; zoom?: number }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();
    const latDiff = Math.abs(currentCenter.lat - center[0]);
    const lngDiff = Math.abs(currentCenter.lng - center[1]);

    if (latDiff > 0.0001 || lngDiff > 0.0001 || currentZoom !== zoom) {
      let isMounted = true;
      map.flyTo(center, zoom, { duration: 1.5 });

      const triggerResize = () => {
        if (!isMounted || !map.getContainer()) return;
        map.invalidateSize();
      };

      const t1 = setTimeout(triggerResize, 100);
      const t2 = setTimeout(triggerResize, 500);

      return () => {
        isMounted = false;
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [center[0], center[1], zoom, map]);
  return null;
};

// Map Events listener moved outside to prevent recreation on render
const MapEvents = ({ setPosition, setZoom }: { setPosition: (p: [number, number]) => void; setZoom: (z: number) => void }) => {
  useMapEvents({
    moveend: (e) => {
      const center = e.target.getCenter();
      setPosition([center.lat, center.lng]);
      setZoom(e.target.getZoom());
    },
  });
  return null;
};

// Custom Glowing Marker Icon Generator
const createGlowingIcon = (color: string) => {
  const html = `
    <div class="intelligence-marker" style="color: ${color}">
      <div class="marker-glow"></div>
      <div class="marker-core"></div>
    </div>
  `;
  return new L.DivIcon({
    className: "custom-glowing-icon",
    html,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const CATEGORIES = [
  { id: "temple", label: "Temples", query: 'nwr["amenity"="place_of_worship"]', color: "#A855F7" },
  { id: "stadium", label: "Stadiums", query: 'nwr["leisure"="stadium"]', color: "#3B82F6" },
  { id: "hospital", label: "Hospitals", query: 'nwr["amenity"="hospital"]', color: "#EF4444" },
  { id: "mall", label: "Malls", query: 'nwr["shop"="mall"]', color: "#EC4899" },
  { id: "crowd", label: "Crowd Zones", query: 'nwr["leisure"="park"]', color: "#10B981" },
];

export default function IntelligenceMapCore({ venues = [] }: IntelligenceMapCoreProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const getRiskDisplay = (score: number) => {
    if (score >= 75) return { label: "CRITICAL", color: "#EF4444", bg: "bg-red-500" };
    if (score >= 50) return { label: "HIGH", color: "#F97316", bg: "bg-orange-500" };
    if (score >= 25) return { label: "MEDIUM", color: "#EAB308", bg: "bg-yellow-500" };
    return { label: "LOW", color: "#10B981", bg: "bg-emerald-500" };
  };

  const [position, setPosition] = useState<[number, number]>([17.3850, 78.4867]);
  const [zoom, setZoom] = useState(13);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [isLoadingPois, setIsLoadingPois] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [stats, setStats] = useState({ totalLocations: 0, activeNodes: venues.length, lastUpdate: "Stable" });

  // Aggressive resize dispatch to ensure Leaflet survives Portal moves
  useEffect(() => {
    const triggerSync = () => {
      window.dispatchEvent(new Event('resize'));
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
    };
    triggerSync();
  }, [isExpanded]);



  const executeSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);

    const queryLower = searchQuery.toLowerCase();

    const venueMatch = venues.find(v =>
      queryLower.includes(v.name.toLowerCase()) ||
      v.name.toLowerCase().includes(queryLower)
    );

    if (venueMatch && venueMatch.latitude && venueMatch.longitude) {
      setPosition([venueMatch.latitude, venueMatch.longitude]);
      setZoom(18);
      setStats(prev => ({ ...prev, lastUpdate: `Located Venue: ${venueMatch.name}` }));
      setIsSearching(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "5",
        lat: position[0].toString(),
        lon: position[1].toString(),
      });

      const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
      const data = await res.json();

      if (data && data.features && data.features.length > 0) {
        // PROFESSIONAL PRECISION: Force Town/City centroid lock
        const best = data.features.find((f: any) =>
          f.properties.osm_value === 'town' ||
          f.properties.osm_value === 'city'
        ) || data.features.find((f: any) =>
          f.properties.osm_value === 'village'
        ) || data.features[0];

        const [lon, lat] = best.geometry.coordinates;
        const newPos: [number, number] = [lat, lon];
        setPosition(newPos);

        let newZoom = 15;
        const props = best.properties;
        if (props.type === 'house' || props.type === 'building') newZoom = 19;
        else if (props.osm_value === 'residential' || props.osm_value === 'service') newZoom = 17;

        setZoom(newZoom);
        setStats(prev => ({ ...prev, lastUpdate: `Sector Located: ${searchQuery}` }));
      }
    } catch (e) {
      console.warn("Search failed:", e);
      setStats(prev => ({ ...prev, lastUpdate: "Search Error" }));
    } finally {
      setIsSearching(false);
    }
  };

  const OVERPASS_INSTANCES = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter"
  ];
  const [instanceIdx, setInstanceIdx] = useState(0);

  const fetchPois = useCallback(async (category: string, mapCoords: [number, number]) => {
    const cat = CATEGORIES.find(c => c.id === category);
    if (!cat) return;

    setIsLoadingPois(true);

    try {
      const offset = 0.08;
      const bbox = `${mapCoords[0] - offset},${mapCoords[1] - offset},${mapCoords[0] + offset},${mapCoords[1] + offset}`;
      const query = `[out:json][timeout:25];(${cat.query}(${bbox}););out center body;`;

      const res = await fetch(`${OVERPASS_INSTANCES[instanceIdx]}?data=${encodeURIComponent(query)}`);
      if (!res.ok) {
        setInstanceIdx((instanceIdx + 1) % OVERPASS_INSTANCES.length);
        return;
      }

      const data = await res.json();
      if (!data.elements) return;

      const newPois = data.elements.map((el: any) => ({
        id: el.id.toString(),
        lat: el.lat || el.center?.lat,
        lon: el.lon || el.center?.lon,
        name: el.tags?.name || el.tags?.["name:en"] || `${cat.label} Node`,
        type: category,
        details: el.tags
      })).filter((p: any) => p.lat && p.lon);

      setPois(newPois);
      setStats(prev => ({ ...prev, totalLocations: newPois.length, lastUpdate: `Scanned ${newPois.length} ${cat.label}` }));
    } catch (e) {
      setInstanceIdx((prev) => (prev + 1) % OVERPASS_INSTANCES.length);
    } finally {
      setIsLoadingPois(false);
    }
  }, [instanceIdx]);

  useEffect(() => {
    if (selectedCategory) fetchPois(selectedCategory, position);
    else setPois([]);
  }, [selectedCategory, fetchPois]);

  const getColor = (type: string) => CATEGORIES.find(c => c.id === type)?.color || "#22d3ee";

  const mapLayers = {
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    satellite: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    traffic: "https://mt1.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}"
  };

  const mapContent = (
    <div className={`relative bg-[#020617] overflow-hidden ${isExpanded ? 'fixed inset-0 z-[10000] w-screen h-screen' : 'h-screen w-full'}`}>

      {/* ── TOP HUD ── */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[11000] w-full max-w-2xl px-4 flex flex-col gap-4">
        <div className="glass-hud-panel rounded-full p-2 pl-6 flex items-center gap-4 border border-white/10 shadow-2xl">
          <Search className="w-5 h-5 text-cyan-400" />
          <input
            type="text"
            placeholder={t("map.search_placeholder") || "Search intelligence sector..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeSearch()}
            className="bg-transparent border-none outline-none text-white text-sm flex-1 placeholder:text-slate-500 font-medium"
          />
          <div className="flex items-center gap-2 pr-2">
            <button
              onClick={executeSearch}
              className="bg-cyan-500 hover:bg-cyan-400 text-black px-4 py-2 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-[0_0_20px_rgba(34,211,238,0.4)] flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              {t("auto.Execute_7052") || "Execute"}
            </button>
          </div>
        </div>

        <div className="flex justify-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
              className={`px-4 py-1.5 rounded-full text-[10px] uppercase font-black tracking-widest transition-all border flex items-center gap-2 backdrop-blur-md whitespace-nowrap
                ${selectedCategory === cat.id
                  ? 'bg-white text-black border-white'
                  : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'}`}
            >
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }}></div>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="absolute right-6 top-32 bottom-24 w-72 z-[11000] glass-hud-panel border border-white/10 p-6 rounded-3xl flex flex-col gap-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                <h3 className="text-xs font-black text-white uppercase tracking-widest">{t("auto.TacticalIntel_6129") || "Tactical Intel"}</h3>
              </div>
              <Globe className="w-4 h-4 text-slate-500" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <span className="text-[8px] uppercase font-bold text-slate-500 block mb-1">{t("auto.Detected_217") || "Detected"}</span>
                <span className="text-2xl font-mono font-black text-white">{pois.length}</span>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                <span className="text-[8px] uppercase font-bold text-slate-500 block mb-1">{t("auto.ActiveNodes_6260") || "Active Nodes"}</span>
                <span className="text-2xl font-mono font-black text-cyan-400">{venues.length}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 font-medium">
              {pois.slice(0, 20).map(p => (
                <div
                  key={p.id}
                  onClick={() => setPosition([p.lat, p.lon])}
                  className="bg-black/40 border border-white/5 hover:border-cyan-500/30 rounded-xl p-3 cursor-pointer transition-all group"
                >
                  <p className="text-xs font-bold text-white truncate group-hover:text-cyan-400 uppercase tracking-tight">{p.name}</p>
                  <span className="text-[9px] text-slate-500 uppercase font-mono">{p.type}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 text-[9px] font-mono text-slate-500 uppercase flex items-center justify-between">
              <span className="truncate pr-2">Status: {stats.lastUpdate}</span>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 animate-pulse ${isLoadingPois ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <MapContainer
        key={isExpanded ? 'expanded' : 'collapsed'}
        center={position}
        zoom={zoom}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <MapController center={position} zoom={zoom} />
        <MapEvents setPosition={setPosition} setZoom={setZoom} />

        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name="Dark">
            <TileLayer url={mapLayers.dark} maxZoom={20} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Satellite">
            <TileLayer url={mapLayers.satellite} maxZoom={20} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Traffic">
            <TileLayer url={mapLayers.traffic} maxZoom={20} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {pois.map(p => (
          <Marker
            key={p.id}
            position={[p.lat, p.lon]}
            icon={createGlowingIcon(getColor(p.type))}
          >
            <Tooltip direction="top" offset={[0, -10]} className="custom-intel-tooltip">
              <span className="text-[10px] font-black uppercase tracking-widest">{p.name}</span>
            </Tooltip>
          </Marker>
        ))}

        {venues.map(v => {
          if (!v.latitude || !v.longitude) return null;

          const capacity = v.capacity || 100;
          const current = v.current_occupancy || 0;
          const densityPct = current / Math.max(capacity, 1);
          const densityLabel = densityPct > 0.85 ? 'HIGH' : densityPct > 0.5 ? 'MEDIUM' : 'LOW';

          const hashId = v.id ? v.id.charCodeAt(0) + v.id.charCodeAt(v.id.length - 1) : 0;
          const predictedMins = Math.max(1, 15 - Math.floor(densityPct * 10) + (hashId % 5));
          const noiseSpike = `+${20 + (hashId % 30) + Math.floor(densityPct * 15)}%`;

          let suggestedAction = "Maintain standard monitoring";
          if (densityPct > 0.85 || v.current_risk >= 75) suggestedAction = "→ Deploy rapid response teams";
          else if (densityPct > 0.6 || v.current_risk >= 50) suggestedAction = "→ Redirect flow & Open auxiliary exits";

          return (
            <Marker
              key={v.id}
              position={[v.latitude, v.longitude]}
              icon={createGlowingIcon(getRiskDisplay(v.current_risk || 0).color)}
            >
              <Tooltip direction="top" className="custom-intel-tooltip border-0 bg-transparent shadow-none" offset={[0, -15]} opacity={1}>
                <div className="p-3 min-w-[260px] bg-[#020617]/95 backdrop-blur-3xl text-white rounded-xl border border-white/20 shadow-[0_0_40px_rgba(0,0,0,0.95)] custom-intel-tooltip-inner relative overflow-hidden pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>

                  <div className="flex flex-col gap-1.5 relative z-10 text-left">
                    <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
                      <h4 className="font-extrabold text-white text-[12px] tracking-widest uppercase drop-shadow-md truncate pr-3">{v.name}</h4>
                      <div className={`px-2 py-0.5 rounded text-[8px] font-black text-black tracking-widest shadow-lg ${getRiskDisplay(v.current_risk || 0).bg}`}>
                        {getRiskDisplay(v.current_risk || 0).label}
                      </div>
                    </div>

                    {/* Telemetry/GPS */}
                    <div className="flex items-center justify-between opacity-80 mb-2">
                      <div className="flex items-center gap-1.5 text-[9px] font-mono text-cyan-400">
                        <MapPin className="w-2.5 h-2.5" />
                        [ {v.latitude.toFixed(4)}, {v.longitude.toFixed(4)} ]
                      </div>
                      <span className="text-[10px] font-mono font-medium text-white flex items-center gap-1 opacity-90">
                        <Activity className="w-2.5 h-2.5 text-cyan-400" />
                        {Math.round(v.avg_velocity || 0)} px/s
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-1 bg-black/40 rounded-lg p-2 border border-white/5">
                      <div>
                        <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold block mb-0.5">{t("auto.CrowdDensity_9092") || "Crowd Density"}</span>
                        <span className={`text-[10px] font-mono font-black tracking-wider ${densityPct > 0.8 ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]' : densityPct > 0.5 ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]' : 'text-emerald-400'}`}>{densityLabel}</span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold block mb-0.5">{t("auto.VolumeCount_7") || "Volume Count"}</span>
                        <span className="text-[10px] font-mono font-bold text-white">{Math.round(current)} <span className="text-[9px] text-slate-500 font-normal">/ {capacity}</span></span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold block mb-0.5">{t("auto.PredictedCong_8759") || "Predicted Cong."}</span>
                        <span className="text-[10px] font-mono font-bold text-orange-400">~{predictedMins} mins</span>
                      </div>
                      <div>
                        <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold block mb-0.5">{t("auto.ActivitySpike_6078") || "Activity Spike"}</span>
                        <span className="text-[10px] font-mono font-bold text-fuchsia-400">Noise {noiseSpike}</span>
                      </div>
                    </div>

                    <div className="mt-2 flex gap-1 justify-between">
                      {[5, 15, 30].map(m => {
                        const flow = (v.avg_velocity || 0) * 0.5;
                        const pCount = Math.floor(Math.max(0, current + (flow * m) + ((hashId % 5))));
                        const pDen = pCount / Math.max(capacity, 1);
                        const c = pDen > 0.85 ? 'text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]' : pDen > 0.6 ? 'text-amber-400' : 'text-emerald-400';
                        return (
                          <div key={m} className="bg-white/5 rounded px-2 py-1 flex-1 text-center border border-white/10 shadow-[inset_0_0_5px_rgba(255,255,255,0.02)]">
                            <span className="text-[7px] text-slate-400 uppercase tracking-widest block font-black mb-0.5">+{m} MIN</span>
                            <span className={`text-[10px] font-mono font-black ${c}`}>{Math.round((pDen > 1 ? 1 : pDen) * 100)}%</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-white/10 -mx-3 px-3 pb-0.5">
                      <span className="text-[8px] uppercase tracking-widest text-slate-500 font-black flex items-center gap-1.5 mb-1">
                        <Zap className="w-3 h-3 text-amber-500" />
                        {t("auto.SuggestedAction_6207") || "Suggested Action"}
                      </span>
                      <span className={`text-[10px] font-black uppercase leading-snug block tracking-wide ${densityPct > 0.85 || v.current_risk >= 75 ? 'text-red-300' : 'text-emerald-300'}`}>
                        {suggestedAction}
                      </span>
                    </div>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute bottom-6 right-6 z-[11000] bg-black/60 hover:bg-cyan-600 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white transition-all shadow-2xl group"
      >
        {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
      </button>

      <div className="absolute inset-0 pointer-events-none z-10 bg-[linear-gradient(rgba(34,211,238,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.02)_1px,transparent_1px)] bg-[size:100px_100px]"></div>
      <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_150px_rgba(0,0,0,0.8)]"></div>
    </div>
  );

  return typeof document !== "undefined" && isExpanded ? createPortal(mapContent, document.body) : mapContent;
}
