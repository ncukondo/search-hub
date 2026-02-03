/**
 * E2E Tests for `search-hub config` command
 *
 * Tests the config command functionality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupE2EContext, type E2EContext, createConfig } from '../e2e-helpers.js';
import { getDefaultConfig, loadConfig } from '../../config/index.js';
import {
  viewConfig,
  viewConfigKey,
  setConfigKey,
  getNestedValue,
  setNestedValue,
} from './config.js';

describe('search-hub config E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('config - shows full config', () => {
    it('should display all configuration values', () => {
      const config = getDefaultConfig();
      const output = viewConfig(config);

      // Should contain main sections
      expect(output).toContain('session.directory');
      expect(output).toContain('log.level');
      expect(output).toContain('output.color');
      expect(output).toContain('output.progress_bar');

      // Should contain provider settings
      expect(output).toContain('providers.pubmed.enabled');
      expect(output).toContain('providers.eric.enabled');
      expect(output).toContain('providers.arxiv.enabled');
      expect(output).toContain('providers.scopus.enabled');

      // Should contain integration settings
      expect(output).toContain('integration.reference_manager.enabled');
      expect(output).toContain('integration.reference_manager.command');
    });

    it('should display values in readable format', () => {
      const config = getDefaultConfig();
      const output = viewConfig(config);

      // Check format: "key = value"
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          expect(line).toMatch(/^\S+\s+=\s+.*/);
        }
      }
    });
  });

  describe('config - shows specific key', () => {
    it('should display log.level value', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'log.level');

      expect(result.success).toBe(true);
      expect(result.value).toBe('info');
    });

    it('should display providers.pubmed.enabled value', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'providers.pubmed.enabled');

      expect(result.success).toBe(true);
      expect(result.value).toBe('true');
    });

    it('should display output.color value', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'output.color');

      expect(result.success).toBe(true);
      expect(result.value).toBe('true');
    });

    it('should display nested provider config', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'providers.pubmed.rate_limit');

      expect(result.success).toBe(true);
      expect(result.value).toBe('3');
    });

    it('should display integration settings', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'integration.reference_manager.command');

      expect(result.success).toBe(true);
      expect(result.value).toBe('ref');
    });
  });

  describe('config - sets value', () => {
    it('should set log.level to debug', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, 'log.level', 'debug');

      expect(result.success).toBe(true);
      expect(config.log.level).toBe('debug');
    });

    it('should set boolean value correctly', () => {
      const config = getDefaultConfig();

      // Set to false
      const result1 = setConfigKey(config, 'output.color', 'false');
      expect(result1.success).toBe(true);
      expect(config.output.color).toBe(false);

      // Set back to true
      const result2 = setConfigKey(config, 'output.color', 'true');
      expect(result2.success).toBe(true);
      expect(config.output.color).toBe(true);
    });

    it('should set numeric value correctly', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, 'providers.pubmed.rate_limit', '5');

      expect(result.success).toBe(true);
      expect(config.providers.pubmed.rate_limit).toBe(5);
    });

    it('should set string value correctly', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, 'integration.reference_manager.command', 'references');

      expect(result.success).toBe(true);
      expect(config.integration.reference_manager.command).toBe('references');
    });

    it('should set provider enabled status', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, 'providers.scopus.enabled', 'false');

      expect(result.success).toBe(true);
      expect(config.providers.scopus.enabled).toBe(false);
    });
  });

  describe('config - error for invalid key', () => {
    it('should return error for non-existent key', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'nonexistent.key');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('nonexistent.key');
    });

    it('should return error for partially invalid key', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'providers.invalid.enabled');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error for empty key when setting', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, '', 'value');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });
  });

  describe('nested value utilities', () => {
    it('getNestedValue should retrieve deep values', () => {
      const obj = {
        a: {
          b: {
            c: 'deep value',
          },
        },
      };

      expect(getNestedValue(obj, 'a.b.c')).toBe('deep value');
      expect(getNestedValue(obj, 'a.b')).toEqual({ c: 'deep value' });
      expect(getNestedValue(obj, 'a')).toEqual({ b: { c: 'deep value' } });
    });

    it('getNestedValue should return undefined for missing keys', () => {
      const obj = { a: { b: 1 } };

      expect(getNestedValue(obj, 'a.c')).toBeUndefined();
      expect(getNestedValue(obj, 'x.y.z')).toBeUndefined();
    });

    it('setNestedValue should create intermediate objects', () => {
      const obj: Record<string, unknown> = {};

      setNestedValue(obj, 'a.b.c', 'new value');

      expect(obj).toEqual({
        a: {
          b: {
            c: 'new value',
          },
        },
      });
    });

    it('setNestedValue should overwrite existing values', () => {
      const obj: Record<string, unknown> = { a: { b: 'old' } };

      setNestedValue(obj, 'a.b', 'new');

      expect(obj).toEqual({ a: { b: 'new' } });
    });
  });

  describe('config with loaded config file', () => {
    it('should load and display config from file', async () => {
      // Create a custom config file
      const configPath = await createConfig(ctx.tempDir, {
        log: { level: 'debug' },
        output: { color: false, progress_bar: true },
      });

      const config = await loadConfig({
        globalConfigPath: configPath,
        localConfigPath: '', // Disable local config to avoid interference from project root
      });

      // Check loaded values
      expect(config.log.level).toBe('debug');
      expect(config.output.color).toBe(false);
      expect(config.output.progress_bar).toBe(true);

      // Verify display
      const output = viewConfig(config);
      expect(output).toContain('log.level = debug');
      expect(output).toContain('output.color = false');
    });

    it('should display session directory from config file', async () => {
      const customSessionDir = '/custom/sessions/path';
      const configPath = await createConfig(ctx.tempDir, {
        session: { directory: customSessionDir },
      });

      const config = await loadConfig({
        globalConfigPath: configPath,
        localConfigPath: '', // Disable local config to avoid interference from project root
      });
      const result = viewConfigKey(config, 'session.directory');

      expect(result.success).toBe(true);
      expect(result.value).toBe(customSessionDir);
    });
  });

  describe('config output formatting', () => {
    it('should format arrays as JSON', () => {
      // Test array formatting
      const obj = { test: { arr: [1, 2, 3] } };
      const result = viewConfigKey(obj as never, 'test.arr');

      expect(result.success).toBe(true);
      expect(result.value).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('should format null values correctly', () => {
      const obj = { test: { val: null } };
      const result = viewConfigKey(obj as never, 'test.val');

      expect(result.success).toBe(true);
      expect(result.value).toBe('null');
    });

    it('should format numbers as strings', () => {
      const config = getDefaultConfig();
      const result = viewConfigKey(config, 'providers.pubmed.timeout');

      expect(result.success).toBe(true);
      expect(result.value).toBe('30000');
    });
  });

  describe('config - optional provider keys', () => {
    it('should include providers.pubmed.email in full config output', () => {
      const config = getDefaultConfig();
      const output = viewConfig(config);

      expect(output).toContain('providers.pubmed.email');
    });

    it('should set providers.pubmed.email to a valid email', () => {
      const config = getDefaultConfig();
      const result = setConfigKey(config, 'providers.pubmed.email', 'test@example.com');

      expect(result.success).toBe(true);
      expect(result.value).toBe('test@example.com');
      expect(config.providers.pubmed.email).toBe('test@example.com');
    });

    it('should include providers.pubmed.api_key in full config output', () => {
      const config = getDefaultConfig();
      const output = viewConfig(config);

      expect(output).toContain('providers.pubmed.api_key');
    });

    it('should include providers.scopus.inst_token in full config output', () => {
      const config = getDefaultConfig();
      const output = viewConfig(config);

      expect(output).toContain('providers.scopus.inst_token');
    });
  });
});
