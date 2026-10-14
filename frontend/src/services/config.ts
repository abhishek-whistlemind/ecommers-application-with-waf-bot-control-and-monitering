/**
 * Dynamic configuration for API and WebSocket URLs.
 * Uses relative paths so requests automatically route to the current server (whether localhost, EC2 public IP, or custom domain).
 */
export const getApiBase = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return '';
};

export const getWsUrl = (): string => {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/telemetry`;
  }
  return 'ws://127.0.0.1:8000/ws/telemetry';
};
