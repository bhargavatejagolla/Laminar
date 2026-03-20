import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/services/api";

export interface Camera {
  id: string;
  name: string;
  venue_id: string;
  stream_type: string;
  is_active: boolean;
  is_online: boolean;
  fps: number;
  last_heartbeat_at: string | null;
}

export function useCameras() {
  return useQuery<Camera[]>({
    queryKey: ["cameras"],
    queryFn: async () => {
      const response = await api.get('/cameras');
      return response.data;
    },
    refetchInterval: 15000,
  });
}

// Admin Bulk Action Hooks
export function useBulkEnableCameras() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cameraIds: string[]) => {
      const response = await api.post('/cameras/bulk-enable', { camera_ids: cameraIds });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
  });
}

export function useBulkDisableCameras() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cameraIds: string[]) => {
      const response = await api.post('/cameras/bulk-disable', { camera_ids: cameraIds });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cameras"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    }
  });
}