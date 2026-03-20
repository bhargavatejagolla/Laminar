import axios from "axios"
import axiosRetry from "axios-retry"

const API_BASE_URL = "http://127.0.0.1:8000/api/v1"

/*
Central API Client for Laminar
Handles:
- base URL
- auth token
- error handling
- retry logic
*/

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json"
  }
})

// Setup retry logic for network or 5xx errors
axiosRetry(api, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 429;
  }
});

/*
Attach JWT token automatically
*/

api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

/*
Global error handler
*/

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.warn("Unauthorized or Forbidden — redirecting to login")
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token")
        window.location.href = "/login"
      }
    }
    return Promise.reject(error)
  }
)