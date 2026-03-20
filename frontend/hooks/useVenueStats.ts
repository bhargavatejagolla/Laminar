import { useQuery } from "@tanstack/react-query"
import { VenueService } from "@/services/venue.service"

export function useVenueStats(venueId: string) {

  return useQuery({

    queryKey: ["venue-stats", venueId],

    queryFn: () => VenueService.getVenueStats(venueId),

    enabled: !!venueId,

    refetchInterval: 15000
  })
}