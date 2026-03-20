import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface ResourcePlan {
  crowd: number;
  recommended_staff: number;
}

export const useResourcePlanning = (venueId: string) => {
  return useQuery({
    queryKey: ['resourcePlanning', venueId],
    queryFn: async () => {
      const response = await api.get(`/venues/${venueId}/analytics/resource-planning`);
      return response.data as ResourcePlan;
    },
    refetchInterval: 60000, // Refetch every minute for near-realtime staffing
    staleTime: 30000,
    enabled: !!venueId,
  });
};
