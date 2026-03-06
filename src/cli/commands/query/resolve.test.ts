import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveQueryFile } from './resolve.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fs);

describe('resolveQueryFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns exact path when file exists', async () => {
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => true } as any);
    const result = await resolveQueryFile('./my-query.yaml');
    expect(result).toBe('./my-query.yaml');
  });

  it('returns <arg>.yaml when it exists', async () => {
    // exact path does not exist
    mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));
    // arg + .yaml exists
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => true } as any);
    const result = await resolveQueryFile('my-query');
    expect(result).toBe('my-query.yaml');
  });

  it('returns queries/<arg>.yaml when it exists', async () => {
    // exact path does not exist
    mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));
    // arg + .yaml does not exist
    mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));
    // queries/arg.yaml exists
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => true } as any);
    const result = await resolveQueryFile('my-query');
    expect(result).toBe('queries/my-query.yaml');
  });

  it('prefers exact path over .yaml suffix', async () => {
    // exact path exists (e.g., a file named "my-query" without extension)
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => true } as any);
    const result = await resolveQueryFile('my-query');
    expect(result).toBe('my-query');
  });

  it('throws error with tried paths when nothing found', async () => {
    mockedFs.stat.mockRejectedValue(new Error('ENOENT'));
    await expect(resolveQueryFile('wba-pain')).rejects.toThrow(
      'Query file not found: "wba-pain"'
    );
    await expect(resolveQueryFile('wba-pain')).rejects.toThrow(
      './wba-pain'
    );
    await expect(resolveQueryFile('wba-pain')).rejects.toThrow(
      './wba-pain.yaml'
    );
    await expect(resolveQueryFile('wba-pain')).rejects.toThrow(
      './queries/wba-pain.yaml'
    );
    await expect(resolveQueryFile('wba-pain')).rejects.toThrow(
      'query init'
    );
  });

  it('throws error when a directory is given', async () => {
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => false } as any);
    await expect(resolveQueryFile('some-dir')).rejects.toThrow(
      'not a file'
    );
  });

  it('skips .yaml step when arg already ends with .yaml', async () => {
    // exact path does not exist
    mockedFs.stat.mockRejectedValueOnce(new Error('ENOENT'));
    // queries/my-query.yaml exists (skips arg+.yaml since it already has .yaml)
    mockedFs.stat.mockResolvedValueOnce({ isFile: () => true } as any);
    const result = await resolveQueryFile('my-query.yaml');
    expect(result).toBe('queries/my-query.yaml');
  });
});
