import { describe, it, expect } from 'vitest';
import {
  viewConfig,
  viewConfigKey,
  setConfigKey,
  getNestedValue,
  setNestedValue,
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
});
