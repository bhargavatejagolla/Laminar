import { useQuery } from "@tanstack/react-query"
import { VenueService } from "@/services/venue.service"
import { Venue } from "@/types/venue"

export function useVenues() {

  return useQuery<Venue[]>({

    queryKey: ["venues"],

    queryFn: () => VenueService.getVenues(),

    staleTime: 1000 * 30,

    refetchInterval: 50000,

  })
}