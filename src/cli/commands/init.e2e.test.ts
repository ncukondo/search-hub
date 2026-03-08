/**
 * E2E Tests for `search-hub init` command
 *
 * Tests the init command in real subprocess execution.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { EXIT_CODES } from '../exit-codes.js';
import { parse as parseToml } from '@iarna/toml';

// Import init function for in-process testing
const { init } = await import('./init.js');

describe('search-hub init E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('local init (default)', () => {
    it('creates .search-hub/ structure in target directory', async () => {
      const result = await init({ directory: ctx.tempDir });

      expect(result.success).toBe(true);

      // Verify directory structure
      const projectDir = join(ctx.tempDir, '.search-hub');
      expect((await stat(projectDir)).isDirectory()).toBe(true);
      expect((await stat(join(projectDir, 'sessions'))).isDirectory()).toBe(true);
      expect((await stat(join(projectDir, 'queries'))).isDirectory()).toBe(true);

      // Verify config.toml exists and is valid TOML
      const configPath = join(projectDir, 'config.toml');
      const content = await readFile(configPath, 'utf-8');
      const config = parseToml(content);
      expect(config).toBeDefined();
    });

    it('generated config.toml is valid TOML and parseable', async () => {
      await init({ directory: ctx.tempDir });

      const content = await readFile(join(ctx.tempDir, '.search-hub', 'config.toml'), 'utf-8');
      const config = parseToml(content) as Record<string, unknown>;

      // Has provider sections
      expect(config['providers']).toBeDefined();
      expect(config['integration']).toBeDefined();

      // Does not have secrets
      const providers = config['providers'] as Record<string, Record<string, unknown>>;
      expect(providers!['pubmed']!['api_key']).toBeUndefined();
    });

    it('detects conflict when .search-hub/ already exists', async () => {
      await init({ directory: ctx.tempDir });
      const result = await init({ directory: ctx.tempDir });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.message).toMatch(/already exists/);
    });

    it('--force overwrites existing .search-hub/', async () => {
      await init({ directory: ctx.tempDir });

      // Tamper with config
      const configPath = join(ctx.tempDir, '.search-hub', 'config.toml');
      await writeFile(configPath, '# tampered\n');

      const result = await init({ directory: ctx.tempDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);

      const content = await readFile(configPath, 'utf-8');
      expect(content).not.toBe('# tampered\n');
      expect(parseToml(content)).toBeDefined();
    });
  });

  describe('global init (--global)', () => {
    it('creates global config path and content', async () => {
      const globalDir = join(ctx.tempDir, 'global');
      const result = await init({ global: true, configDir: globalDir });

      expect(result.success).toBe(true);

      const content = await readFile(join(globalDir, 'config.toml'), 'utf-8');
      const config = parseToml(content) as Record<string, unknown>;

      expect(config['log']).toBeDefined();
      expect(config['output']).toBeDefined();
      expect(config['providers']).toBeDefined();

      // Has credential hints as comments
      expect(content).toMatch(/# api_key/);
      expect(content).toMatch(/# email/);
    });

    it('--force overwrites existing global config', async () => {
      const globalDir = join(ctx.tempDir, 'global');
      await init({ global: true, configDir: globalDir });

      const result = await init({ global: true, configDir: globalDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);
    });
  });
});

// Test exit codes constant
describe('EXIT_CODES for init', () => {
  it('should have correct exit codes defined', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.CONFIG_ERROR).toBeDefined();
    expect(EXIT_CODES.GENERAL_ERROR).toBeDefined();
  });
});
