import dns from 'dns/promises';
import ipaddr from 'ipaddr.js';
import net from 'net';
import { URL } from 'url';

const BLOCKED_PORTS = new Set([22, 23, 25, 53, 110, 135, 139, 143, 445, 587, 3306, 5432, 6379, 11211, 27017]);

export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

export interface SafeDestination {
  url: URL;
  hostname: string;
  port: number;
  addresses: Array<{ address: string; family: 4 | 6 }>;
}

export function isBlockedIp(value: string): boolean {
  if (!net.isIP(value)) return true;
  try {
    const address = ipaddr.process(value);
    return address.range() !== 'unicast';
  } catch {
    return true;
  }
}

export function validateEndpointUrl(rawUrl: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
  }
  if (url.username || url.password) {
    return { valid: false, error: 'URL credentials are not allowed' };
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    hostname.endsWith('.') ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata'
  ) {
    return { valid: false, error: 'Localhost and non-canonical hostnames are not allowed' };
  }

  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!Number.isInteger(port) || port < 1 || port > 65535 || BLOCKED_PORTS.has(port)) {
    return { valid: false, error: 'Destination port is not allowed' };
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    return { valid: false, error: 'Private or reserved IP destinations are not allowed' };
  }

  return { valid: true };
}

export async function resolveSafeDestination(rawUrl: string): Promise<SafeDestination> {
  const validation = validateEndpointUrl(rawUrl);
  if (!validation.valid) {
    throw new Error(validation.error ?? 'Invalid destination URL');
  }

  const url = new URL(rawUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const records = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIPv4(hostname) ? 4 as const : 6 as const }]
    : await dns.lookup(hostname, { all: true, verbatim: true });

  if (records.length === 0 || records.some((record) => isBlockedIp(record.address))) {
    throw new Error('Destination resolves to a private or reserved address');
  }

  return {
    url,
    hostname,
    port,
    addresses: records.map((record) => ({
      address: record.address,
      family: record.family as 4 | 6,
    })),
  };
}

export async function validateEndpointUrlResolved(rawUrl: string): Promise<UrlValidationResult> {
  try {
    await resolveSafeDestination(rawUrl);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Destination validation failed',
    };
  }
}
