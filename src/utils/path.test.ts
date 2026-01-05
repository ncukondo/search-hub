import { describe, it, expect } from 'vitest';
import { expandPath } from './path';
import { homedir } from 'node:os';

describe('expandPath', () => {
  const homeDir = homedir();

  it('expands ~ to home directory', () => {
    const result = expandPath('~/foo/bar');
    expect(result).toBe(`${homeDir}/foo/bar`);
  });

  it('expands ~ alone to home directory', () => {
    const result = expandPath('~');
    expect(result).toBe(homeDir);
  });

  it('leaves absolute paths unchanged', () => {
    const result = expandPath('/absolute/path/to/file');
    expect(result).toBe('/absolute/path/to/file');
  });

  it('leaves relative paths unchanged', () => {
    const result = expandPath('./relative/path');
    expect(result).toBe('./relative/path');

    const result2 = expandPath('relative/path');
    expect(result2).toBe('relative/path');
  });

  it('does not expand ~ in the middle of path', () => {
    const result = expandPath('/some/path/~/file');
    expect(result).toBe('/some/path/~/file');
  });

  it('handles empty string', () => {
    const result = expandPath('');
    expect(result).toBe('');
  });
});
