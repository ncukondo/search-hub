import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadTomlFile } from './loader';
import { writeFile, mkdir, rm } from 'node:fs/promises';
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
});
