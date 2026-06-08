"use client";

/**
 * Laminar - 2D Crowd Density Heatmap Overlay
 * --------------------------------------------
 * Renders a visual heat-map of zone-by-zone crowd density
 * directly in the browser — no extra npm packages needed.
 *
 * Shows each configured zone as a colored square:
 *   Green (< 60% capacity) → Yellow (60-85%) → Red (> 85%)
 *
 * Usage:
 *   <HeatmapOverlay zones={venueZones} />
 *
 * Props:
 *   zones: array of VenueZone objects (from existing venue API)
 *   showLabels: whether to render zone names
 *   cellSize: pixel size of each cell (default: 80)
 */

import * as React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface ZoneData {
  id: string;
  name: string;
  current_count: number;
  capacity: number;
  risk_level?: string;
  x?: number;  // Optional grid position
  y?: number;
}

interface HeatmapOverlayProps {
  zones: ZoneData[];
  showLabels?: boolean;
  cellSize?: number;
  className?: string;
}

// ─── Color scale ─────────────────────────────────────────────────────────────
function getHeatColor(pct: number): {
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  if (pct >= 0.9) return {
    bg: "rgba(239, 68, 68, 0.85)",
    border: "rgb(220, 38, 38)",
    text: "#fff",
    label: "Critical",
  };
  if (pct >= 0.75) return {
    bg: "rgba(249, 115, 22, 0.8)",
    border: "rgb(234, 88, 12)",
    text: "#fff",
    label: "High",
  };
  if (pct >= 0.55) return {
    bg: "rgba(234, 179, 8, 0.75)",
    border: "rgb(202, 138, 4)",
    text: "#1a1a1a",
    label: "Medium",
  };
  if (pct >= 0.3) return {
    bg: "rgba(34, 197, 94, 0.7)",
    border: "rgb(22, 163, 74)",
    text: "#1a1a1a",
    label: "Low",
  };
  return {
    bg: "rgba(99, 102, 241, 0.4)",
    border: "rgb(79, 70, 229)",
    text: "#e5e7eb",
    label: "Empty",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export function HeatmapOverlay({
  zones = [],
  showLabels = true,
  cellSize = 80,
  className = "",
}: HeatmapOverlayProps) {
  const { t } = useTranslation();


  // Auto-arrange zones in a grid if no x/y provided
  const arrangedZones = useMemo(() => {
    const cols = Math.ceil(Math.sqrt(zones.length));
    return zones.map((zone, idx) => ({
      ...zone,
      gridX: zone.x ?? idx % cols,
      gridY: zone.y ?? Math.floor(idx / cols),
    }));
  }, [zones]);

  const maxX = Math.max(...arrangedZones.map(z => z.gridX), 0) + 1;
  const maxY = Math.max(...arrangedZones.map(z => z.gridY), 0) + 1;

  const gap = 6;
  const totalWidth = maxX * cellSize + (maxX - 1) * gap;
  const totalHeight = maxY * cellSize + (maxY - 1) * gap;

  if (zones.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-neutral-400">
        <span className="font-medium text-neutral-300">Zone Density:</span>
        {[
          { label: "Empty", color: "rgba(99,102,241,0.5)" },
          { label: "Low", color: "rgba(34,197,94,0.7)" },
          { label: "Medium", color: "rgba(234,179,8,0.75)" },
          { label: "High", color: "rgba(249,115,22,0.8)" },
          { label: "Critical", color: "rgba(239,68,68,0.85)" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3.5 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div
        className="relative"
        style={{ width: totalWidth, height: totalHeight }}
        role="img"
        aria-label={t("auto.Crowddensityhea_685") || "Crowd density heatmap"}
      >
        {arrangedZones.map((zone) => {
          const pct = zone.capacity > 0 ? zone.current_count / zone.capacity : 0;
          const colors = getHeatColor(pct);
          const left = zone.gridX * (cellSize + gap);
          const top = zone.gridY * (cellSize + gap);

          return (
            <div
              key={zone.id}
              className="absolute rounded-lg overflow-hidden group cursor-default"
              style={{
                left,
                top,
                width: cellSize,
                height: cellSize,
                backgroundColor: colors.bg,
                border: `2px solid ${colors.border}`,
                transition: "all 0.4s ease",
              }}
              title={`${zone.name}: ${zone.current_count}/${zone.capacity} (${Math.round(pct * 100)}%)`}
            >
              {/* Inner glow for high density */}
              {pct >= 0.75 && (
                <div
                  className="absolute inset-0 rounded-lg"
                  style={{
                    boxShadow: `inset 0 0 ${cellSize * 0.3}px rgba(255,255,255,0.15)`,
                  }}
                />
              )}

              {showLabels && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-1"
                  style={{ color: colors.text }}
                >
                  <span className="text-xs font-bold leading-tight text-center line-clamp-2">
                    {zone.name}
                  </span>
                  <span className="text-lg font-black mt-0.5 leading-none">
                    {Math.round(pct * 100)}%
                  </span>
                  <span className="text-xs opacity-75">
                    {zone.current_count}/{zone.capacity}
                  </span>
                </div>
              )}

              {/* Pulse animation for critical zones */}
              {pct >= 0.9 && (
                <div className="absolute inset-0 rounded-lg border-2 border-red-400 animate-ping opacity-30" />
              )}

              {/* Hover tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 bg-neutral-900 border border-neutral-700 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ color: "#e5e7eb" }}>
                <div className="font-semibold">{zone.name}</div>
                <div>Occupancy: <span className="font-medium">{Math.round(pct * 100)}%</span></div>
                <div>Count: {zone.current_count} / {zone.capacity}</div>
                <div>Status: <span style={{ color: colors.bg }}>{colors.label}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-4 text-xs text-neutral-400 mt-2">
        <span>{zones.length} zones monitored</span>
        <span>•</span>
        <span>
          Avg density: {Math.round(
            zones.reduce((sum, z) => sum + (z.capacity > 0 ? z.current_count / z.capacity : 0), 0)
            / Math.max(zones.length, 1) * 100
          )}%
        </span>
        <span>•</span>
        <span className="text-red-400 font-medium">
          {zones.filter(z => z.capacity > 0 && z.current_count / z.capacity >= 0.85).length} critical zones
        </span>
      </div>
    </div>
  );
}
