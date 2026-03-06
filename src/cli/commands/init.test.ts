import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { init } from './init.js';
import { mkdir, rm, readFile, stat, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseToml } from '@iarna/toml';

describe('init command', () => {
  let testDir: string;
  let configDir: string;
  let dataDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-init-test-${Date.now()}`);
    configDir = join(testDir, 'config');
    dataDir = join(testDir, 'data');
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('creates config directory', async () => {
    const result = await init({ configDir, dataDir });

    expect(result.success).toBe(true);
    const stats = await stat(configDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('creates config.toml with defaults', async () => {
    await init({ configDir, dataDir });

    const configPath = join(configDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');
    const config = parseToml(content);

    expect(config['session']).toBeDefined();
    expect(config['log']).toBeDefined();
    expect(config['providers']).toBeDefined();
  });

  it('creates sessions/ directory in data dir', async () => {
    await init({ configDir, dataDir });

    const sessionsDir = join(dataDir, 'sessions');
    const stats = await stat(sessionsDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('creates queries/ directory in data dir', async () => {
    await init({ configDir, dataDir });

    const queriesDir = join(dataDir, 'queries');
    const stats = await stat(queriesDir);
    expect(stats.isDirectory()).toBe(true);
  });

  it('does not error if queries/ already exists', async () => {
    await mkdir(join(dataDir, 'queries'), { recursive: true });
    const result = await init({ configDir, dataDir });
    expect(result.success).toBe(true);
  });

  it('returns created paths in result', async () => {
    const result = await init({ configDir, dataDir });

    expect(result.success).toBe(true);
    expect(result.configPath).toBe(join(configDir, 'config.toml'));
    expect(result.sessionsDir).toBe(join(dataDir, 'sessions'));
    expect(result.configDir).toBe(configDir);
    expect(result.dataDir).toBe(dataDir);
  });

  describe('when directory already exists', () => {
    beforeEach(async () => {
      await mkdir(configDir, { recursive: true });
      await writeFile(join(configDir, 'config.toml'), '# existing config\n');
    });

    it('without --force, returns warning and does not overwrite', async () => {
      const result = await init({ configDir, dataDir, force: false });

      expect(result.success).toBe(false);
      expect(result.alreadyExists).toBe(true);
      expect(result.message).toMatch(/already exists/i);

      // Verify original content is preserved
      const content = await readFile(join(configDir, 'config.toml'), 'utf-8');
      expect(content).toBe('# existing config\n');
    });

    it('with --force, overwrites existing files', async () => {
      const result = await init({ configDir, dataDir, force: true });

      expect(result.success).toBe(true);
      expect(result.overwritten).toBe(true);

      // Verify content is overwritten
      const content = await readFile(join(configDir, 'config.toml'), 'utf-8');
      expect(content).not.toBe('# existing config\n');

      const config = parseToml(content) as Record<string, unknown>;
      expect(config['session']).toBeDefined();
    });
  });

  it('creates valid TOML that can be parsed', async () => {
    await init({ configDir, dataDir });

    const configPath = join(configDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');

    // Should not throw
    const config = parseToml(content) as Record<string, unknown>;
    expect(config['session']).toBeDefined();
  });

  it('config includes all provider sections', async () => {
    await init({ configDir, dataDir });

    const configPath = join(configDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');
    const config = parseToml(content) as Record<string, unknown>;

    const providers = config['providers'] as Record<string, unknown>;
    expect(providers['pubmed']).toBeDefined();
    expect(providers['scopus']).toBeDefined();
    expect(providers['eric']).toBeDefined();
    expect(providers['arxiv']).toBeDefined();
  });

  it('writes session.directory to the sessions path in config', async () => {
    await init({ configDir, dataDir });

    const configPath = join(configDir, 'config.toml');
    const content = await readFile(configPath, 'utf-8');
    const config = parseToml(content) as Record<string, unknown>;

    const session = config['session'] as Record<string, unknown>;
    expect(session['directory']).toBe(join(dataDir, 'sessions'));
  });
});
