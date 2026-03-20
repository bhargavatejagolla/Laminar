"use client";

import React from "react";
import { useVenues } from "@/hooks/useVenues";
import { Venue } from "@/types/venue";
import VenueCapacityBar from "@/components/venues/venue-capacity-bar";

interface VenueCardsProps {
  onSelectVenue: (venueId: string | null) => void;
}

export default function VenueCards({ onSelectVenue }: VenueCardsProps) {
  const { data: venues, isLoading, error } = useVenues();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-[#0b1325] animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-400 p-4 bg-red-400/10 rounded-lg">
        Error loading venues: {(error as Error).message}
      </div>
    );
  }

  if (!venues || venues.length === 0) {
    return (
      <div className="text-slate-400 p-8 text-center bg-[#0b1325] rounded-xl">
        No venues found. Create your first venue to get started.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {venues.map((venue: Venue) => (
        <div
          key={venue.id}
          onClick={() => onSelectVenue(venue.id)}
          className="bg-[#0b1325] border border-white/5 rounded-xl p-6 cursor-pointer hover:border-cyan-500/30 transition-all hover:-translate-y-1"
        >
          <h3 className="text-lg font-semibold text-white mb-2">{venue.name}</h3>
          <div className="space-y-2 text-sm">
            <p className="text-slate-400">
              {venue.city}, {venue.country}
            </p>
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400">Capacity</span>
                <span className="text-white font-medium">
                  {venue.current_occupancy ?? 0} / {venue.capacity}
                </span>
              </div>
              <VenueCapacityBar
                capacity={venue.capacity}
                occupancyPercent={venue.capacity_usage}
              />
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  venue.is_active ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="text-slate-400">
                {venue.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            {venue.dynamic_risk_score && (
              <p className="text-cyan-400">Risk Score: {venue.dynamic_risk_score}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}