import axios from "axios"
import axiosRetry from "axios-retry"
import { toast } from "sonner"

const API_BASE_URL = "/api/v1"

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  },
  // Safely parse JSON — fall back if backend returns plain text (e.g. "Internal Server Error")
  transformResponse: [
    (data) => {
      if (typeof data === "string") {
        try {
          return JSON.parse(data);
        } catch {
          return { detail: data, _raw: true };
        }
      }
      return data;
    },
  ],
})

// Retry on network errors or 429
axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) =>
    axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429,
});

// Attach JWT token
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Global error handler
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(`[AUTH FATAL] Unauthorized: ${error.config?.url} (${error.response?.status})`)
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token")
        window.location.href = "/login"
      }
    } else if (!error.response || error.response?.status >= 500) {
      const isProxyError = error.message.includes("Network Error") || error.response?.status === 500;
      if (isProxyError && typeof window !== "undefined") {
        toast.error("SYSTEM OFFLINE: Backend Core is Unreachable", {
          description: "Please run 'start.bat' from the project root to initialize both frontend and backend.",
          duration: 10000,
          position: "top-center"
        });
      }
    }
    return Promise.reject(error)
  }
)