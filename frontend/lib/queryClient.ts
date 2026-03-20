import { QueryClient } from "@tanstack/react-query";

/**
 * Global React Query client
 * Handles caching, retries, and refresh intervals
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 10, // 10 seconds
    },
  },
});
