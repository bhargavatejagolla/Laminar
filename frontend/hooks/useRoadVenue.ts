"use client";

import { useState, useEffect } from "react";

const ROAD_VENUE_KEY = "laminar_road_venue_id";

/**
 * Dedicated hook for Road Intelligence active venue context.
 * Separate from useActiveVenue so people-venue selections do not pollute Road Intelligence.
 */
export function useRoadVenue() {
  const [roadVenueId, setRoadVenueId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(ROAD_VENUE_KEY);
    if (stored) setRoadVenueId(stored);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === ROAD_VENUE_KEY) setRoadVenueId(e.newValue);
    };
    window.addEventListener("storage", handleStorage);

    const handleLocalSync = () => {
      setRoadVenueId(localStorage.getItem(ROAD_VENUE_KEY));
    };
    window.addEventListener("laminar_road_venue_sync", handleLocalSync);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("laminar_road_venue_sync", handleLocalSync);
    };
  }, []);

  const setRoadVenue = (id: string) => {
    localStorage.setItem(ROAD_VENUE_KEY, id);
    setRoadVenueId(id);
    window.dispatchEvent(new Event("laminar_road_venue_sync"));
  };

  const clearRoadVenue = () => {
    localStorage.removeItem(ROAD_VENUE_KEY);
    setRoadVenueId(null);
    window.dispatchEvent(new Event("laminar_road_venue_sync"));
  };

  return { roadVenueId, setRoadVenue, clearRoadVenue };
}
