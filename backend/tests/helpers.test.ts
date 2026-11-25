import { nsToMs, toGatusKey } from '../src/utils/helpers';

describe('helpers', () => {
  test('nsToMs converts Gatus nanoseconds to milliseconds', () => {
    expect(nsToMs(142000000)).toBe(142);
    expect(nsToMs(0)).toBe(0);
  });

  test('toGatusKey mirrors {group}_{name} with special chars replaced', () => {
    expect(toGatusKey('external', 'httpbin-get')).toBe('external_httpbin-get');
    expect(toGatusKey('Core API', 'Health Check')).toBe('core-api_health-check');
  });
});
