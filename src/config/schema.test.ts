import { describe, it, expect } from 'vitest';
import { ConfigSchema, ProviderConfigSchema, type Config } from './schema';

describe('ProviderConfigSchema', () => {
  it('applies default values for empty object', () => {
    const result = ProviderConfigSchema.parse({});

    expect(result.enabled).toBe(true);
    expect(result.rate_limit).toBe(3);
    expect(result.timeout).toBe(30000);
    expect(result.retries).toBe(3);
    expect(result.max_results).toBe(10000);
  });

  it('accepts valid provider config with all fields', () => {
    const input = {
      enabled: false,
      api_key: 'test-key',
      email: 'test@example.com',
      rate_limit: 10,
      timeout: 60000,
      retries: 5,
      max_results: 5000,
      inst_token: 'inst-token',
    };

    const result = ProviderConfigSchema.parse(input);
    expect(result).toEqual(input);
  });

  it('validates email format', () => {
    expect(() => {
      ProviderConfigSchema.parse({ email: 'invalid-email' });
    }).toThrow();
  });

  it('validates rate_limit is positive', () => {
    expect(() => {
      ProviderConfigSchema.parse({ rate_limit: 0 });
    }).toThrow();

    expect(() => {
      ProviderConfigSchema.parse({ rate_limit: -1 });
    }).toThrow();
  });

  it('validates retries is non-negative integer', () => {
    expect(() => {
      ProviderConfigSchema.parse({ retries: -1 });
    }).toThrow();

    // 0 is valid
    const result = ProviderConfigSchema.parse({ retries: 0 });
    expect(result.retries).toBe(0);
  });
});

describe('ConfigSchema', () => {
  it('returns full default config for empty object', () => {
    const result = ConfigSchema.parse({});

    // Session defaults
    expect(result.session.directory).toBe('~/.search-hub/sessions');

    // Log defaults
    expect(result.log.level).toBe('info');

    // Output defaults
    expect(result.output.color).toBe(true);
    expect(result.output.progress_bar).toBe(true);

    // Provider defaults
    expect(result.providers.pubmed.enabled).toBe(true);
    expect(result.providers.eric.enabled).toBe(true);
    expect(result.providers.arxiv.enabled).toBe(true);
    expect(result.providers.scopus.enabled).toBe(true);
    expect(result.providers.wos.enabled).toBe(true);
    expect(result.providers.embase.enabled).toBe(true);

    // Integration defaults
    expect(result.integration.reference_manager.enabled).toBe(true);
    expect(result.integration.reference_manager.command).toBe('ref');
    expect(result.integration.reference_manager.auto_register).toBe(false);
    expect(result.integration.reference_manager.with_abstracts).toBe(false);
  });

  it('validates log level enum', () => {
    expect(() => {
      ConfigSchema.parse({ log: { level: 'invalid' } });
    }).toThrow();

    // Valid levels
    for (const level of ['debug', 'info', 'warn', 'error']) {
      const result = ConfigSchema.parse({ log: { level } });
      expect(result.log.level).toBe(level);
    }
  });

  it('deep merges partial config with defaults', () => {
    const input = {
      session: { directory: '/custom/path' },
      providers: {
        pubmed: { api_key: 'my-key', rate_limit: 10 },
      },
    };

    const result = ConfigSchema.parse(input);

    // Custom values preserved
    expect(result.session.directory).toBe('/custom/path');
    expect(result.providers.pubmed.api_key).toBe('my-key');
    expect(result.providers.pubmed.rate_limit).toBe(10);

    // Other defaults still applied
    expect(result.log.level).toBe('info');
    expect(result.providers.pubmed.timeout).toBe(30000);
    expect(result.providers.eric.enabled).toBe(true);
  });

  it('exported Config type is inferred from schema', () => {
    const config: Config = ConfigSchema.parse({});

    // TypeScript compilation verifies the type is correct
    expect(config.session.directory).toBeDefined();
    expect(config.log.level).toBeDefined();
    expect(config.providers.pubmed).toBeDefined();
  });
});
