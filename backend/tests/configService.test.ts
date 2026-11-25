import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'yaml';

describe('Gatus config serialization and rollback', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stackpulse-config-'));
  const configPath = path.join(directory, 'config.yaml');
  const originalEnabled = process.env.GATUS_DYNAMIC_CONFIG_ENABLED;
  const originalConfigPath = process.env.GATUS_CONFIG_PATH;

  beforeAll(() => {
    process.env.GATUS_DYNAMIC_CONFIG_ENABLED = 'true';
    process.env.GATUS_CONFIG_PATH = configPath;
  });

  afterAll(() => {
    if (originalEnabled === undefined) delete process.env.GATUS_DYNAMIC_CONFIG_ENABLED;
    else process.env.GATUS_DYNAMIC_CONFIG_ENABLED = originalEnabled;
    if (originalConfigPath === undefined) delete process.env.GATUS_CONFIG_PATH;
    else process.env.GATUS_CONFIG_PATH = originalConfigPath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('serializes endpoint config through YAML and uses immutable keys, not raw labels', async () => {
    fs.writeFileSync(configPath, 'web:\n  port: 8080\nendpoints: []\n', 'utf8');
    const configService = require('../src/services/config.service').default;
    const changed = await configService.writeFromEndpoints([{
      id: '54fd35a1-35a5-43ca-b24b-7ec80ef5d0b1',
      gatus_key: 'stackpulse_54fd35a135a543cab24b7ec80ef5d0b1',
      name: 'ignored: "raw"\nendpoints: []',
      url: 'http://8.8.8.8/health?label=%22%0A',
      interval_seconds: 30,
      enabled: 1,
    }]);

    expect(changed).toBe(true);
    const result = parse(fs.readFileSync(configPath, 'utf8'));
    expect(result.endpoints).toEqual([expect.objectContaining({
      name: '54fd35a135a543cab24b7ec80ef5d0b1',
      group: 'stackpulse',
      url: 'http://8.8.8.8/health?label=%22%0A',
    })]);
  });

  test('restores the previous config when an application verifier fails', async () => {
    const previous = 'web:\n  port: 8080\nendpoints: []\n';
    fs.writeFileSync(configPath, previous, 'utf8');
    const configService = require('../src/services/config.service').default;
    await expect(configService.writeFromEndpoints([{
      id: '54fd35a1-35a5-43ca-b24b-7ec80ef5d0b1',
      gatus_key: 'stackpulse_54fd35a135a543cab24b7ec80ef5d0b1',
      name: 'safe',
      url: 'http://8.8.8.8/',
      interval_seconds: 30,
      enabled: 1,
    }], async () => false, 0)).rejects.toThrow('Gatus did not produce fresh results');
    expect(fs.readFileSync(configPath, 'utf8')).toBe(previous);
  });
});
