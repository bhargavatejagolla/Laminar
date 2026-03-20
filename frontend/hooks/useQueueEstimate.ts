import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface QueueEstimate {
  venue_id: string;
  queue_length: number;
  service_rate: number;
  estimated_wait_time: string;
  timestamp: string;
}

export function useQueueEstimate(venueId?: string) {
  return useQuery<QueueEstimate, Error>({
    queryKey: ["queue-estimate", venueId],
    queryFn: async () => {
      const { data } = await api.get(`/venues/${venueId}/queue-estimate`);
      return data;
    },
    enabled: !!venueId,
    refetchInterval: 60000, // Refresh every minute
  });
}
