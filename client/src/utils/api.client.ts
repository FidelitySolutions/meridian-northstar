/**
 * Axios instance with JWT access token interceptor and silent refresh rotation.
 * Access token is held in memory only (Zustand store) — never written to localStorage.
 * httpOnly cookie carries the refresh token; the server sets it on login.
 *
 * On tab reload, the cookie allows the app to silently re-authenticate via the
 * refresh endpoint. No access token survives a hard refresh — by design (ADR-002).
 *
 * iOS Safari note: all Intl.DateTimeFormat calls elsewhere in the client must include
 * hour12: true. Omitting it causes 24h display on Safari iOS — fixed in PR #114 (Jan 2026).
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth.store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // include httpOnly refresh token cookie on every request
  headers: { 'Content-Type': 'application/json' },
});

// Attach the in-memory access token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function drainQueue(token?: string, error?: unknown) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  pendingQueue = [];
}

// On 401, attempt a silent refresh using the httpOnly cookie.
// Subsequent requests that fail while refresh is in flight are queued and retried.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post<{ accessToken: string }>(
        `${API_BASE_URL}/api/auth/refresh`,
        {},
        { withCredentials: true }
      );

      const newToken = data.accessToken;
      useAuthStore.getState().setAccessToken(newToken);
      drainQueue(newToken);
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      drainQueue(undefined, refreshError);
      useAuthStore.getState().clearSession();
      window.location.href = '/login';
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);
