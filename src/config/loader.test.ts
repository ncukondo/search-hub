import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadTomlFile, loadConfig, saveConfig } from './loader.js';
import { getDefaultSessionsDir } from './paths.js';
import { writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadTomlFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('loads valid TOML file', async () => {
    const tomlContent = `
[session]
directory = "/custom/path"

[log]
level = "debug"

[providers.pubmed]
api_key = "test-key"
rate_limit = 10
`;
    const filePath = join(testDir, 'config.toml');
    await writeFile(filePath, tomlContent);

    const result = await loadTomlFile(filePath);

    expect(result.session?.directory).toBe('/custom/path');
    expect(result.log?.level).toBe('debug');
    expect(result.providers?.pubmed?.api_key).toBe('test-key');
    expect(result.providers?.pubmed?.rate_limit).toBe(10);
  });

  it('returns empty object for missing file', async () => {
    const filePath = join(testDir, 'nonexistent.toml');

    const result = await loadTomlFile(filePath);

    expect(result).toEqual({});
  });

  it('throws with clear message for invalid TOML', async () => {
    const invalidToml = `
[invalid
this is not valid toml
`;
    const filePath = join(testDir, 'invalid.toml');
    await writeFile(filePath, invalidToml);

    await expect(loadTomlFile(filePath)).rejects.toThrow(/invalid.*toml/i);
  });

  it('handles empty TOML file', async () => {
    const filePath = join(testDir, 'empty.toml');
    await writeFile(filePath, '');

    const result = await loadTomlFile(filePath);

    expect(result).toEqual({});
  });

  it('handles TOML with only comments', async () => {
    const tomlContent = `
# This is a comment
# Another comment
`;
    const filePath = join(testDir, 'comments.toml');
    await writeFile(filePath, tomlContent);

    const result = await loadTomlFile(filePath);

    expect(result).toEqual({});
  });

  it('loads TOML with empty email string without validation errors', async () => {
    const tomlContent = `
[providers.pubmed]
email = ""
api_key = "test-key"
`;
    const filePath = join(testDir, 'config.toml');
    await writeFile(filePath, tomlContent);

    const result = await loadTomlFile(filePath);
    expect(result.providers?.pubmed?.email).toBe('');
  });
});

describe('loadConfig', () => {
  let testDir: string;
  let globalConfigDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
    globalConfigDir = join(testDir, 'global');
    await mkdir(globalConfigDir, { recursive: true });
    originalEnv = { ...process.env };
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns default config when no sources exist', async () => {
    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent', 'config.toml'),
      localConfigPath: join(testDir, 'nonexistent', 'local.toml'),
    });

    expect(config.log.level).toBe('info');
    // Empty session.directory is resolved to platform default
    expect(config.session.directory).toBe(getDefaultSessionsDir());
    expect(config.providers.pubmed.rate_limit).toBe(3);
  });

  it('applies global config over defaults', async () => {
    const globalPath = join(globalConfigDir, 'config.toml');
    await writeFile(
      globalPath,
      `
[log]
level = "debug"

[providers.pubmed]
rate_limit = 5
`
    );

    const config = await loadConfig({
      globalConfigPath: globalPath,
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    expect(config.log.level).toBe('debug');
    expect(config.providers.pubmed.rate_limit).toBe(5);
    // Defaults still apply for unset values
    expect(config.output.color).toBe(true);
  });

  it('applies local config over global', async () => {
    const globalPath = join(globalConfigDir, 'config.toml');
    const localPath = join(testDir, 'local.toml');

    await writeFile(
      globalPath,
      `
[log]
level = "debug"

[providers.pubmed]
rate_limit = 5
`
    );
    await writeFile(
      localPath,
      `
[log]
level = "warn"
`
    );

    const config = await loadConfig({
      globalConfigPath: globalPath,
      localConfigPath: localPath,
    });

    // Local overrides global
    expect(config.log.level).toBe('warn');
    // Global still applies for values not in local
    expect(config.providers.pubmed.rate_limit).toBe(5);
  });

  it('applies env vars over local config', async () => {
    const localPath = join(testDir, 'local.toml');
    await writeFile(
      localPath,
      `
[log]
level = "warn"
`
    );

    process.env['SEARCH_HUB_LOG_LEVEL'] = 'error';

    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: localPath,
    });

    expect(config.log.level).toBe('error');
  });

  it('applies CLI options over env vars', async () => {
    process.env['SEARCH_HUB_LOG_LEVEL'] = 'error';

    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
      cliOptions: {
        log: { level: 'debug' },
      },
    });

    expect(config.log.level).toBe('debug');
  });

  it('deep merges across all sources', async () => {
    const globalPath = join(globalConfigDir, 'config.toml');
    const localPath = join(testDir, 'local.toml');

    await writeFile(
      globalPath,
      `
[providers.pubmed]
api_key = "global-key"
rate_limit = 5
`
    );
    await writeFile(
      localPath,
      `
[providers.pubmed]
rate_limit = 8
`
    );

    process.env['SEARCH_HUB_PUBMED_API_KEY'] = 'env-key';

    const config = await loadConfig({
      globalConfigPath: globalPath,
      localConfigPath: localPath,
      cliOptions: {
        providers: {
          pubmed: { timeout: 60000 },
        },
      },
    });

    // env overrides global api_key
    expect(config.providers.pubmed.api_key).toBe('env-key');
    // local overrides global rate_limit
    expect(config.providers.pubmed.rate_limit).toBe(8);
    // cli sets timeout
    expect(config.providers.pubmed.timeout).toBe(60000);
    // defaults still apply
    expect(config.providers.pubmed.retries).toBe(3);
  });

  it('validates final config', async () => {
    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    // Should have all required fields with proper types
    expect(typeof config.log.level).toBe('string');
    expect(typeof config.output.color).toBe('boolean');
    expect(typeof config.providers.pubmed.rate_limit).toBe('number');
    expect(typeof config.session.directory).toBe('string');
  });
});

describe('saveConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('saves config to TOML file', async () => {
    const configPath = join(testDir, 'config.toml');
    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    // Modify some values
    config.log.level = 'debug';
    config.providers.pubmed.rate_limit = 10;

    await saveConfig(config, { path: configPath });

    // Verify file was created
    const content = await readFile(configPath, 'utf-8');
    expect(content).toContain('[log]');
    expect(content).toContain('level = "debug"');
    expect(content).toContain('[providers.pubmed]');
    expect(content).toContain('rate_limit = 10');
  });

  it('creates directory if it does not exist', async () => {
    const nestedPath = join(testDir, 'nested', 'dir', 'config.toml');
    const config = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    await saveConfig(config, { path: nestedPath, createDir: true });

    // Verify file was created
    const content = await readFile(nestedPath, 'utf-8');
    expect(content).toContain('[session]');
  });

  it('can round-trip config through save and load', async () => {
    const configPath = join(testDir, 'config.toml');
    const originalConfig = await loadConfig({
      globalConfigPath: join(testDir, 'nonexistent.toml'),
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    // Modify some values
    originalConfig.log.level = 'warn';
    originalConfig.session.directory = '/custom/sessions';
    originalConfig.providers.pubmed.api_key = 'test-key';
    originalConfig.providers.pubmed.rate_limit = 7;

    await saveConfig(originalConfig, { path: configPath });

    // Load back and compare
    const loadedConfig = await loadConfig({
      globalConfigPath: configPath,
      localConfigPath: join(testDir, 'nonexistent.toml'),
    });

    expect(loadedConfig.log.level).toBe('warn');
    expect(loadedConfig.session.directory).toBe('/custom/sessions');
    expect(loadedConfig.providers.pubmed.api_key).toBe('test-key');
    expect(loadedConfig.providers.pubmed.rate_limit).toBe(7);
  });

  it('throws on invalid config', async () => {
    const configPath = join(testDir, 'config.toml');
    const invalidConfig = {
      log: { level: 'invalid-level' },
    } as unknown as Awaited<ReturnType<typeof loadConfig>>;

    await expect(saveConfig(invalidConfig, { path: configPath })).rejects.toThrow();
  });
});
