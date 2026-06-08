"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet icon issue in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const customNodeIcon = (color: string) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #121216; box-shadow: 0 0 10px ${color};"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

const pulseNodeIcon = (color: string) => new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #121216; box-shadow: 0 0 20px ${color}; animation: pulse 2s infinite;"></div>
           <style>
             @keyframes pulse {
               0% { box-shadow: 0 0 0 0 ${color}80; }
               70% { box-shadow: 0 0 0 15px ${color}00; }
               100% { box-shadow: 0 0 0 0 ${color}00; }
             }
           </style>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
});

type Node = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    status: 'online' | 'offline';
};

interface MultiNodeMapProps {
    nodes: Node[];
    currentNodeId: string;
    targetNodeId?: string;
    isTransit?: boolean;
}

const MapController = ({ nodes }: { nodes: Node[] }) => {
    const map = useMap();
    
    useEffect(() => {
        if (nodes.length > 0) {
            const bounds = L.latLngBounds(nodes.map(n => [n.lat, n.lng]));
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [nodes, map]);
    
    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            map.invalidateSize();
        });
        resizeObserver.observe(map.getContainer());
        return () => resizeObserver.disconnect();
    }, [map]);
    
    return null;
};

export default function MultiNodeMap({ nodes, currentNodeId, targetNodeId, isTransit }: MultiNodeMapProps) {
    if (!nodes || nodes.length === 0) return null;

    const positions: [number, number][] = nodes.map(n => [n.lat, n.lng]);

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden border border-white/10 relative z-0">
            <MapContainer 
                center={positions[0]} 
                zoom={14} 
                style={{ height: "100%", width: "100%", background: "#0a0a0c" }}
                zoomControl={false}
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                
                <Polyline 
                    positions={positions} 
                    color="#38bdf8" 
                    weight={3} 
                    opacity={0.4} 
                    dashArray="5, 10" 
                />

                {nodes.map(node => {
                    const isActive = node.id === currentNodeId && !isTransit;
                    const isTarget = node.id === targetNodeId && isTransit;
                    
                    let iconColor = "#64748b"; // default slate
                    if (isActive) iconColor = "#10b981"; // emerald for active
                    else if (isTarget) iconColor = "#f59e0b"; // amber for target transit
                    else if (node.status === 'online') iconColor = "#38bdf8"; // sky for available
                    
                    return (
                        <Marker 
                            key={node.id} 
                            position={[node.lat, node.lng]}
                            icon={isActive || isTarget ? pulseNodeIcon(iconColor) : customNodeIcon(iconColor)}
                        />
                    );
                })}
                <MapController nodes={nodes} />
            </MapContainer>
            
            {/* Overlay Info */}
            <div className="absolute bottom-4 left-4 z-[1000] bg-[#121216]/80 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-lg">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Coverage Network</div>
                <div className="flex flex-col gap-2">
                    {nodes.map(node => (
                        <div key={node.id} className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${node.id === currentNodeId && !isTransit ? 'bg-emerald-500 animate-pulse' : node.id === targetNodeId && isTransit ? 'bg-amber-500' : 'bg-slate-600'}`}></div>
                            <span className={`text-[10px] font-bold ${node.id === currentNodeId && !isTransit ? 'text-white' : 'text-slate-400'}`}>{node.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
