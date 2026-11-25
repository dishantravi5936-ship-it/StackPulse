import { isBlockedIp, validateEndpointUrl } from '../src/utils/urlValidator';

describe('validateEndpointUrl', () => {
  test('allows valid HTTPS URLs', () => {
    expect(validateEndpointUrl('https://api.github.com/health').valid).toBe(true);
    expect(validateEndpointUrl('http://example.com:8080/status').valid).toBe(true);
  });

  test('blocks localhost', () => {
    expect(validateEndpointUrl('http://localhost:3000').valid).toBe(false);
    expect(validateEndpointUrl('http://127.0.0.1:8080').valid).toBe(false);
  });

  test('blocks private RFC1918 ranges', () => {
    expect(validateEndpointUrl('http://192.168.1.1').valid).toBe(false);
    expect(validateEndpointUrl('http://10.0.0.1').valid).toBe(false);
    expect(validateEndpointUrl('http://172.16.0.1').valid).toBe(false);
  });

  test('blocks AWS metadata endpoint', () => {
    expect(validateEndpointUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
  });

  test('blocks non-HTTP protocols', () => {
    expect(validateEndpointUrl('ftp://example.com').valid).toBe(false);
    expect(validateEndpointUrl('file:///etc/passwd').valid).toBe(false);
  });

  test('rejects malformed URLs', () => {
    expect(validateEndpointUrl('not-a-url').valid).toBe(false);
    expect(validateEndpointUrl('').valid).toBe(false);
  });

  test('rejects embedded credentials, metadata names, reserved ports, and IPv6 local ranges', () => {
    expect(validateEndpointUrl('https://user:pass@example.com/').valid).toBe(false);
    expect(validateEndpointUrl('http://metadata.google.internal/').valid).toBe(false);
    expect(validateEndpointUrl('http://example.com:5432/').valid).toBe(false);
    expect(validateEndpointUrl('http://[::1]/').valid).toBe(false);
    expect(validateEndpointUrl('http://[fd00::1]/').valid).toBe(false);
    expect(validateEndpointUrl('http://[fe80::1]/').valid).toBe(false);
  });

  test('classifies public and special-use IPv4/IPv6 ranges', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('2606:4700:4700::1111')).toBe(false);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('198.18.0.1')).toBe(true);
    expect(isBlockedIp('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedIp('2001:db8::1')).toBe(true);
  });
});

