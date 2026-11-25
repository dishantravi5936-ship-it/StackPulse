import axios, { AxiosInstance } from 'axios';
import { nsToMs } from '../utils/helpers';

// --- Types reflecting the ACTUAL Gatus API schema ---
// Source: core/endpoint_status.go, core/result.go (TwiN/gatus, Apache 2.0)

export interface GatusConditionResult {
  condition: string;  // e.g. "[STATUS] == 200"
  success: boolean;
}

export interface GatusResult {
  status: number;           // HTTP status code
  hostname: string;         // extracted from URL
  duration: number;         // nanoseconds — use nsToMs() to convert
  errors?: string[];
  conditionResults?: GatusConditionResult[];
  success: boolean;
  timestamp: string;        // RFC3339
}

export interface GatusEvent {
  type: string;             // "HEALTHY" | "UNHEALTHY"
  timestamp: string;        // RFC3339
}

export interface GatusEndpointStatus {
  name: string;
  group: string;
  key: string;              // "{group}_{name}" with special chars → '-'
  results: GatusResult[];
  events?: GatusEvent[];
}

function normalizeStatuses(value: unknown): GatusEndpointStatus[] {
  if (!Array.isArray(value)) {
    throw new Error('Gatus statuses response did not contain an array');
  }
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Gatus statuses response contained an invalid endpoint');
    }
    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.name !== 'string' ||
      typeof raw.group !== 'string' ||
      typeof raw.key !== 'string' ||
      !Array.isArray(raw.results)
    ) {
      throw new Error('Gatus endpoint response did not match the documented status schema');
    }
    const results = raw.results.map((item: unknown) => {
      if (!item || typeof item !== 'object') throw new Error('Gatus result is invalid');
      const result = item as Record<string, unknown>;
      if (
        typeof result.status !== 'number' ||
        typeof result.duration !== 'number' ||
        typeof result.success !== 'boolean' ||
        typeof result.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(result.timestamp))
      ) {
        throw new Error('Gatus result did not match the documented result schema');
      }
      return {
        status: result.status,
        hostname: typeof result.hostname === 'string' ? result.hostname : '',
        duration: result.duration,
        errors: Array.isArray(result.errors) ? result.errors.filter((error): error is string => typeof error === 'string') : undefined,
        conditionResults: Array.isArray(result.conditionResults)
          ? result.conditionResults.filter(
              (condition): condition is GatusConditionResult =>
                !!condition &&
                typeof condition === 'object' &&
                typeof (condition as Record<string, unknown>).condition === 'string' &&
                typeof (condition as Record<string, unknown>).success === 'boolean'
            )
          : undefined,
        success: result.success,
        timestamp: result.timestamp,
      };
    });
    return {
      name: raw.name,
      group: raw.group,
      key: raw.key,
      results,
      events: Array.isArray(raw.events)
        ? raw.events.filter(
            (event): event is GatusEvent =>
              !!event &&
              typeof event === 'object' &&
              typeof (event as Record<string, unknown>).type === 'string' &&
              typeof (event as Record<string, unknown>).timestamp === 'string'
          )
        : undefined,
    };
  });
}

class GatusService {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.GATUS_URL || 'http://localhost:8080';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 5000,
    });
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.client.get('/health');
      return true;
    } catch {
      return false;
    }
  }

  /** Source-derived schema; this response remains unverified against the local engine image. */
  async getAllEndpointStatuses(): Promise<GatusEndpointStatus[]> {
    const { data } = await this.client.get<unknown>('/api/v1/endpoints/statuses');
    return normalizeStatuses(data);
  }

  async hasFreshResults(keys: string[], updatedAt: number): Promise<boolean> {
    const statuses = await this.getAllEndpointStatuses();
    return keys.every((key) => {
      const endpoint = statuses.find((status) => status.key === key);
      return !!endpoint?.results.some((result) => Date.parse(result.timestamp) >= updatedAt);
    });
  }

  async hasNoStackPulseEndpoints(): Promise<boolean> {
    const statuses = await this.getAllEndpointStatuses();
    return statuses.every((status) => !status.key.startsWith('stackpulse_'));
  }

  /**
   * GET /api/v1/endpoints/{key}/statuses?page=N&pageSize=M
   * Returns paginated history for a single endpoint
   */
  async getEndpointHistory(
    key: string,
    page = 1,
    pageSize = 100
  ): Promise<GatusResult[]> {
    const { data } = await this.client.get<unknown>(
      `/api/v1/endpoints/${encodeURIComponent(key)}/statuses`,
      { params: { page, pageSize } }
    );
    const normalized = normalizeStatuses([data]);
    return normalized[0].results;
  }

  /**
   * Fetch ALL available history for an endpoint (all pages)
   * Stops when a page returns fewer results than pageSize
   */
  async getAllHistory(key: string, pageSize = 100): Promise<GatusResult[]> {
    const all: GatusResult[] = [];
    let page = 1;
    while (true) {
      const results = await this.getEndpointHistory(key, page, pageSize);
      all.push(...results);
      if (results.length < pageSize) break;
      page++;
    }
    return all;
  }

  /**
   * Calculate uptime percentage for a window of hours
   */
  async calculateUptime(key: string, windowHours: number): Promise<number> {
    const all = await this.getAllHistory(key);
    if (all.length === 0) return 0;

    const cutoff = new Date(Date.now() - windowHours * 3600 * 1000);
    const inWindow = all.filter((r) => new Date(r.timestamp) >= cutoff);
    if (inWindow.length === 0) return 0;

    const successful = inWindow.filter((r) => r.success).length;
    return Math.round((successful / inWindow.length) * 10000) / 100;
  }

  /**
   * Convert Gatus nanosecond duration to milliseconds
   */
  formatLatency(result: GatusResult): number {
    return nsToMs(result.duration);
  }
}

export default new GatusService();
