/*
 * Crypto AI Trading System - Frontend with Refine
 * ==========================================
 * Panel de control multiusuario completo
 */

export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
export const AUTH_URL = import.meta.env.VITE_AUTH_URL || "http://localhost:8000";

// API Client
import axios from "axios";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);