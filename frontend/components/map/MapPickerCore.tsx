"use client";

import { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap, Tooltip, LayersControl } from "react-leaflet";
import { createPortal } from "react-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Search, Loader2, Target, MapPin, Globe, Maximize2, Minimize2, Layers, Check, Navigation } from "lucide-react";
import { useTranslation } from "react-i18next";

// Types
interface MapPickerCoreProps {
  initialLat?: number;
  initialLng?: number;
  onLocationSelect?: (lat: number, lng: number, address: string, city?: string, country?: string) => void;
  fullScreen?: boolean;
  readOnly?: boolean;
  venues?: any[];
}

// Custom Glowing Marker Icon Generator (Matching Intelligence Map)
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

const LocationDragger = ({
  setPosition,
  onLocationSelect
}: {
  setPosition: (pos: [number, number]) => void;
  onLocationSelect?: any;
}) => {
  const map = useMapEvents({
    click(e: any) {
      const { lat, lng } = e.latlng;
      setPosition([lat, lng]);
      handleReverseGeocode(lat, lng);
    },
  });

  const handleReverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
        headers: { "Accept-Language": "en" }
      });
      const data = await res.json();
      if (onLocationSelect && data) {
        let city = data.address.city || data.address.town || data.address.village || data.address.county || "";
        let country = data.address.country || "";
        onLocationSelect(lat, lng, data.display_name, city, country);
      }
    } catch (e) {
      console.error("Reverse geocoding failed", e);
      if (onLocationSelect) onLocationSelect(lat, lng, "Custom Location", "", "");
    }
  };

  return null;
};

const MapController = ({ center, zoom = 15 }: { center: [number, number]; zoom?: number }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;

    let isMounted = true;
    map.flyTo(center, zoom, { duration: 1.5 });
    
    const triggerSync = () => {
      if (!isMounted || !map.getContainer()) return;
      map.invalidateSize();
    };

    const t1 = setTimeout(triggerSync, 100);
    const t2 = setTimeout(triggerSync, 500);

    return () => {
      isMounted = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [center, zoom, map]);
  return null;
};

export default function MapPickerCore({
  initialLat = 17.3850,
  initialLng = 78.4867,
  onLocationSelect,
  fullScreen = false,
  readOnly = false,
  venues = [],
}: MapPickerCoreProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(fullScreen);

  const mapLayers = {
    dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    satellite: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
    traffic: "https://mt1.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}"
  };

  const [position, setPosition] = useState<[number, number]>([initialLat, initialLng]);
  const [zoom, setZoom] = useState(13);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Trigger resize event whenever expansion toggles to force Leaflet viewport update
  useEffect(() => {
    const triggerResize = () => {
      window.dispatchEvent(new Event('resize'));
      // Wait for DOM to catch up then invalidate leaflet
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
      setTimeout(() => window.dispatchEvent(new Event('resize')), 500);
    };
    triggerResize();
  }, [isExpanded]);

  const executeSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    const queryLower = searchQuery.toLowerCase();

    // 1. First search internal venues - check if venue name is IN query or vice versa
    const venueMatch = venues?.find(v => 
      queryLower.includes(v.name.toLowerCase()) || 
      v.name.toLowerCase().includes(queryLower)
    );

    if (venueMatch && venueMatch.latitude && venueMatch.longitude) {
      setPosition([venueMatch.latitude, venueMatch.longitude]);
      setZoom(18);
      setIsSearching(false);
      return;
    }

    // 2. Fallback to Photon (More accurate for multi-word queries)
    try {
      const params = new URLSearchParams({
        q: searchQuery,
        limit: "5",
        lat: position[0].toString(),
        lon: position[1].toString(),
        lang: "en"
      });
      
      const res = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
      const data = await res.json();
      
      if (data && data.features && data.features.length > 0) {
        // PROFESSIONAL PRECISION: Prioritize town/city/village centroids over broad district regions
        const best = data.features.find((f: any) => 
          f.properties.osm_value === 'town' || 
          f.properties.osm_value === 'city'
        ) || data.features.find((f: any) => 
          f.properties.osm_value === 'village' ||
          f.properties.osm_value === 'residential'
        ) || data.features[0];

        const [lon, lat] = best.geometry.coordinates;
        const props = best.properties;
        
        setPosition([lat, lon]);
        
        // Dynamic zoom based on type
        let newZoom = 15;
        if (props.type === 'house' || props.type === 'building') newZoom = 19;
        else if (props.osm_value === 'residential' || props.osm_value === 'service') newZoom = 17;
        
        setZoom(newZoom);
        
        if (onLocationSelect) {
          const address = [props.name, props.street, props.city, props.country].filter(Boolean).join(', ');
          onLocationSelect(lat, lon, address || searchQuery, props.city || props.district || "", props.country || "");
        }
      }
    } catch (e) {
      console.error("Search failed", e);
    } finally {
      setIsSearching(false);
    }
  };

  const mapContent = (
    <div className={`relative w-full bg-[#020617] overflow-hidden ${isExpanded ? "fixed inset-0 z-[10000] w-screen h-screen" : "h-full min-h-[300px] w-full rounded-2xl border border-white/10 shadow-2xl"}`}>
      
      {/* ── SEARCH HUD ── */}
      {!readOnly && (
        <div className={`absolute top-6 left-1/2 -translate-x-1/2 z-[11000] w-full transition-all duration-300 ${isExpanded ? 'max-w-xl' : 'max-w-[85%]'}`}>
          <div className="glass-hud-panel rounded-full p-1.5 pl-5 flex items-center gap-3">
            <Search className="w-4 h-4 text-cyan-400 opacity-70" />
            <input
              type="text"
              placeholder={t("map.search_placeholder") || "Search intelligence sector..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && executeSearch()}
              className="bg-transparent border-none outline-none text-white text-xs flex-1 placeholder:text-slate-500 font-medium"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={executeSearch}
                className="bg-cyan-500 hover:bg-cyan-400 text-black p-2 rounded-full transition-all shadow-[0_0_15px_rgba(34,211,238,0.4)]"
              >
                {isSearching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Target className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <p className="text-[9px] text-center mt-2 text-slate-500 uppercase font-bold tracking-widest opacity-60">{t("map.click_hint") || "Click map to pinpoint location"}</p>
        </div>
      )}

      {/* ── CORE MAP ── */}
      <MapContainer
        key={isExpanded ? 'expanded' : 'collapsed'} // Force remount to survive portal move
        center={position}
        zoom={zoom}
        className="h-full w-full z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <MapController center={position} zoom={zoom} />
        
        <LayersControl position="bottomleft">
          <LayersControl.BaseLayer checked name={t("map.layer_dark") || "Dark"}>
            <TileLayer url={mapLayers.dark} maxZoom={20} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={t("map.layer_satellite") || "Satellite"}>
            <TileLayer url={mapLayers.satellite} maxZoom={20} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name={t("map.layer_traffic") || "Traffic"}>
            <TileLayer url={mapLayers.traffic} maxZoom={20} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {!readOnly && <LocationDragger setPosition={setPosition} onLocationSelect={onLocationSelect} />}

        <Marker position={position} icon={createGlowingIcon("#22d3ee")} />

        {venues.map(v => v.latitude && v.longitude && (
          <Marker 
            key={v.id} 
            position={[v.latitude, v.longitude]} 
            icon={createGlowingIcon("#10B981")}
          >
             <Tooltip direction="top" offset={[0, -10]} className="custom-intel-tooltip">
                <span className="text-[10px] font-black uppercase tracking-widest">{v.name}</span>
             </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* ── TACTICAL CONTROLS ── */}
      <div className="absolute bottom-4 right-4 z-[11000] flex flex-col gap-3">
        {!readOnly && (
          <>
            <button 
              onClick={() => setPosition([initialLat, initialLng])}
              className="bg-black/60 hover:bg-slate-800 backdrop-blur-xl border border-white/10 p-3 rounded-full text-white transition-all shadow-2xl"
              title="Recenter"
            >
              <Navigation className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="bg-cyan-500 hover:bg-cyan-400 text-black p-3 rounded-full transition-all shadow-[0_0_20px_rgba(34,211,238,0.4)] group"
            >
              {isExpanded ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-black/80 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {isExpanded ? t("map.collapse") : t("map.expand")}
              </span>
            </button>
          </>
        )}
      </div>

      {isExpanded && !readOnly && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[11000]">
          <button 
            onClick={() => setIsExpanded(false)}
            className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-full font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all transform hover:scale-105 active:scale-95"
          >
            <Check className="w-4 h-4" />
            {t("map.lock_location") || "Lock & Confirm Location"}
          </button>
        </div>
      )}

      {/* Decorative Overlays */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-[linear-gradient(rgba(34,211,238,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.01)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      <div className="absolute inset-0 pointer-events-none z-20 shadow-[inset_0_0_100px_rgba(0,0,0,0.6)]"></div>

      {readOnly && (
        <div className="absolute bottom-6 left-6 z-[10000] glass-hud-panel px-4 py-2 rounded-full border border-cyan-500/20">
          <span className="text-[10px] text-cyan-400 font-black uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></div>
            {t("map.ops_map_active") || "Ops Map Active"}
          </span>
        </div>
      )}
    </div>
  );

  return typeof document !== "undefined" && isExpanded ? createPortal(mapContent, document.body) : mapContent;
}
