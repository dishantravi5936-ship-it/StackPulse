// Shared TypeScript types for StackPulse
// Keep in sync with backend service types

export type ServiceStatus = 'up' | 'down' | 'degraded' | 'unknown';
export type OverallStatus = 'operational' | 'degraded' | 'outage';
export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export interface Endpoint {
  id: string;
  name: string;
  group: string;
  url: string;
  status: ServiceStatus;
  latencyMs: number | null;
  lastChecked: string | null;
  uptime?: UptimeStats;
}

export interface UptimeStats {
  uptime_1h: number | null;
  uptime_24h: number | null;
  uptime_7d: number | null;
  uptime_30d: number | null;
  uptime_90d: number | null;
}

export interface StatusSummary {
  overall: OverallStatus;
  endpoints: Endpoint[];
  generatedAt: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TlsInfo {
  valid: boolean;
  expiresAt: string | null;
  issuer: string | null;
  commonName: string | null;
  daysUntilExpiry: number | null;
}
