import axios from "axios"
import axiosRetry from "axios-retry"
import { toast } from "sonner"

const IS_DEV = process.env.NODE_ENV === "development";

// Bypass Next.js rewrites proxy in development to avoid the strict 30-second proxy timeout!
// This fixes the 500 Internal Server Error during video uploads.
const API_BASE_URL = IS_DEV ? "http://127.0.0.1:8000/api/v1" : "/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
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
    if (error.response?.status === 401) {
      console.error(`[AUTH FATAL] Unauthorized: ${error.config?.url} (401)`)
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token")
        window.location.href = "/login"
      }
    } else if (error.response?.status === 403) {
      console.error(`[AUTH ACCESS] Forbidden: ${error.config?.url} (403)`)
      // Don't redirect on 403, just let the request fail so the UI can handle it
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