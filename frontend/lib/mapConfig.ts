/**
 * LAMINAR Geospatial Infrastructure - Clean Map Tile Configuration
 * 
 * Provides production-grade basemap tile endpoints with ZERO API KEY REQUIRED watermarks.
 * Dynamically uses CARTO Basemaps if NEXT_PUBLIC_CARTO_API_KEY is defined in the environment;
 * otherwise seamlessly defaults to Esri World Dark Gray Canvas with precision street labels overlay.
 */

const CARTO_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_CARTO_API_KEY : undefined;

export const MAP_TILES = {
  // Tactical Dark Basemap: Carto (if key provided) or Esri World Dark Gray Base (free, no watermark)
  darkBase: CARTO_KEY
    ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
    : "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",

  // Tactical Dark Labels Overlay (streets, POIs, city names)
  darkLabels: CARTO_KEY
    ? null
    : "https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",

  // Satellite Reconnaissance (Google Hybrid with roads & boundary labels)
  satellite: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",

  // Live Traffic Flow (Google Traffic with real-time congestion coloring)
  traffic: "https://mt1.google.com/vt/lyrs=m,traffic&x={x}&y={y}&z={z}",

  // OpenStreetMap Standard Vector
  street: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",

  // Attribution strings
  darkAttribution: CARTO_KEY
    ? "&copy; OpenStreetMap contributors &copy; CARTO"
    : "&copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom",
  satelliteAttribution: "&copy; Google Maps Imagery",
  trafficAttribution: "&copy; Google Traffic",
  streetAttribution: "&copy; OpenStreetMap contributors",
};
