import { describe, expect, it } from 'vitest';
import {
  getConfigDir,
  getDataDir,
  getDefaultConfigPath,
  getDefaultSessionsDir,
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
