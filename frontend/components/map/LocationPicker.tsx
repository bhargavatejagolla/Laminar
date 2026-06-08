"use client";

import { MapContainer, TileLayer, Marker, useMapEvents, LayersControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

// Fix for default Leaflet marker icon in NextJS
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const { BaseLayer } = LayersControl;

export default function LocationPicker({ position, setPosition }: { position: [number, number] | null, setPosition: (p: [number, number]) => void }) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

    const executeSearch = async () => {
        if (!searchQuery) return;
        try {
            const res = await fetch(`https://photon.komoot.io/api/?q=${searchQuery}&limit=1`);
            const data = await res.json();
            if (data.features && data.features.length > 0) {
                const { geometry } = data.features[0];
                const newPos: [number, number] = [geometry.coordinates[1], geometry.coordinates[0]];
                setPosition(newPos);
                if (mapInstance) mapInstance.flyTo(newPos, 16);
            }
        } catch (e) {
            console.error("Geocoding failed", e);
        }
    };

    function LocationMarker() {
  const { t } = useTranslation();

        const map = useMapEvents({
            click(e) {
                setPosition([e.latlng.lat, e.latlng.lng]);
            },
        });

        useEffect(() => {
            if (map && !mapInstance) {
                setMapInstance(map);
            }
        }, [map]);

        return position === null ? null : <Marker position={position} />;
    }

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-2 left-2 z-[400] flex items-center gap-2 bg-black/80 p-1.5 rounded-lg border border-white/20 backdrop-blur-md shadow-lg">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && executeSearch()}
                    placeholder={t("auto.Searchlocation_5155") || "Search location..."}
                    className="bg-transparent text-white text-[10px] w-36 outline-none px-2 font-mono"
                />
                <button onClick={executeSearch} className="p-1.5 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/30 rounded transition-colors">
                    <Search className="w-3 h-3 text-indigo-300" />
                </button>
            </div>

            <MapContainer
                center={position || [17.4474, 78.3762]}
                zoom={14}
                style={{ height: "100%", width: "100%" }}
                className="z-0"
            >
                <LayersControl position="topright">
                    <BaseLayer checked name="Tactical Dark">
                        <TileLayer
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                            attribution="&copy; OpenStreetMap & CARTO"
                        />
                    </BaseLayer>
                    <BaseLayer name="Satellite Recon">
                        <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution="Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
                        />
                    </BaseLayer>
                    <BaseLayer name="Street Vector">
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution="&copy; OpenStreetMap contributors"
                        />
                    </BaseLayer>
                </LayersControl>
                <LocationMarker />
            </MapContainer>
        </div>
    );
}
