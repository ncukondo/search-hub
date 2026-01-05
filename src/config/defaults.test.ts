import { describe, it, expect } from 'vitest';
import { getDefaultConfig, DEFAULT_CONFIG } from './defaults';
import { ConfigSchema } from './schema';

describe('DEFAULT_CONFIG', () => {
  it('is a valid Config object', () => {
    // Should not throw
    const result = ConfigSchema.parse(DEFAULT_CONFIG);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it('has all required top-level sections', () => {
    expect(DEFAULT_CONFIG.session).toBeDefined();
    expect(DEFAULT_CONFIG.log).toBeDefined();
    expect(DEFAULT_CONFIG.output).toBeDefined();
    expect(DEFAULT_CONFIG.providers).toBeDefined();
    expect(DEFAULT_CONFIG.integration).toBeDefined();
  });
});

describe('getDefaultConfig', () => {
  it('returns a valid Config object', () => {
    const config = getDefaultConfig();

    // Should not throw
    const result = ConfigSchema.parse(config);
    expect(result).toBeDefined();
  });

  it('has all required fields present', () => {
    const config = getDefaultConfig();

    // Session
    expect(config.session.directory).toBe('~/.search-hub/sessions');

    // Log
    expect(config.log.level).toBe('info');

    // Output
    expect(config.output.color).toBe(true);
    expect(config.output.progress_bar).toBe(true);

    // Providers
    expect(config.providers.pubmed).toBeDefined();
    expect(config.providers.eric).toBeDefined();
    expect(config.providers.arxiv).toBeDefined();
    expect(config.providers.scopus).toBeDefined();
    expect(config.providers.wos).toBeDefined();
    expect(config.providers.embase).toBeDefined();

    // Integration
    expect(config.integration.reference_manager.enabled).toBe(true);
    expect(config.integration.reference_manager.command).toBe('ref');
  });

  it('returns a new object each time (not a reference)', () => {
    const config1 = getDefaultConfig();
    const config2 = getDefaultConfig();

    expect(config1).not.toBe(config2);
    expect(config1).toEqual(config2);

    // Mutating one should not affect the other
    config1.log.level = 'debug';
    expect(config2.log.level).toBe('info');
  });
});
