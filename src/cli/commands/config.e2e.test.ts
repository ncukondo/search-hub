/**
 * E2E Tests for `search-hub config` command
 *
 * Tests the config command functionality.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setupE2EContext, type E2EContext, createConfig } from '../e2e-helpers.js';
import { getDefaultConfig, loadConfig, saveConfig } from '../../config/index.js';
import { loadTomlFile } from '../../config/loader.js';
import {
  viewConfig,
  viewConfigKey,
  setConfigKey,
  getNestedValue,
  setNestedValue,
  parseValue,
  resolveWriteScope,
  checkSecretKeyWarning,
  formatShowOrigin,
  viewConfigAllOrigins,
  viewConfigFiltered,
  formatEnvVars,
} from './config.js';
import { ENV_VAR_MAP } from '../../config/env.js';

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
      expect(result.value).toBe('[1,2,3]');
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

  describe('config --global/--local scope E2E', () => {
    it('should write to global config with --global scope', async () => {
      const globalConfigPath = join(ctx.tempDir, 'global-config.toml');
      await writeFile(globalConfigPath, '', 'utf-8');

      // Load config, set value, save to global path
      const config = await loadConfig({
        globalConfigPath,
        localConfigPath: '',
      });
      const result = setConfigKey(config, 'log.level', 'debug');
      expect(result.success).toBe(true);

      // Save only the changed key to the file
      const existing = await loadTomlFile(globalConfigPath);
      setNestedValue(existing as Record<string, unknown>, 'log.level', 'debug');
      await saveConfig(existing as typeof config, { path: globalConfigPath });

      // Reload and verify
      const reloaded = await loadConfig({
        globalConfigPath,
        localConfigPath: '',
      });
      expect(reloaded.log.level).toBe('debug');
    });

    it('should write to local config with --local scope', async () => {
      // Create a project directory with .search-hub/
      const projectDir = join(ctx.tempDir, 'project');
      const searchHubDir = join(projectDir, '.search-hub');
      await mkdir(searchHubDir, { recursive: true });
      const localConfigPath = join(searchHubDir, 'config.toml');
      await writeFile(localConfigPath, '', 'utf-8');

      const config = getDefaultConfig();
      setNestedValue(config as unknown as Record<string, unknown>, 'output.color', false);

      const existing = await loadTomlFile(localConfigPath);
      setNestedValue(existing as Record<string, unknown>, 'output.color', false);
      await saveConfig(existing as typeof config, { path: localConfigPath });

      // Reload and verify local override
      const reloaded = await loadConfig({
        globalConfigPath: '',
        localConfigPath,
      });
      expect(reloaded.output.color).toBe(false);
    });

    it('should override global value with local value', async () => {
      // Create global config
      const globalConfigPath = await createConfig(ctx.tempDir, {
        log: { level: 'warn' },
      }, 'global-config.toml');

      // Create local config
      const projectDir = join(ctx.tempDir, 'project');
      const searchHubDir = join(projectDir, '.search-hub');
      await mkdir(searchHubDir, { recursive: true });
      const localConfigPath = join(searchHubDir, 'config.toml');
      await writeFile(localConfigPath, '[log]\nlevel = "debug"\n', 'utf-8');

      const config = await loadConfig({
        globalConfigPath,
        localConfigPath,
      });
      expect(config.log.level).toBe('debug'); // local overrides global
    });

    it('should resolve scope correctly based on flags and project context', () => {
      // Default inside project -> local
      expect(resolveWriteScope({ global: false, local: false, insideProject: true }))
        .toEqual({ scope: 'local' });

      // Default outside project -> global
      expect(resolveWriteScope({ global: false, local: false, insideProject: false }))
        .toEqual({ scope: 'global' });

      // --local outside project -> error
      const result = resolveWriteScope({ global: false, local: true, insideProject: false });
      expect(result.scope).toBe('error');

      // --global and --local together -> error
      const both = resolveWriteScope({ global: true, local: true, insideProject: true });
      expect(both.scope).toBe('error');
    });
  });

  describe('config --show-origin E2E', () => {
    it('should show global origin correctly', () => {
      const output = formatShowOrigin(
        'providers.pubmed.api_key',
        'my-key',
        'global',
        '/home/.config/search-hub/config.toml'
      );
      expect(output).toContain('global');
      expect(output).toContain('providers.pubmed.api_key = my-key');
      expect(output).toContain('/home/.config/search-hub/config.toml');
    });

    it('should show local origin correctly', () => {
      const output = formatShowOrigin(
        'output.color',
        'false',
        'local',
        '.search-hub/config.toml'
      );
      expect(output).toContain('local');
      expect(output).toContain('output.color = false');
    });

    it('should show env origin correctly', () => {
      const output = formatShowOrigin(
        'providers.pubmed.api_key',
        'env-value',
        'env',
        'SEARCH_HUB_PUBMED_API_KEY'
      );
      expect(output).toContain('env');
      expect(output).toContain('SEARCH_HUB_PUBMED_API_KEY');
    });

    it('should show default origin correctly', () => {
      const output = formatShowOrigin('log.level', 'info', 'default', '');
      expect(output).toContain('default');
      expect(output).toContain('log.level = info');
    });
  });

  describe('config --env-vars E2E', () => {
    it('should print the full ENV_VAR_MAP table', () => {
      const output = formatEnvVars();
      expect(output).toContain('SEARCH_HUB_PUBMED_API_KEY');
      expect(output).toContain('providers.pubmed.api_key');
      expect(output).toContain('→');
    });

    it('should include all known env vars', () => {
      const output = formatEnvVars();
      expect(output).toContain('SEARCH_HUB_SCOPUS_API_KEY');
      expect(output).toContain('SEARCH_HUB_WOS_API_KEY');
      expect(output).toContain('SEARCH_HUB_SESSION_DIR');
      expect(output).toContain('SEARCH_HUB_PUBMED_EMAIL');
      expect(output).toContain('SEARCH_HUB_SCOPUS_INST_TOKEN');
      expect(output).toContain('SEARCH_HUB_LOG_LEVEL');
    });
  });

  describe('config secret key warning E2E', () => {
    it('should warn when writing api_key to local scope', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.api_key', 'local');
      expect(warning).toBeTruthy();
      expect(warning).toContain('--global');
    });

    it('should warn when writing inst_token to local scope', () => {
      const warning = checkSecretKeyWarning('providers.scopus.inst_token', 'local');
      expect(warning).toBeTruthy();
      expect(warning).toContain('--global');
    });

    it('should warn when writing email to local scope', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.email', 'local');
      expect(warning).toBeTruthy();
    });

    it('should not warn for non-secret keys in local scope', () => {
      expect(checkSecretKeyWarning('output.color', 'local')).toBeNull();
      expect(checkSecretKeyWarning('log.level', 'local')).toBeNull();
      expect(checkSecretKeyWarning('providers.pubmed.enabled', 'local')).toBeNull();
    });

    it('should not warn for secret keys in global scope', () => {
      expect(checkSecretKeyWarning('providers.pubmed.api_key', 'global')).toBeNull();
      expect(checkSecretKeyWarning('providers.pubmed.email', 'global')).toBeNull();
    });
  });

  describe('config --list with scope filter E2E', () => {
    it('should show only global config values', async () => {
      const globalConfigPath = await createConfig(ctx.tempDir, {
        log: { level: 'warn' },
        output: { color: false },
      }, 'global-only.toml');

      const globalConfig = await loadTomlFile(globalConfigPath);
      const output = viewConfigFiltered(globalConfig as Record<string, unknown>);
      expect(output).toContain('log.level = warn');
      expect(output).toContain('output.color = false');
    });

    it('should show only local config values', async () => {
      const projectDir = join(ctx.tempDir, 'list-project');
      const searchHubDir = join(projectDir, '.search-hub');
      await mkdir(searchHubDir, { recursive: true });
      const localConfigPath = join(searchHubDir, 'config.toml');
      await writeFile(localConfigPath, '[output]\nprogress_bar = false\n', 'utf-8');

      const localConfig = await loadTomlFile(localConfigPath);
      const output = viewConfigFiltered(localConfig as Record<string, unknown>);
      expect(output).toContain('output.progress_bar = false');
      expect(output).not.toContain('log.level');
    });

    it('should show merged config by default', async () => {
      const globalConfigPath = await createConfig(ctx.tempDir, {
        log: { level: 'warn' },
      }, 'merged-global.toml');

      const config = await loadConfig({
        globalConfigPath,
        localConfigPath: '',
      });
      const output = viewConfig(config);
      expect(output).toContain('log.level = warn');
      expect(output).toContain('output.color'); // defaults still shown
    });
  });

  describe('parseValue reuse', () => {
    it('should parse boolean values', () => {
      expect(parseValue('true', 'string')).toBe(true);
      expect(parseValue('false', 'string')).toBe(false);
    });

    it('should parse numeric values when existing is number', () => {
      expect(parseValue('42', 10)).toBe(42);
      expect(parseValue('3.14', 1)).toBe(3.14);
    });

    it('should keep string when existing is not number', () => {
      expect(parseValue('42', 'string')).toBe('42');
    });
  });

  describe('config list --show-origin E2E', () => {
    it('should show origin for all keys in merged config', async () => {
      const globalConfigPath = await createConfig(ctx.tempDir, {
        log: { level: 'warn' },
      }, 'origin-global.toml');

      const config = await loadConfig({
        globalConfigPath,
        localConfigPath: '',
      });

      const globalConfig = await loadTomlFile(globalConfigPath);
      const output = viewConfigAllOrigins(
        config,
        ENV_VAR_MAP,
        {} as Record<string, unknown>,
        '',
        globalConfig as Record<string, unknown>,
        globalConfigPath
      );

      // Global-overridden key should show global origin
      expect(output).toContain('global');
      expect(output).toContain('log.level = warn');
      // Default keys should show default origin
      expect(output).toContain('default');
      expect(output).toContain('output.color = true');
    });

    it('should show local origin for locally overridden keys', async () => {
      const config = getDefaultConfig();
      config.output.color = false;

      const localConfig = { output: { color: false } };
      const output = viewConfigAllOrigins(
        config,
        ENV_VAR_MAP,
        localConfig as Record<string, unknown>,
        '.search-hub/config.toml',
        {} as Record<string, unknown>,
        ''
      );

      expect(output).toContain('local');
      expect(output).toContain('output.color = false');
    });

    it('should show env origin for env-overridden keys', async () => {
      const origEnv = process.env['SEARCH_HUB_LOG_LEVEL'];
      process.env['SEARCH_HUB_LOG_LEVEL'] = 'debug';
      try {
        const config = getDefaultConfig();
        config.log.level = 'debug';

        const output = viewConfigAllOrigins(
          config,
          ENV_VAR_MAP,
          {} as Record<string, unknown>,
          '',
          {} as Record<string, unknown>,
          ''
        );

        expect(output).toContain('env');
        expect(output).toContain('SEARCH_HUB_LOG_LEVEL');
        expect(output).toContain('log.level = debug');
      } finally {
        if (origEnv === undefined) {
          delete process.env['SEARCH_HUB_LOG_LEVEL'];
        } else {
          process.env['SEARCH_HUB_LOG_LEVEL'] = origEnv;
        }
      }
    });
  });

  describe('config secret key blocking E2E', () => {
    it('should return warning message for secret keys in local scope', () => {
      const warning = checkSecretKeyWarning('providers.pubmed.api_key', 'local');
      expect(warning).toBeTruthy();
      expect(warning).toContain('--global');
    });

    it('should allow non-secret keys in local scope', () => {
      expect(checkSecretKeyWarning('output.color', 'local')).toBeNull();
    });

    it('should allow secret keys in global scope', () => {
      expect(checkSecretKeyWarning('providers.pubmed.api_key', 'global')).toBeNull();
    });
  });
});
