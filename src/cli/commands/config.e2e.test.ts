/**
 * E2E Tests for the config command.
 *
 * Tests the CLI command: search-hub config
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTempDir,
  cleanupTempDir,
  execCli,
} from '../e2e-helpers.js';

describe('search-hub config (E2E)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('config-e2e-');
    // Initialize config first
    await execCli(['init'], { env: { HOME: tempDir } });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should show full config', async () => {
    const result = await execCli(['config'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('session');
    expect(result.stdout).toContain('providers');
    expect(result.stdout).toContain('pubmed');
  });

  it('should show specific key', async () => {
    const result = await execCli(['config', 'session.directory'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    // Should show session directory value
    expect(result.stdout).toContain('sessions');
  });

  it('should show provider-specific key', async () => {
    const result = await execCli(['config', 'providers.pubmed.enabled'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('true');
  });

  it('should set value', async () => {
    const configPath = join(tempDir, '.search-hub', 'config.toml');

    const result = await execCli(['config', 'log.level', 'debug'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Set log.level = debug');
    expect(result.stdout).toContain('Saved to');

    // Verify config was updated
    const configContent = await readFile(configPath, 'utf-8');
    expect(configContent).toContain('level = "debug"');
  });

  it('should error for invalid key', async () => {
    const result = await execCli(['config', 'invalid.key.path'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Error');
  });

  it('should set provider settings', async () => {
    const configPath = join(tempDir, '.search-hub', 'config.toml');

    const result = await execCli(['config', 'providers.pubmed.rate_limit', '5'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Set providers.pubmed.rate_limit = 5');

    // Verify config was updated
    const configContent = await readFile(configPath, 'utf-8');
    expect(configContent).toContain('rate_limit = 5');
  });

  it('should handle custom config path with --config option', async () => {
    // Create a custom config file
    const customConfigDir = join(tempDir, 'custom');
    await execCli(['init'], { env: { HOME: customConfigDir } });
    const customConfigPath = join(customConfigDir, '.search-hub', 'config.toml');

    const result = await execCli(['--config', customConfigPath, 'config'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('session');
  });
});
