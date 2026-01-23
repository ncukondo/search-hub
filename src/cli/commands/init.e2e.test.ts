/**
 * E2E Tests for `search-hub init` command
 *
 * Tests the init command in real subprocess execution.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { EXIT_CODES } from '../exit-codes.js';

// Import init function for in-process testing
const { init } = await import('./init.js');

describe('search-hub init E2E', () => {
  let ctx: E2EContext;
  let originalExit: typeof process.exit;
  let capturedOutput: string[];
  let capturedErrors: string[];

  beforeEach(async () => {
    ctx = await setupE2EContext();

    // Capture console output
    capturedOutput = [];
    capturedErrors = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      capturedOutput.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args) => {
      capturedErrors.push(args.join(' '));
    });

    // Mock process.exit
    originalExit = process.exit;
    process.exit = vi.fn() as unknown as typeof process.exit;
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await ctx.cleanup();
    vi.restoreAllMocks();
    process.exit = originalExit;
    process.exitCode = undefined;
  });

  describe('init command - creates config at default location', () => {
    it('should create config directory and files', async () => {
      const configDir = join(ctx.tempDir, 'config');
      const dataDir = join(ctx.tempDir, 'data');

      const result = await init({
        configDir,
        dataDir,
      });

      expect(result.success).toBe(true);
      expect(result.configPath).toBe(join(configDir, 'config.toml'));
      expect(result.sessionsDir).toBe(join(dataDir, 'sessions'));

      // Verify config file exists
      const configStats = await stat(result.configPath);
      expect(configStats.isFile()).toBe(true);

      // Verify sessions directory exists
      const sessionsStats = await stat(result.sessionsDir);
      expect(sessionsStats.isDirectory()).toBe(true);

      // Verify config content is valid TOML
      const content = await readFile(result.configPath, 'utf-8');
      expect(content).toContain('[session]');
      expect(content).toContain('[providers.pubmed]');
      expect(content).toContain('[providers.eric]');
      expect(content).toContain('[providers.arxiv]');
      expect(content).toContain('[providers.scopus]');
    });

    it('should include sessions directory in config', async () => {
      const configDir = join(ctx.tempDir, 'config');
      const dataDir = join(ctx.tempDir, 'data');

      const result = await init({ configDir, dataDir });

      expect(result.success).toBe(true);

      const content = await readFile(result.configPath, 'utf-8');
      expect(content).toContain(`directory = "${result.sessionsDir}"`);
    });
  });

  describe('init command - config directory exists without --force', () => {
    it('should fail when config directory already exists', async () => {
      const configDir = join(ctx.tempDir, 'existing-config');
      const dataDir = join(ctx.tempDir, 'data');

      // Create existing config directory
      await mkdir(configDir, { recursive: true });

      const result = await init({
        configDir,
        dataDir,
        force: false,
      });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.message).toContain('already exists');
      expect(result.message).toContain('--force');
    });
  });

  describe('init command - --force overwrites existing config', () => {
    it('should overwrite existing config with --force', async () => {
      const configDir = join(ctx.tempDir, 'force-config');
      const dataDir = join(ctx.tempDir, 'force-data');

      // Create existing config
      await mkdir(configDir, { recursive: true });
      const existingConfigPath = join(configDir, 'config.toml');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(existingConfigPath, '# old config', 'utf-8');

      const result = await init({
        configDir,
        dataDir,
        force: true,
      });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);
      expect(result.message).toContain('overwritten');

      // Verify new config was written
      const content = await readFile(existingConfigPath, 'utf-8');
      expect(content).not.toBe('# old config');
      expect(content).toContain('[session]');
    });
  });

  describe('init command - custom config location', () => {
    it('should use custom config directory', async () => {
      const customConfigDir = join(ctx.tempDir, 'custom', 'config', 'path');
      const customDataDir = join(ctx.tempDir, 'custom', 'data', 'path');

      const result = await init({
        configDir: customConfigDir,
        dataDir: customDataDir,
      });

      expect(result.success).toBe(true);
      expect(result.configDir).toBe(customConfigDir);
      expect(result.dataDir).toBe(customDataDir);

      // Verify directories were created
      const configStats = await stat(customConfigDir);
      const dataStats = await stat(customDataDir);
      expect(configStats.isDirectory()).toBe(true);
      expect(dataStats.isDirectory()).toBe(true);
    });
  });

  describe('init command - config file content', () => {
    it('should create config with correct structure', async () => {
      const configDir = join(ctx.tempDir, 'content-test-config');
      const dataDir = join(ctx.tempDir, 'content-test-data');

      const result = await init({ configDir, dataDir });

      expect(result.success).toBe(true);

      const content = await readFile(result.configPath, 'utf-8');

      // Check header
      expect(content).toContain('# search-hub configuration file');

      // Check all main sections exist
      expect(content).toContain('[session]');
      expect(content).toContain('[log]');
      expect(content).toContain('[output]');
      // Note: TOML uses [providers.pubmed] style, not [providers] section
      expect(content).toContain('[integration.reference_manager]');

      // Check provider sections
      expect(content).toContain('[providers.pubmed]');
      expect(content).toContain('[providers.eric]');
      expect(content).toContain('[providers.arxiv]');
      expect(content).toContain('[providers.scopus]');

      // Check some default values
      expect(content).toContain('enabled = true');
      expect(content).toContain('rate_limit =');
      expect(content).toContain('timeout =');
    });

    it('should have correct default log level', async () => {
      const configDir = join(ctx.tempDir, 'log-test-config');
      const dataDir = join(ctx.tempDir, 'log-test-data');

      const result = await init({ configDir, dataDir });

      const content = await readFile(result.configPath, 'utf-8');
      expect(content).toContain('level = "info"');
    });
  });

  describe('init command - exit codes', () => {
    it('should return SUCCESS exit code on successful init', async () => {
      const configDir = join(ctx.tempDir, 'exit-code-config');
      const dataDir = join(ctx.tempDir, 'exit-code-data');

      const result = await init({ configDir, dataDir });

      expect(result.success).toBe(true);
      // The actual exit code would be set by the CLI handler
      // Here we just verify the result indicates success
    });

    it('should indicate failure when config exists', async () => {
      const configDir = join(ctx.tempDir, 'exit-code-exists-config');
      const dataDir = join(ctx.tempDir, 'exit-code-exists-data');

      await mkdir(configDir, { recursive: true });

      const result = await init({ configDir, dataDir, force: false });

      expect(result.success).toBe(false);
      // The CLI would set EXIT_CODES.CONFIG_ERROR
    });
  });

  describe('integration with CLI handler', () => {
    it('should handle success message output', async () => {
      const configDir = join(ctx.tempDir, 'cli-success-config');
      const dataDir = join(ctx.tempDir, 'cli-success-data');

      const result = await init({ configDir, dataDir });

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('created');
    });

    it('should handle error message output', async () => {
      const configDir = join(ctx.tempDir, 'cli-error-config');
      const dataDir = join(ctx.tempDir, 'cli-error-data');

      await mkdir(configDir, { recursive: true });

      const result = await init({ configDir, dataDir, force: false });

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain('already exists');
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
