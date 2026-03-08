import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './loader.js';
import { getDefaultSessionsDir, getLocalConfigPath } from './paths.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig E2E', () => {
  let testDir: string;
  let globalConfigDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-e2e-${Date.now()}`);
    globalConfigDir = join(testDir, 'global');
    await mkdir(globalConfigDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('merges global + local .search-hub/config.toml correctly', async () => {
    const projectDir = join(testDir, 'my-project');
    const searchHubDir = join(projectDir, '.search-hub');
    await mkdir(searchHubDir, { recursive: true });

    const globalPath = join(globalConfigDir, 'config.toml');
    await writeFile(
      globalPath,
      `
[log]
level = "debug"

[providers.pubmed]
api_key = "global-key"
rate_limit = 5
`
    );
    await writeFile(
      join(searchHubDir, 'config.toml'),
      `
[log]
level = "warn"

[providers.pubmed]
rate_limit = 10
`
    );

    const config = await loadConfig({
      globalConfigPath: globalPath,
      localConfigPath: getLocalConfigPath(projectDir),
      projectDir,
    });

    // Local overrides global for log level
    expect(config.log.level).toBe('warn');
    // Local overrides global for rate_limit
    expect(config.providers.pubmed.rate_limit).toBe(10);
    // Global api_key is preserved (not in local)
    expect(config.providers.pubmed.api_key).toBe('global-key');
    // Session directory resolves to project-local
    expect(config.session.directory).toBe(join(projectDir, '.search-hub', 'sessions'));
    // Defaults still apply
    expect(config.output.color).toBe(true);
  });

  it('session directory uses project context when .search-hub/ exists', async () => {
    const projectDir = join(testDir, 'project');
    const searchHubDir = join(projectDir, '.search-hub');
    await mkdir(searchHubDir, { recursive: true });
    await writeFile(join(searchHubDir, 'config.toml'), '');

    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: getLocalConfigPath(projectDir),
      projectDir,
    });

    expect(config.session.directory).toBe(join(projectDir, '.search-hub', 'sessions'));
  });

  it('session directory uses global default when outside project', async () => {
    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    expect(config.session.directory).toBe(getDefaultSessionsDir());
  });

  it('backward compatibility: no .search-hub/ preserves existing behavior', async () => {
    const globalPath = join(globalConfigDir, 'config.toml');
    await writeFile(
      globalPath,
      `
[log]
level = "debug"
`
    );

    const config = await loadConfig({
      globalConfigPath: globalPath,
      localConfigPath: join(testDir, 'nonexistent-project', '.search-hub', 'config.toml'),
    });

    expect(config.log.level).toBe('debug');
    expect(config.session.directory).toBe(getDefaultSessionsDir());
    expect(config.output.color).toBe(true);
    expect(config.providers.pubmed.rate_limit).toBe(3);
  });
});
