import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigSchema, getDefaultConfig } from './index';
import type { Config, LoadConfigOptions } from './index';

describe('config public API', () => {
  it('exports loadConfig function', () => {
    expect(typeof loadConfig).toBe('function');
  });

  it('exports ConfigSchema', () => {
    expect(ConfigSchema).toBeDefined();
    expect(typeof ConfigSchema.parse).toBe('function');
  });

  it('exports getDefaultConfig function', () => {
    expect(typeof getDefaultConfig).toBe('function');
    const config = getDefaultConfig();
    expect(config).toBeDefined();
    expect(config.log.level).toBe('info');
  });

  it('Config type is usable', () => {
    const config: Config = getDefaultConfig();
    expect(config.session.directory).toBeDefined();
    expect(config.providers.pubmed.rate_limit).toBeDefined();
  });

  it('LoadConfigOptions type is usable', () => {
    const options: LoadConfigOptions = {
      globalConfigPath: '/path/to/global.toml',
      localConfigPath: '/path/to/local.toml',
    };
    expect(options.globalConfigPath).toBe('/path/to/global.toml');
  });
});
