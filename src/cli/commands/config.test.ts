import { describe, it, expect } from 'vitest';
import {
  viewConfig,
  viewConfigKey,
  setConfigKey,
  getNestedValue,
  setNestedValue,
  resolveWriteScope,
  checkSecretKeyWarning,
  formatShowOrigin,
  viewConfigFiltered,
  formatEnvVars,
  type WriteScope,
} from './config.js';
import type { Config } from '../../config/index.js';

const mockConfig: Config = {
  session: {
    directory: '/test/sessions',
  },
  log: {
    level: 'info',
  },
  output: {
    color: true,
    progress_bar: true,
  },
  providers: {
    pubmed: {
      enabled: true,
      api_key: 'test-key',
      email: 'test@example.com',
      rate_limit: 10,
      timeout: 30000,
      retries: 3,
      max_results: 10000,
      inst_token: '',
    },
    eric: {
      enabled: false,
      api_key: '',
      email: '',
      rate_limit: 10,
      timeout: 30000,
      retries: 3,
      max_results: 2000,
      inst_token: '',
    },
    arxiv: {
      enabled: true,
      api_key: '',
      email: '',
      rate_limit: 1,
      timeout: 30000,
      retries: 3,
      max_results: 10000,
      inst_token: '',
    },
    scopus: {
      enabled: false,
      api_key: '',
      email: '',
      inst_token: '',
      rate_limit: 5,
      timeout: 30000,
      retries: 3,
      max_results: 5000,
    },
    wos: {
      enabled: false,
      api_key: '',
      email: '',
      inst_token: '',
      rate_limit: 1,
      timeout: 30000,
      retries: 3,
      max_results: 10000,
    },
    embase: {
      enabled: false,
      api_key: '',
      email: '',
      inst_token: '',
      rate_limit: 1,
      timeout: 30000,
      retries: 3,
      max_results: 10000,
    },
  },
  fulltext: {
    enabled: true,
    auto_convert_markdown: true,
    auto_attach_on_register: true,
    sources: {
      unpaywall_email: '',
      core_api_key: '',
      ncbi_email: '',
      ncbi_tool: 'search-hub',
      prefer_sources: ['pmc', 'arxiv', 'unpaywall', 'core'],
    },
    download: {
      concurrent_downloads: 3,
      retry_attempts: 3,
    },
  },
  integration: {
    reference_manager: {
      enabled: false,
      command: 'ref',
      auto_register: false,
      with_abstracts: false,
    },
  },
};

describe('config command helpers', () => {
  describe('getNestedValue', () => {
    it('should get top-level value', () => {
      const result = getNestedValue(mockConfig, 'session');
      expect(result).toEqual({ directory: '/test/sessions' });
    });

    it('should get nested value with dot notation', () => {
      const result = getNestedValue(mockConfig, 'providers.pubmed.enabled');
      expect(result).toBe(true);
    });

    it('should get deeply nested value', () => {
      const result = getNestedValue(mockConfig, 'providers.pubmed.api_key');
      expect(result).toBe('test-key');
    });

    it('should return undefined for non-existent key', () => {
      const result = getNestedValue(mockConfig, 'nonexistent.key');
      expect(result).toBeUndefined();
    });

    it('should return undefined for partially valid path', () => {
      const result = getNestedValue(mockConfig, 'providers.pubmed.nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('setNestedValue', () => {
    it('should set top-level value', () => {
      const obj = { a: 1, b: 2 };
      setNestedValue(obj, 'a', 10);
      expect(obj.a).toBe(10);
    });

    it('should set nested value', () => {
      const obj = { a: { b: { c: 1 } } };
      setNestedValue(obj, 'a.b.c', 100);
      expect(obj.a.b.c).toBe(100);
    });

    it('should create intermediate objects if needed', () => {
      const obj: Record<string, unknown> = { a: 1 };
      setNestedValue(obj, 'b.c.d', 'new');
      expect((obj['b'] as { c: { d: string } }).c.d).toBe('new');
    });
  });

  describe('viewConfig', () => {
    it('should format config as readable string', () => {
      const result = viewConfig(mockConfig);
      expect(result).toContain('session.directory');
      expect(result).toContain('/test/sessions');
      expect(result).toContain('providers.pubmed.enabled');
      expect(result).toContain('true');
    });

    it('should include optional provider keys in output', () => {
      const result = viewConfig(mockConfig);
      expect(result).toContain('providers.pubmed.email');
      expect(result).toContain('providers.pubmed.api_key');
      expect(result).toContain('providers.scopus.inst_token');
    });
  });

  describe('viewConfigKey', () => {
    it('should return formatted value for existing key', () => {
      const result = viewConfigKey(mockConfig, 'providers.pubmed.enabled');
      expect(result.success).toBe(true);
      expect(result.value).toBe('true');
    });

    it('should return object as JSON for object keys', () => {
      const result = viewConfigKey(mockConfig, 'session');
      expect(result.success).toBe(true);
      expect(result.value).toContain('directory');
    });

    it('should return error for non-existent key', () => {
      const result = viewConfigKey(mockConfig, 'nonexistent.key');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('setConfigKey', () => {
    it('should set string value', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.pubmed.api_key', 'new-key');
      expect(result.success).toBe(true);
      expect(config.providers.pubmed.api_key).toBe('new-key');
    });

    it('should set boolean value from string "true"', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.eric.enabled', 'true');
      expect(result.success).toBe(true);
      expect(config.providers.eric.enabled).toBe(true);
    });

    it('should set boolean value from string "false"', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.pubmed.enabled', 'false');
      expect(result.success).toBe(true);
      expect(config.providers.pubmed.enabled).toBe(false);
    });

    it('should set numeric value from string', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.pubmed.rate_limit', '20');
      expect(result.success).toBe(true);
      expect(config.providers.pubmed.rate_limit).toBe(20);
    });

    it('should return error for invalid key path', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, '', 'value');
      expect(result.success).toBe(false);
    });

    it('should set providers.pubmed.email', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.pubmed.email', 'new@example.com');
      expect(result.success).toBe(true);
      expect(config.providers.pubmed.email).toBe('new@example.com');
    });

    it('should set providers.pubmed.api_key', () => {
      const config = structuredClone(mockConfig);
      const result = setConfigKey(config, 'providers.pubmed.api_key', 'my-new-key');
      expect(result.success).toBe(true);
      expect(config.providers.pubmed.api_key).toBe('my-new-key');
    });
  });

  describe('resolveWriteScope', () => {
    it('should return global when --global is specified', () => {
      const result = resolveWriteScope({ global: true, local: false, insideProject: false });
      expect(result).toEqual({ scope: 'global' });
    });

    it('should return local when --local is specified', () => {
      const result = resolveWriteScope({ global: false, local: true, insideProject: true });
      expect(result).toEqual({ scope: 'local' });
    });

    it('should default to local when inside a project', () => {
      const result = resolveWriteScope({ global: false, local: false, insideProject: true });
      expect(result).toEqual({ scope: 'local' });
    });

    it('should default to global when outside a project', () => {
      const result = resolveWriteScope({ global: false, local: false, insideProject: false });
      expect(result).toEqual({ scope: 'global' });
    });

    it('should error when --local used outside a project', () => {
      const result = resolveWriteScope({ global: false, local: true, insideProject: false });
      expect(result).toEqual({
        scope: 'error',
        error: expect.stringContaining('.search-hub/'),
      });
    });

    it('should error when --global and --local are both specified', () => {
      const result = resolveWriteScope({ global: true, local: true, insideProject: true });
      expect(result).toEqual({
        scope: 'error',
        error: expect.stringContaining('mutually exclusive'),
      });
    });
  });

  describe('checkSecretKeyWarning', () => {
    it('should warn when writing api_key to local config', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.api_key', 'local');
      expect(warning).toContain('--global');
    });

    it('should warn when writing inst_token to local config', () => {
      const warning = checkSecretKeyWarning('providers.scopus.inst_token', 'local');
      expect(warning).toContain('--global');
    });

    it('should warn when writing email to local config', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.email', 'local');
      expect(warning).toContain('--global');
    });

    it('should not warn for non-secret keys', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.enabled', 'local');
      expect(warning).toBeNull();
    });

    it('should not warn when writing secrets to global config', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.api_key', 'global');
      expect(warning).toBeNull();
    });
  });

  describe('formatShowOrigin', () => {
    it('should format value with origin info', () => {
      const result = formatShowOrigin(
        'providers.pubmed.api_key',
        'test-key',
        'global',
        '/home/user/.config/search-hub/config.toml',
      );
      expect(result).toBe(
        'global\t/home/user/.config/search-hub/config.toml\tproviders.pubmed.api_key = test-key',
      );
    });

    it('should format env origin', () => {
      const result = formatShowOrigin(
        'providers.pubmed.api_key',
        'env-val',
        'env',
        'SEARCH_HUB_PUBMED_API_KEY',
      );
      expect(result).toBe('env\tSEARCH_HUB_PUBMED_API_KEY\tproviders.pubmed.api_key = env-val');
    });

    it('should format default origin', () => {
      const result = formatShowOrigin('log.level', 'info', 'default', '');
      expect(result).toBe('default\t\tlog.level = info');
    });
  });

  describe('viewConfigFiltered', () => {
    it('should show only keys from the provided partial config', () => {
      const partial: Record<string, unknown> = {
        providers: { pubmed: { api_key: 'my-key' } },
      };
      const result = viewConfigFiltered(partial);
      expect(result).toBe('providers.pubmed.api_key = my-key');
    });

    it('should return empty string for empty config', () => {
      const result = viewConfigFiltered({});
      expect(result).toBe('');
    });
  });

  describe('formatEnvVars', () => {
    it('should format env var map as table', () => {
      const result = formatEnvVars();
      expect(result).toContain('SEARCH_HUB_PUBMED_API_KEY');
      expect(result).toContain('providers.pubmed.api_key');
      expect(result).toContain('→');
    });

    it('should include all mapped environment variables', () => {
      const result = formatEnvVars();
      expect(result).toContain('SEARCH_HUB_SCOPUS_API_KEY');
      expect(result).toContain('SEARCH_HUB_LOG_LEVEL');
      expect(result).toContain('SEARCH_HUB_SESSION_DIR');
    });
  });
});
