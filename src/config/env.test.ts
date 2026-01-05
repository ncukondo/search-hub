import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { applyEnvVars, ENV_VAR_MAP } from './env';
import { getDefaultConfig } from './defaults';

describe('ENV_VAR_MAP', () => {
  it('contains expected environment variable mappings', () => {
    expect(ENV_VAR_MAP['SEARCH_HUB_PUBMED_API_KEY']).toBe('providers.pubmed.api_key');
    expect(ENV_VAR_MAP['SEARCH_HUB_SCOPUS_API_KEY']).toBe('providers.scopus.api_key');
    expect(ENV_VAR_MAP['SEARCH_HUB_WOS_API_KEY']).toBe('providers.wos.api_key');
    expect(ENV_VAR_MAP['SEARCH_HUB_SESSION_DIR']).toBe('session.directory');
    expect(ENV_VAR_MAP['SEARCH_HUB_LOG_LEVEL']).toBe('log.level');
  });
});

describe('applyEnvVars', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets providers.pubmed.api_key from SEARCH_HUB_PUBMED_API_KEY', () => {
    process.env['SEARCH_HUB_PUBMED_API_KEY'] = 'my-pubmed-key';
    const config = getDefaultConfig();

    const result = applyEnvVars(config);

    expect(result.providers.pubmed.api_key).toBe('my-pubmed-key');
  });

  it('sets log.level from SEARCH_HUB_LOG_LEVEL', () => {
    process.env['SEARCH_HUB_LOG_LEVEL'] = 'debug';
    const config = getDefaultConfig();

    const result = applyEnvVars(config);

    expect(result.log.level).toBe('debug');
  });

  it('sets session.directory from SEARCH_HUB_SESSION_DIR', () => {
    process.env['SEARCH_HUB_SESSION_DIR'] = '/custom/sessions';
    const config = getDefaultConfig();

    const result = applyEnvVars(config);

    expect(result.session.directory).toBe('/custom/sessions');
  });

  it('missing env vars do not affect config', () => {
    delete process.env['SEARCH_HUB_PUBMED_API_KEY'];
    delete process.env['SEARCH_HUB_LOG_LEVEL'];
    const config = getDefaultConfig();
    const originalApiKey = config.providers.pubmed.api_key;
    const originalLogLevel = config.log.level;

    const result = applyEnvVars(config);

    expect(result.providers.pubmed.api_key).toBe(originalApiKey);
    expect(result.log.level).toBe(originalLogLevel);
  });

  it('does not mutate original config', () => {
    process.env['SEARCH_HUB_LOG_LEVEL'] = 'error';
    const config = getDefaultConfig();
    const originalLevel = config.log.level;

    applyEnvVars(config);

    expect(config.log.level).toBe(originalLevel);
  });

  it('applies multiple env vars at once', () => {
    process.env['SEARCH_HUB_PUBMED_API_KEY'] = 'pubmed-key';
    process.env['SEARCH_HUB_SCOPUS_API_KEY'] = 'scopus-key';
    process.env['SEARCH_HUB_LOG_LEVEL'] = 'warn';
    const config = getDefaultConfig();

    const result = applyEnvVars(config);

    expect(result.providers.pubmed.api_key).toBe('pubmed-key');
    expect(result.providers.scopus.api_key).toBe('scopus-key');
    expect(result.log.level).toBe('warn');
  });
});
