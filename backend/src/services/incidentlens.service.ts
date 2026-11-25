import { MonitoringFreshness, TrustPulseSnapshot } from './trustpulse.service';

export type FailureCategory =
  | 'no_current_failure'
  | 'authentication_or_authorization'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'bad_gateway'
  | 'service_unavailable'
  | 'gateway_timeout'
  | 'dns_resolution'
  | 'connection_refused'
  | 'connection'
  | 'request_timeout'
  | 'tls_validation'
  | 'certificate_expired'
  | 'functional_assertion'
  | 'stale_monitoring'
  | 'unknown';

export interface IncidentLensEvidence {
  success: boolean | null;
  httpStatus: number | null;
  failureClassification: string | null;
  failureDetail: string | null;
  checkedAt: string | null;
  freshness: MonitoringFreshness;
  monitoringCoveragePercent: number | null;
  tlsExpiresAt: string | null;
  tlsDaysUntilExpiry: number | null;
}

interface DiagnosticRule {
  category: FailureCategory;
  possibleCauses: string[];
  recommendedSteps: string[];
}

const STATUS_RULES: Record<number, DiagnosticRule> = {
  401: {
    category: 'authentication_or_authorization',
    possibleCauses: ['The endpoint may require credentials or a different authentication scheme.'],
    recommendedSteps: ['Check the endpoint authentication policy and configured authorization headers.'],
  },
  403: {
    category: 'authentication_or_authorization',
    possibleCauses: ['The request may be blocked by an access policy, WAF, or insufficient permissions.'],
    recommendedSteps: ['Review access rules, IP allowlists, and authorization policy for the monitoring request.'],
  },
  404: {
    category: 'not_found',
    possibleCauses: ['The configured path may not exist or may have moved.'],
    recommendedSteps: ['Confirm the URL path and route deployment.'],
  },
  429: {
    category: 'rate_limited',
    possibleCauses: ['The endpoint or an upstream service may be rate limiting this monitoring location.'],
    recommendedSteps: ['Review rate limits and retry policy; avoid increasing check frequency until understood.'],
  },
  500: {
    category: 'server_error',
    possibleCauses: ['The server reported an internal error or an application dependency failed.'],
    recommendedSteps: ['Inspect server logs and dependency health for the check timestamp.'],
  },
  502: {
    category: 'bad_gateway',
    possibleCauses: ['A gateway or reverse proxy may not have received a valid upstream response.'],
    recommendedSteps: ['Check gateway logs, upstream availability, and proxy routing.'],
  },
  503: {
    category: 'service_unavailable',
    possibleCauses: ['The service may be in maintenance or unable to serve requests.'],
    recommendedSteps: ['Check service health, maintenance state, and dependency capacity.'],
  },
  504: {
    category: 'gateway_timeout',
    possibleCauses: ['A gateway may have timed out waiting for an upstream service.'],
    recommendedSteps: ['Inspect gateway timeout logs and upstream latency.'],
  },
};

class IncidentLensService {
  diagnoseFromMonitoring(
    check: {
      success: boolean;
      httpStatus: number | null;
      failureClassification: string | null;
      failureDetail: string | null;
      checkedAt: string;
      tlsExpiresAt: string | null;
    } | null,
    trustPulse: Pick<TrustPulseSnapshot, 'freshness' | 'monitoringCoveragePercent'>,
    tls?: { expiresAt: string | null; daysUntilExpiry: number | null } | null
  ): Record<string, unknown> {
    const tlsExpiresAt = tls?.expiresAt ?? check?.tlsExpiresAt ?? null;
    const tlsDaysUntilExpiry = tls?.daysUntilExpiry ??
      (tlsExpiresAt ? Math.floor((Date.parse(tlsExpiresAt) - Date.now()) / 86_400_000) : null);
    return this.diagnose({
      success: check?.success ?? null,
      httpStatus: check?.httpStatus ?? null,
      failureClassification: check?.failureClassification ?? null,
      failureDetail: check?.failureDetail ?? null,
      checkedAt: check?.checkedAt ?? null,
      freshness: trustPulse.freshness,
      monitoringCoveragePercent: trustPulse.monitoringCoveragePercent,
      tlsExpiresAt,
      tlsDaysUntilExpiry,
    });
  }

  diagnose(evidence: IncidentLensEvidence): Record<string, unknown> {
    const rule = this.selectRule(evidence);
    const evidenceLimitations = [
      'IncidentLens uses deterministic rules over monitoring evidence; it does not inspect application or server logs.',
      'A probe from one monitoring location cannot establish a global outage or identify an exact root cause.',
    ];
    if (evidence.freshness === 'stale' || evidence.freshness === 'engine_unavailable') {
      evidenceLimitations.push('The last recorded service result may not describe the current service state.');
    }
    if (evidence.monitoringCoveragePercent !== null && evidence.monitoringCoveragePercent < 100) {
      evidenceLimitations.push('Missing scheduled results reduce confidence in conclusions drawn from observed checks.');
    }

    return {
      observedEvidence: evidence,
      failureCategory: rule.category,
      possibleCauses: rule.possibleCauses,
      recommendedTroubleshootingSteps: rule.recommendedSteps,
      evidenceLimitations,
      rootCause: null,
      diagnosticConfidence: evidence.success === false ? 'limited' : 'insufficient',
    };
  }

  private selectRule(evidence: IncidentLensEvidence): DiagnosticRule {
    if (
      evidence.freshness === 'stale' ||
      evidence.freshness === 'engine_unavailable' ||
      (evidence.success === null &&
        evidence.monitoringCoveragePercent !== null &&
        evidence.monitoringCoveragePercent < 100)
    ) {
      return {
        category: 'stale_monitoring',
        possibleCauses: [
          'The monitoring worker may have been unavailable or delayed.',
          'Scheduled checks may be missing, or the latest result may be stale.',
        ],
        recommendedSteps: [
          'Check TrustPulse engine availability, freshness, coverage, and interruption history.',
          'Wait for a new scheduled result before drawing conclusions about current service availability.',
        ],
      };
    }
    if (evidence.tlsDaysUntilExpiry !== null && evidence.tlsDaysUntilExpiry <= 0) {
      return {
        category: 'certificate_expired',
        possibleCauses: ['The inspected TLS certificate is expired.'],
        recommendedSteps: ['Renew and deploy the certificate, then verify the served certificate chain and hostname.'],
      };
    }
    if (evidence.failureClassification === 'functional_assertion') {
      return {
        category: 'functional_assertion',
        possibleCauses: ['The HTTP request succeeded, but the response did not contain the configured expected content.'],
        recommendedSteps: ['Confirm the response body and expected-content setting for the endpoint.'],
      };
    }
    if (evidence.failureClassification === 'dns') {
      return {
        category: 'dns_resolution',
        possibleCauses: ['The hostname may not resolve from this monitoring environment, or DNS may be temporarily unavailable.'],
        recommendedSteps: ['Check authoritative DNS records, resolver health, and recent DNS changes.'],
      };
    }
    if (evidence.failureClassification === 'timeout') {
      return {
        category: 'request_timeout',
        possibleCauses: ['The endpoint or network path may be responding more slowly than the configured timeout.'],
        recommendedSteps: ['Compare endpoint latency with server logs and inspect network or upstream latency.'],
      };
    }
    if (evidence.failureClassification === 'tls') {
      return {
        category: 'tls_validation',
        possibleCauses: ['The TLS handshake, certificate trust, or hostname validation may have failed.'],
        recommendedSteps: ['Inspect certificate validity, hostname coverage, and the served certificate chain.'],
      };
    }
    if (evidence.failureClassification === 'connection') {
      const refused = /ECONNREFUSED|connection refused/i.test(evidence.failureDetail ?? '');
      return {
        category: refused ? 'connection_refused' : 'connection',
        possibleCauses: [refused
          ? 'The destination host refused the connection on the configured port.'
          : 'A network or transport error prevented the connection from completing.'],
        recommendedSteps: ['Check listener availability, destination port, firewall rules, and recent network changes.'],
      };
    }
    if (evidence.httpStatus !== null && STATUS_RULES[evidence.httpStatus]) {
      return STATUS_RULES[evidence.httpStatus];
    }
    if (evidence.success === true) {
      return {
        category: 'no_current_failure',
        possibleCauses: [],
        recommendedSteps: [],
      };
    }
    return {
      category: 'unknown',
      possibleCauses: ['Available monitoring evidence is insufficient to classify the failure.'],
      recommendedSteps: ['Collect a fresh check and correlate its timestamp with service and network logs.'],
    };
  }
}

export default new IncidentLensService();

