"use client";

import { useState, useEffect } from "react";

const LAMINAR_AV_KEY = "laminar_active_venue_context";

export function useActiveVenue() {
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);

  useEffect(() => {
    // Initial load from localStorage
    const stored = localStorage.getItem(LAMINAR_AV_KEY);
    if (stored) setActiveVenueId(stored);

    // Listen for changes across tabs/components
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LAMINAR_AV_KEY) {
        setActiveVenueId(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setVenue = (id: string) => {
    localStorage.setItem(LAMINAR_AV_KEY, id);
    setActiveVenueId(id);
    // Trigger local event for same-tab updates
    window.dispatchEvent(new Event("laminar_venue_sync"));
  };

  useEffect(() => {
    const handleLocalSync = () => {
      const stored = localStorage.getItem(LAMINAR_AV_KEY);
      setActiveVenueId(stored);
    };
    window.addEventListener("laminar_venue_sync", handleLocalSync);
    return () => window.removeEventListener("laminar_venue_sync", handleLocalSync);
  }, []);

  return { activeVenueId, setVenue };
}
