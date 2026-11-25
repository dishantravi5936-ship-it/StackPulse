import axios, { AxiosError, type AxiosResponse } from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 12_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('stackpulse_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { message?: string } }>) => {
    if (error.response?.status === 401 && sessionStorage.getItem('stackpulse_token')) {
      sessionStorage.removeItem('stackpulse_token');
      sessionStorage.removeItem('stackpulse_user');
      window.dispatchEvent(new Event('stackpulse:unauthorized'));
    }
    return Promise.reject(error);
  }
);

export function unwrap<T>(response: AxiosResponse<{ data: T }>): T {
  return response.data.data;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message ?? error.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

export default api;
