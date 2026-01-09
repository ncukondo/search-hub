/**
 * E2E Tests for the init command.
 *
 * Tests the CLI command: search-hub init
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createTempDir,
  cleanupTempDir,
  execCli,
} from '../e2e-helpers.js';

describe('search-hub init (E2E)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('init-e2e-');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should create config file at default location', async () => {
    // Override HOME to use temp directory
    const result = await execCli(['init'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Configuration created');

    // Verify files were created
    const searchHubDir = join(tempDir, '.search-hub');
    expect(existsSync(searchHubDir)).toBe(true);
    expect(existsSync(join(searchHubDir, 'config.toml'))).toBe(true);
    expect(existsSync(join(searchHubDir, 'sessions'))).toBe(true);

    // Verify config content
    const configContent = await readFile(join(searchHubDir, 'config.toml'), 'utf-8');
    expect(configContent).toContain('# search-hub configuration file');
    expect(configContent).toContain('[session]');
    expect(configContent).toContain('[providers.pubmed]');
  });

  it('should error when config exists without --force', async () => {
    // First init
    await execCli(['init'], {
      env: { HOME: tempDir },
    });

    // Second init without force should fail
    const result = await execCli(['init'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('already exists');
    expect(result.stdout + result.stderr).toContain('--force');
  });

  it('should overwrite existing config with --force', async () => {
    // First init
    await execCli(['init'], {
      env: { HOME: tempDir },
    });

    const searchHubDir = join(tempDir, '.search-hub');

    // Second init with force should succeed
    const result = await execCli(['init', '--force'], {
      env: { HOME: tempDir },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('overwritten');

    // Verify file still exists with valid content
    const newContent = await readFile(join(searchHubDir, 'config.toml'), 'utf-8');
    expect(newContent).toContain('[session]');
    expect(newContent.length).toBeGreaterThan(0);
  });

  it('should create sessions directory', async () => {
    await execCli(['init'], {
      env: { HOME: tempDir },
    });

    const sessionsDir = join(tempDir, '.search-hub', 'sessions');
    expect(existsSync(sessionsDir)).toBe(true);
  });

  it('should include all provider configurations', async () => {
    await execCli(['init'], {
      env: { HOME: tempDir },
    });

    const configContent = await readFile(
      join(tempDir, '.search-hub', 'config.toml'),
      'utf-8'
    );

    // Check all providers are configured
    expect(configContent).toContain('[providers.pubmed]');
    expect(configContent).toContain('[providers.eric]');
    expect(configContent).toContain('[providers.arxiv]');
    expect(configContent).toContain('[providers.scopus]');
  });
});
