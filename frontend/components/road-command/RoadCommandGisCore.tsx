"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AlertTriangle, Car, Activity, MapPin, ShieldAlert, Video, Info } from "lucide-react";

interface LocationPayload {
  latitude?: number;
  longitude?: number;
  location_source?: string;
  accuracy_m?: number;
}

interface IntelligenceEvent {
  event_id: string;
  event_type: string;
  domain: string;
  venue_id?: string;
  venue_name?: string;
  camera_id?: string;
  camera_name?: string;
  timestamp: string;
  location: LocationPayload;
  severity: "info" | "warning" | "high" | "critical";
  confidence: number;
  state: string;
  title: string;
  description: string;
  evidence?: any;
  explanation?: any;
}

interface Venue {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  city?: string;
}

interface Camera {
  id: string;
  name: string;
  camera_type?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
}

interface Props {
  venue?: Venue;
  cameras?: Camera[];
  events?: IntelligenceEvent[];
  selectedEvent?: IntelligenceEvent | null;
  onSelectEvent?: (event: IntelligenceEvent) => void;
}

// Tactical Map Auto-Centering
function MapPanController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, 15, { duration: 1.2 });
    }
  }, [center[0], center[1], map]);
  return null;
}

export default function RoadCommandGisCore({
  venue,
  cameras = [],
  events = [],
  selectedEvent,
  onSelectEvent,
}: Props) {
  // Default coordinates fallback to Hyderabad / Smart City center if not set
  const defaultLat = venue?.latitude ? Number(venue.latitude) : 17.3850;
  const defaultLng = venue?.longitude ? Number(venue.longitude) : 78.4867;
  const mapCenter: [number, number] = [defaultLat, defaultLng];

  // Tactical HTML Custom Markers via Leaflet DivIcon
  const venueIcon = useMemo(() => {
    return L.divIcon({
      className: "custom-venue-pin",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
          <span style="position: absolute; width: 100%; height: 100%; border-radius: 9999px; background: rgba(34, 211, 238, 0.2); animation: ping 2s infinite;"></span>
          <div style="width: 28px; height: 28px; border-radius: 8px; background: #080810; border: 2px solid #22d3ee; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px rgba(34,211,238,0.5);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
  }, []);

  const createEventIcon = (severity: string, domain: string, isSelected: boolean) => {
    let color = "#3b82f6";
    let glow = "rgba(59, 130, 246, 0.5)";
    if (severity === "critical" || domain === "incident") {
      color = "#f43f5e";
      glow = "rgba(244, 63, 94, 0.6)";
    } else if (severity === "high" || severity === "warning") {
      color = "#f59e0b";
      glow = "rgba(245, 158, 11, 0.5)";
    } else if (domain === "parking") {
      color = "#10b981";
      glow = "rgba(16, 185, 129, 0.5)";
    }

    const size = isSelected ? 42 : 32;
    const border = isSelected ? "3px solid #ffffff" : `2px solid ${color}`;

    return L.divIcon({
      className: "custom-event-pin",
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: ${size}px; height: ${size}px;">
          ${severity === "critical" ? `<span style="position: absolute; width: 100%; height: 100%; border-radius: 9999px; background: ${glow}; animation: ping 1.5s infinite;"></span>` : ""}
          <div style="width: ${size - 8}px; height: ${size - 8}px; border-radius: 9999px; background: #080810; border: ${border}; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 18px ${glow};">
            <div style="width: 8px; height: 8px; border-radius: 9999px; background: ${color};"></div>
          </div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  };

  const cameraIcon = useMemo(() => {
    return L.divIcon({
      className: "custom-cam-pin",
      html: `
        <div style="width: 24px; height: 24px; border-radius: 6px; background: #0c1322; border: 1.5px solid #94a3b8; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(148,163,184,0.3);">
          <div style="width: 6px; height: 6px; border-radius: 9999px; background: #22d3ee;"></div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }, []);

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-white/10 bg-[#080810]">
      <MapContainer
        center={mapCenter}
        zoom={15}
        className="w-full h-full"
        zoomControl={false}
        attributionControl={false}
      >
        <MapPanController center={mapCenter} />

        {/* Tactical Dark Matter Map Layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          maxZoom={19}
        />

        {/* Primary Venue Marker */}
        {venue && (
          <Marker position={mapCenter} icon={venueIcon}>
            <Tooltip direction="top" offset={[0, -18]} opacity={0.95} permanent>
              <div className="px-2 py-1 bg-black/90 border border-cyan-500/40 rounded text-[10px] font-mono text-cyan-300 font-bold uppercase tracking-wider shadow-lg">
                📍 {venue.name || "Sector Base"}
              </div>
            </Tooltip>
          </Marker>
        )}

        {/* Connected Edge Cameras */}
        {cameras.map((cam, idx) => {
          const camLat = cam.latitude ? Number(cam.latitude) : defaultLat + (idx === 0 ? 0.001 : idx === 1 ? -0.001 : 0.0005);
          const camLng = cam.longitude ? Number(cam.longitude) : defaultLng + (idx === 0 ? -0.001 : idx === 1 ? 0.001 : -0.0008);
          return (
            <Marker key={cam.id} position={[camLat, camLng]} icon={cameraIcon}>
              <Tooltip direction="top" offset={[0, -14]} opacity={0.9}>
                <div className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-[9px] font-mono text-slate-300">
                  📷 {cam.name} · {(cam.camera_type || "Generic").toUpperCase()}
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* Intelligence Events Markers */}
        {events.map((ev, idx) => {
          // Resolve real coordinates or anchor to venue context with slight radial offset
          let evLat = ev.location?.latitude ? Number(ev.location.latitude) : defaultLat + ((idx % 3) * 0.0012 - 0.0006);
          let evLng = ev.location?.longitude ? Number(ev.location.longitude) : defaultLng + (((idx + 1) % 3) * 0.0012 - 0.0006);
          
          const isSelected = selectedEvent?.event_id === ev.event_id;
          const markerIcon = createEventIcon(ev.severity, ev.domain, isSelected);

          return (
            <Marker
              key={ev.event_id}
              position={[evLat, evLng]}
              icon={markerIcon}
              eventHandlers={{
                click: () => onSelectEvent && onSelectEvent(ev),
              }}
            >
              <Tooltip direction="top" offset={[0, -16]} opacity={0.95}>
                <div className="p-2 bg-black/95 border border-white/20 rounded-lg text-xs font-mono shadow-2xl space-y-1 max-w-[220px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white uppercase text-[10px] truncate">{ev.title}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase ${
                      ev.severity === "critical" ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                    }`}>
                      {ev.severity}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 leading-tight">{ev.description}</p>
                  <div className="flex items-center justify-between text-[8px] text-cyan-400/80 pt-1 border-t border-white/10">
                    <span>Source: {ev.location?.location_source || "VENUE_CONFIG"}</span>
                    <span>Conf: {Math.round((ev.confidence || 0.9) * 100)}%</span>
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-[1000] px-3 py-2 bg-black/80 backdrop-blur-md border border-white/10 rounded-xl text-[10px] font-mono space-y-1 shadow-2xl">
        <div className="flex items-center gap-2 text-slate-300 font-bold uppercase text-[9px] mb-1">
          <span>GIS Tactical Overlay</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]"></span>
          <span className="text-slate-400">Critical Incident / Collision</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
          <span className="text-slate-400">High Density / Congestion</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-slate-400">Smart Parking Node</span>
        </div>
      </div>
    </div>
  );
}
