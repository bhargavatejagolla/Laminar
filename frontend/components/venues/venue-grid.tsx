"use client"

import { useVenues } from "@/hooks/useVenues"
import VenueCard from "./venue-card"
import { Map, Loader2 } from "lucide-react"

export default function VenueGrid() {
  const { data: venues, isLoading, isError } = useVenues()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[180px] rounded-xl bg-[#0f172a]/50 animate-pulse border border-slate-800"
          />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-8 text-center bg-rose-950/20 border border-rose-900/30 rounded-xl">
        <p className="text-rose-400 font-medium">System Error: Failed to establish uplink with Venue registry.</p>
      </div>
    )
  }

  if (!venues || venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-[#0f172a]/30 rounded-xl border border-slate-800/50 text-center border-dashed">
        <Map className="w-10 h-10 text-slate-600 mb-4" />
        <h3 className="text-slate-300 font-semibold mb-2">No Active Venues</h3>
        <p className="text-slate-500 text-sm max-w-sm">
          Connect your first venue mapping to begin processing Crowd Intelligence streams.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {venues.map((venue: any) => (
        <VenueCard key={venue.id} venue={venue} />
      ))}
    </div>
  )
}