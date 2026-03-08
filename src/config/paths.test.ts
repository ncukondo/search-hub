import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {
  getConfigDir,
  getDataDir,
  getDefaultConfigPath,
  getDefaultSessionsDir,
  getProjectDir,
  getLocalConfigPath,
  getLocalSessionsDir,
  getLocalQueriesDir,
  isInsideProject,
} from './paths.js';

describe('paths', () => {
  describe('getConfigDir', () => {
    it('returns a string path', () => {
      const result = getConfigDir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains search-hub in the path', () => {
      const result = getConfigDir();
      expect(result).toContain('search-hub');
    });
  });

  describe('getDataDir', () => {
    it('returns a string path', () => {
      const result = getDataDir();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('contains search-hub in the path', () => {
      const result = getDataDir();
      expect(result).toContain('search-hub');
    });
  });

  describe('getDefaultConfigPath', () => {
    it('returns path ending with config.toml', () => {
      const result = getDefaultConfigPath();
      expect(result).toMatch(/config\.toml$/);
    });

    it('includes config directory', () => {
      const result = getDefaultConfigPath();
      const configDir = getConfigDir();
      expect(result.startsWith(configDir)).toBe(true);
    });
  });

  describe('getDefaultSessionsDir', () => {
    it('returns path ending with sessions', () => {
      const result = getDefaultSessionsDir();
      expect(result).toMatch(/sessions$/);
    });

    it('includes data directory', () => {
      const result = getDefaultSessionsDir();
      const dataDir = getDataDir();
      expect(result.startsWith(dataDir)).toBe(true);
    });
  });

  describe('getProjectDir', () => {
    it('returns .search-hub path relative to given directory', () => {
      const result = getProjectDir('/some/project');
      expect(result).toBe(join('/some/project', '.search-hub'));
    });

    it('defaults to cwd when no directory specified', () => {
      const result = getProjectDir();
      expect(result).toBe(join(process.cwd(), '.search-hub'));
    });
  });

  describe('getLocalConfigPath', () => {
    it('returns .search-hub/config.toml relative to given directory', () => {
      const result = getLocalConfigPath('/some/project');
      expect(result).toBe(join('/some/project', '.search-hub', 'config.toml'));
    });
  });

  describe('getLocalSessionsDir', () => {
    it('returns .search-hub/sessions relative to given directory', () => {
      const result = getLocalSessionsDir('/some/project');
      expect(result).toBe(join('/some/project', '.search-hub', 'sessions'));
    });
  });

  describe('getLocalQueriesDir', () => {
    it('returns .search-hub/queries relative to given directory', () => {
      const result = getLocalQueriesDir('/some/project');
      expect(result).toBe(join('/some/project', '.search-hub', 'queries'));
    });
  });

  describe('isInsideProject', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `search-hub-paths-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('returns true when .search-hub/ directory exists', async () => {
      await mkdir(join(testDir, '.search-hub'), { recursive: true });
      const result = await isInsideProject(testDir);
      expect(result).toBe(true);
    });

    it('returns false when .search-hub/ does not exist', async () => {
      const result = await isInsideProject(testDir);
      expect(result).toBe(false);
    });

    it('returns false when .search-hub is a file, not a directory', async () => {
      await writeFile(join(testDir, '.search-hub'), '');
      const result = await isInsideProject(testDir);
      expect(result).toBe(false);
    });
  });

  describe('platform-appropriate paths', () => {
    it('uses XDG-like paths on Linux', () => {
      // env-paths handles platform detection internally
      // On Linux (our dev environment), should use .config or .local/share
      const configDir = getConfigDir();
      const dataDir = getDataDir();

      // env-paths uses 'search-hub-nodejs' suffix by default, we use 'search-hub'
      if (process.platform === 'linux') {
        expect(configDir).toMatch(/\.config\/search-hub/);
        expect(dataDir).toMatch(/\.local\/share\/search-hub/);
      }
    });
  });
});
