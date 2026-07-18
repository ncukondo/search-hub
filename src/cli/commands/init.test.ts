import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { init } from './init.js';
import { mkdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseToml } from '@iarna/toml';

describe('init command', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `search-hub-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('local init (default)', () => {
    it('creates .search-hub/config.toml in specified directory', async () => {
      const result = await init({ directory: testDir });

      expect(result.success).toBe(true);
      const configPath = join(testDir, '.search-hub', 'config.toml');
      const content = await readFile(configPath, 'utf-8');
      const config = parseToml(content);
      expect(config).toBeDefined();
    });

    it('creates .search-hub/sessions/ directory', async () => {
      await init({ directory: testDir });

      const sessionsDir = join(testDir, '.search-hub', 'sessions');
      const stats = await stat(sessionsDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('creates .search-hub/queries/ directory', async () => {
      await init({ directory: testDir });

      const queriesDir = join(testDir, '.search-hub', 'queries');
      const stats = await stat(queriesDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('generated config.toml contains provider enabled/disabled flags and max_results (no secrets)', async () => {
      await init({ directory: testDir });

      const configPath = join(testDir, '.search-hub', 'config.toml');
      const content = await readFile(configPath, 'utf-8');
      const config = parseToml(content) as Record<string, unknown>;

      const providers = config['providers'] as Record<string, Record<string, unknown>>;
      // Should have provider settings
      expect(providers!['pubmed']!['enabled']).toBeDefined();
      expect(providers!['pubmed']!['max_results']).toBeDefined();
      expect(providers!['eric']!['enabled']).toBeDefined();
      expect(providers!['arxiv']!['enabled']).toBeDefined();
      expect(providers!['scopus']!['enabled']).toBeDefined();

      // Should NOT have secret fields (api_key, email, inst_token)
      expect(providers!['pubmed']!['api_key']).toBeUndefined();
      expect(providers!['pubmed']!['email']).toBeUndefined();
      expect(providers!['scopus']!['api_key']).toBeUndefined();
      expect(providers!['scopus']!['inst_token']).toBeUndefined();
    });

    it('--force overwrites existing .search-hub/', async () => {
      // Create initial
      await init({ directory: testDir });
      // Write a marker to detect overwrite
      const configPath = join(testDir, '.search-hub', 'config.toml');
      await writeFile(configPath, '# marker\n');

      const result = await init({ directory: testDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);
      const content = await readFile(configPath, 'utf-8');
      expect(content).not.toBe('# marker\n');
    });

    it('detects conflict when .search-hub/ already exists', async () => {
      await init({ directory: testDir });

      const result = await init({ directory: testDir });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.message).toMatch(/already exists/i);
    });

    it('returns correct paths in result', async () => {
      const result = await init({ directory: testDir });

      expect(result.success).toBe(true);
      expect(result.configPath).toBe(join(testDir, '.search-hub', 'config.toml'));
      expect(result.projectDir).toBe(join(testDir, '.search-hub'));
    });
  });

  describe('global init (--global)', () => {
    let globalConfigDir: string;

    beforeEach(() => {
      globalConfigDir = join(testDir, 'global-config');
    });

    it('creates config at XDG global path', async () => {
      const result = await init({ global: true, configDir: globalConfigDir });

      expect(result.success).toBe(true);
      const configPath = join(globalConfigDir, 'config.toml');
      const content = await readFile(configPath, 'utf-8');
      const config = parseToml(content);
      expect(config).toBeDefined();
    });

    it('global config contains credential placeholders as comments', async () => {
      await init({ global: true, configDir: globalConfigDir });

      const configPath = join(globalConfigDir, 'config.toml');
      const content = await readFile(configPath, 'utf-8');

      // Should contain commented credential hints
      expect(content).toMatch(/# api_key/);
      expect(content).toMatch(/# email/);
      expect(content).toMatch(/# inst_token/);
    });

    it('global config contains log/output preferences', async () => {
      await init({ global: true, configDir: globalConfigDir });

      const configPath = join(globalConfigDir, 'config.toml');
      const content = await readFile(configPath, 'utf-8');
      const config = parseToml(content) as Record<string, unknown>;

      expect(config['log']).toBeDefined();
      expect(config['output']).toBeDefined();
    });

    it('--force works with --global', async () => {
      await init({ global: true, configDir: globalConfigDir });
      await writeFile(join(globalConfigDir, 'config.toml'), '# old\n');

      const result = await init({ global: true, configDir: globalConfigDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);
    });

    it('detects conflict when global config already exists', async () => {
      await init({ global: true, configDir: globalConfigDir });

      const result = await init({ global: true, configDir: globalConfigDir });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
    });
  });

  describe('CLI output hints', () => {
    it('local init includes hint about search-hub init --global', async () => {
      const result = await init({ directory: testDir });

      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h) => h.includes('--global'))).toBe(true);
    });

    it('local init includes hint about .env and search-hub config --env-vars', async () => {
      const result = await init({ directory: testDir });

      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h) => h.includes('.env') || h.includes('--env-vars'))).toBe(true);
    });

    it('global init includes recommended search-hub config --global commands', async () => {
      const globalConfigDir = join(testDir, 'global-config');
      const result = await init({ global: true, configDir: globalConfigDir });

      expect(result.hints).toBeDefined();
      expect(result.hints!.some((h) => h.includes('config') && h.includes('--global'))).toBe(true);
    });
  });
});
