import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { init } from './init';
import { mkdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseToml } from '@iarna/toml';

describe('init command', () => {
  let testDir: string;
  let searchHubDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-init-test-${Date.now()}`);
    searchHubDir = join(testDir, '.search-hub');
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates ~/.search-hub/ directory', async () => {
    const result = await init({ baseDir: testDir });

    expect(result.success).toBe(true);
    const stats = await stat(searchHubDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('creates config.toml with defaults', async () => {
    await init({ baseDir: testDir });

    const configPath = join(searchHubDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');
    const config = parseToml(content);

    expect(config['session']).toBeDefined();
    expect(config['log']).toBeDefined();
    expect(config['providers']).toBeDefined();
  });

  it('creates sessions/ directory', async () => {
    await init({ baseDir: testDir });

    const sessionsDir = join(searchHubDir, 'sessions');
    const stats = await stat(sessionsDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('returns created paths in result', async () => {
    const result = await init({ baseDir: testDir });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(join(searchHubDir, 'config.toml'));
    expect(result.sessionsDir).toBe(join(searchHubDir, 'sessions'));
    expect(result.baseDir).toBe(searchHubDir);
  });

  describe('when directory already exists', () => {
    beforeEach(async () => {
      await mkdir(searchHubDir, { recursive: true });
      await writeFile(join(searchHubDir, 'config.toml'), '# existing config\n');
    });

    it('without --force, returns warning and does not overwrite', async () => {
      const result = await init({ baseDir: testDir, force: false });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.message).toMatch(/already exists/i);

      // Verify original content is preserved
      const content = await readFile(join(searchHubDir, 'config.toml'), 'utf-8');
      expect(content).toBe('# existing config\n');
    });

    it('with --force, overwrites existing files', async () => {
      const result = await init({ baseDir: testDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);

      // Verify content is overwritten
      const content = await readFile(join(searchHubDir, 'config.toml'), 'utf-8');
      expect(content).not.toBe('# existing config\n');

      const config = parseToml(content) as Record<string, unknown>;
      expect(config['session']).toBeDefined();
    });
  });

  it('creates valid TOML that can be parsed', async () => {
    await init({ baseDir: testDir });

    const configPath = join(searchHubDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');

    // Should not throw
    const config = parseToml(content) as Record<string, unknown>;
    expect(config['session']).toBeDefined();
  });

  it('config includes all provider sections', async () => {
    await init({ baseDir: testDir });

    const configPath = join(searchHubDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');
    const config = parseToml(content) as Record<string, unknown>;

    const providers = config['providers'] as Record<string, unknown>;
    expect(providers['pubmed']).toBeDefined();
    expect(providers['scopus']).toBeDefined();
    expect(providers['eric']).toBeDefined();
    expect(providers['arxiv']).toBeDefined();
  });
});
