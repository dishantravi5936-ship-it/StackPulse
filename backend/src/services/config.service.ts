import fs from 'fs';
import path from 'path';
import ipaddr from 'ipaddr.js';
import net from 'net';
import { parse, stringify } from 'yaml';
import { logger } from '../utils/logger';

export interface ConfigEndpoint {
  id: string;
  gatus_key: string;
  name: string;
  url: string;
  interval_seconds: number;
  enabled: number;
}

export interface ConfigReloadObserver {
  started(): string;
  finished(interruptionId: string): void;
}

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

class ConfigService {
  private mutex = new AsyncMutex();

  getConfigPath(): string {
    return path.resolve(process.env.GATUS_CONFIG_PATH || '../monitoring/config/config.yaml');
  }

  isDynamicConfigEnabled(): boolean {
    return process.env.GATUS_DYNAMIC_CONFIG_ENABLED === 'true';
  }

  async writeFromEndpoints(
    endpoints: ConfigEndpoint[],
    verifyApplied?: (updatedAt: number) => Promise<boolean>,
    timeoutMs = 0,
    reloadObserver?: ConfigReloadObserver
  ): Promise<boolean> {
    if (!this.isDynamicConfigEnabled()) return false;
    return this.mutex.run(async () => {
      const pathToConfig = this.getConfigPath();
      const hadPreviousConfig = fs.existsSync(pathToConfig);
      const previousContents = hadPreviousConfig
        ? fs.readFileSync(pathToConfig, 'utf8')
        : '';
      let interruptionId: string | null = null;
      try {
        const document = previousContents ? parse(previousContents) : {};
        if (!document || typeof document !== 'object' || Array.isArray(document)) {
          throw new Error('Existing Gatus configuration must be a YAML mapping');
        }
        const normalizedEndpoints = endpoints
          .filter((endpoint) => endpoint.enabled === 1)
          .map((endpoint) => this.toGatusEndpoint(endpoint));
        Object.assign(document, { endpoints: normalizedEndpoints });
        const updatedConfig = stringify(document);
        if (updatedConfig === previousContents) return false;
        interruptionId = reloadObserver?.started() ?? null;
        this.atomicWrite(pathToConfig, updatedConfig);
        if (verifyApplied && !(await this.waitUntilApplied(verifyApplied, timeoutMs))) {
          throw new Error('Gatus did not produce fresh results for the updated endpoint configuration');
        }
        logger.info('Gatus config atomically written', {
          path: pathToConfig,
          endpointCount: normalizedEndpoints.length,
        });
        return true;
      } catch (error) {
        if (hadPreviousConfig) this.atomicWrite(pathToConfig, previousContents);
        else if (fs.existsSync(pathToConfig)) fs.unlinkSync(pathToConfig);
        throw error;
      } finally {
        if (interruptionId) reloadObserver?.finished(interruptionId);
      }
    });
  }

  private async waitUntilApplied(
    verifyApplied: (updatedAt: number) => Promise<boolean>,
    timeoutMs: number
  ): Promise<boolean> {
    const updatedAt = Date.now();
    const deadline = updatedAt + timeoutMs;
    do {
      if (await verifyApplied(updatedAt)) return true;
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    } while (Date.now() < deadline);
    return false;
  }

  private toGatusEndpoint(endpoint: ConfigEndpoint): Record<string, unknown> {
    const parsed = new URL(endpoint.url);
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    if (!net.isIP(hostname)) {
      throw new Error('Gatus dynamic checks require an IP-literal destination to prevent DNS rebinding');
    }
    try {
      if (ipaddr.process(hostname).range() !== 'unicast') {
        throw new Error('Gatus dynamic checks cannot target private or reserved address ranges');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('cannot target')) throw error;
      throw new Error('Gatus destination IP is not valid');
    }

    return {
      name: endpoint.id.replace(/-/g, ''),
      group: 'stackpulse',
      url: endpoint.url,
      interval: `${endpoint.interval_seconds}s`,
      client: {
        timeout: '8s',
        'ignore-redirect': true,
      },
      conditions: ['[STATUS] >= 200', '[STATUS] < 300'],
    };
  }

  private atomicWrite(destination: string, contents: string): void {
    const directory = path.dirname(destination);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.config.yaml.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    try {
      fs.renameSync(temporary, destination);
    } catch (error) {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      throw error;
    }
  }
}

export default new ConfigService();
