export interface ApiEnvelope<T> {
  data: T;
}

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

export type ServiceState = 'up' | 'down' | 'unknown';
export type Freshness = 'fresh' | 'stale' | 'pending' | 'unknown' | 'paused' | 'engine_unavailable';

export interface TrustPulseWindow {
  expectedChecks: number;
  completedChecks: number;
  successfulChecks: number;
  failedChecks: number;
  missingChecks: number;
  excludedChecks: number;
  observedUptimePercent: number | null;
  monitoringCoveragePercent: number | null;
}

export interface TrustPulse extends TrustPulseWindow {
  serviceState: ServiceState;
  lastKnownServiceState: ServiceState;
  freshness: Freshness;
  monitoringStatus: string;
  engineStatus: string;
  engineLastHeartbeatAt: string | null;
  lastSuccessfulCheckAt: string | null;
  lastCompletedCheckAt: string | null;
  period: '24h';
  periods: Record<string, TrustPulseWindow>;
  availabilityNote: string;
  monitoringInterruptions: MonitoringInterruption[];
  lastFailure: CheckEvidence | null;
  lastCheck: CheckEvidence | null;
}

export interface MonitoringInterruption {
  id: string;
  engine: string;
  startedAt: string;
  endedAt: string | null;
  reason: string;
  excludedFromExpected: boolean;
  durationMs: number;
  active: boolean;
}

export interface CheckEvidence {
  success: boolean;
  httpStatus: number | null;
  failureClassification: string | null;
  failureDetail: string | null;
  checkedAt: string;
  tlsExpiresAt: string | null;
}

export interface LatestCheck {
  id: string;
  endpointId: string;
  scheduleId: string | null;
  scheduledCheckId: string;
  engineResultId: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string;
  success: boolean;
  failureClassification: string | null;
  failureDetail: string | null;
  tlsExpiresAt: string | null;
  source: 'native' | 'gatus';
}

export interface Endpoint {
  id: string;
  owner_id: string | null;
  name: string;
  group_name: string;
  url: string;
  expected_status: number;
  expected_content: string | null;
  gatus_key: string;
  public_slug: string | null;
  interval_seconds: 30 | 60 | 120;
  enabled: number;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  deleted_at: string | null;
}

export interface EndpointWithIntelligence extends Endpoint {
  latestCheck: LatestCheck | null;
  trustPulse: TrustPulse;
  incidentLens: IncidentLens;
  latestVerification: VerificationResult | null;
}

export interface Incident {
  id: string;
  endpoint_id: string | null;
  owner_id: string | null;
  title: string;
  description: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'investigating' | 'resolved';
  dedupe_key: string | null;
  failure_count: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface IncidentEvent {
  id: string;
  event_type: 'created' | 'failure' | 'recovered' | 'updated';
  message: string;
  health_check_id: string | null;
  created_at: string;
}

export interface IncidentDetail {
  incident: Incident;
  events: IncidentEvent[];
}

export interface IncidentExplanationResult {
  source: 'ai' | 'incidentlens';
  explanation: {
    possibleCauses: string[];
    evidenceLimitations: string[];
    recommendedTroubleshootingSteps: string[];
  };
  fallbackReason?: 'disabled' | 'misconfigured' | 'unavailable' | 'rate_limited' | 'invalid_response';
  cached: boolean;
}

export interface Notification {
  id: string;
  incident_id: string | null;
  channel: 'email' | 'webhook';
  event_type: 'incident_created' | 'incident_recovered';
  recipient: string;
  payload: string;
  delivery_status: 'simulated' | 'sent' | 'failed';
  created_at: string;
}

export interface VerificationResult {
  id?: string;
  endpointId: string;
  scheduledCheckId: string | null;
  outcome: 'verified_endpoint_failure' | 'possible_monitoring_network_failure' | 'not_reproduced' | 'unverified' | 'not_needed';
  reason: string;
  targetRetry: {
    success: boolean | null;
    statusCode: number | null;
    failureClassification: string | null;
  };
  referenceCheck: {
    configured: boolean;
    success: boolean | null;
    failureClassification: string | null;
  };
  globalOutageConfirmed: false;
  createdAt?: string;
  throttled?: boolean;
}

export interface IncidentLens {
  observedEvidence: {
    success: boolean | null;
    httpStatus: number | null;
    failureClassification: string | null;
    failureDetail: string | null;
    checkedAt: string | null;
    freshness: Freshness;
    monitoringCoveragePercent: number | null;
    tlsExpiresAt: string | null;
    tlsDaysUntilExpiry: number | null;
  };
  failureCategory: string;
  possibleCauses: string[];
  recommendedTroubleshootingSteps: string[];
  evidenceLimitations: string[];
  rootCause: null;
  diagnosticConfidence: 'limited' | 'insufficient';
}

export interface DashboardData {
  endpoints: EndpointWithIntelligence[];
  incidents: Incident[];
  notifications: Notification[];
  monitoringEngines: MonitoringEngine[];
  generatedAt: string;
}

export interface MonitoringEngine {
  engine: string;
  status: string;
  version?: string | null;
  image_digest?: string | null;
  last_checked_at?: string | null;
  last_error?: string | null;
  updated_at?: string;
}

export interface HealthCheck {
  id: string;
  scheduleId: string | null;
  scheduledCheckId: string;
  engineResultId: string | null;
  httpStatus: number | null;
  latencyMs: number | null;
  checkedAt: string;
  success: boolean;
  failureClassification: string | null;
  failureDetail: string | null;
  tlsExpiresAt: string | null;
  source: 'native' | 'gatus';
}

export interface EndpointDetail {
  endpoint: Endpoint;
  latestCheck: LatestCheck | null;
  tls: {
    status: 'available' | 'unavailable' | 'not_applicable';
    expiresAt: string | null;
    issuer?: string | null;
    commonName?: string | null;
    daysUntilExpiry?: number | null;
  };
  schedule: { id: string; interval_seconds: number; starts_at: string } | null;
  trustPulse: TrustPulse;
  incidentLens: IncidentLens;
  latestVerification: VerificationResult | null;
}

export interface PublicHistoryCheck {
  checkedAt: string;
  success: boolean;
  httpStatus: number | null;
  latencyMs: number | null;
}

export interface PublicEndpointSummary {
  id: string;
  name: string;
  status: 'operational' | 'outage' | 'unknown';
  serviceState: ServiceState;
  lastKnownServiceState: ServiceState;
  monitoringFreshness: Freshness;
  httpStatus: number | null;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastSuccessfulCheckAt: string | null;
  checkIntervalSeconds: number;
  uptime24h: number | null;
  observedUptimePercent: number | null;
  monitoringCoveragePercent: number | null;
  expectedChecks24h: number;
  completedChecks24h: number;
  successfulChecks24h: number;
  missedChecks24h: number;
  availabilityNote: string;
  tls: { status: 'available' | 'unavailable' | 'not_applicable'; expiresAt: string | null };
}

export interface PublicStatusResponse {
  endpoint: PublicEndpointSummary;
  incidents: Array<Pick<Incident, 'id' | 'endpoint_id' | 'title' | 'description' | 'severity' | 'status' | 'created_at' | 'updated_at' | 'resolved_at'>>;
  history: PublicHistoryCheck[];
  generatedAt: string;
}

export interface PublicOverviewEndpoint {
  id: string;
  name: string;
  group: string;
  publicSlug: string | null;
  status: ServiceState;
  monitoringFreshness: Freshness;
  monitoringCoveragePercent: number | null;
  latencyMs: number | null;
  lastChecked: string | null;
  uptime: {
    uptime_1h: number | null;
    uptime_24h: number | null;
    uptime_7d: number | null;
    uptime_30d: number | null;
    uptime_90d: number | null;
    computed_at: string;
    source: 'gatus' | 'native' | 'none';
    sampleCount: number;
    expectedChecks24h: number | null;
  };
}

export interface PublicOverview {
  overall: 'operational' | 'degraded' | 'outage';
  endpoints: PublicOverviewEndpoint[];
  generatedAt: string;
}
