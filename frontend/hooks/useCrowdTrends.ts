import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface CrowdTrends {
  peak_time: string;
  max_crowd: number;
}

export const useCrowdTrends = (venueId: string) => {
  return useQuery({
    queryKey: ['crowdTrends', venueId],
    queryFn: async () => {
      const response = await api.get(`/venues/${venueId}/analytics/trends`);
      return response.data as CrowdTrends;
    },
    refetchInterval: 60000 * 5, // Refetch every 5 minutes
    staleTime: 60000 * 2,
    enabled: !!venueId,
  });
};
