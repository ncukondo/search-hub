import { describe, it, expect } from 'vitest';
import { appPaths } from './app-paths';

describe('appPaths', () => {
  describe('config directory', () => {
    it('should return non-empty config path', () => {
      expect(appPaths.config).toBeTruthy();
      expect(typeof appPaths.config).toBe('string');
    });

    it('should include search-hub in config path', () => {
      expect(appPaths.config).toContain('search-hub');
    });
  });

  describe('data directory', () => {
    it('should return non-empty data path', () => {
      expect(appPaths.data).toBeTruthy();
      expect(typeof appPaths.data).toBe('string');
    });

    it('should include search-hub in data path', () => {
      expect(appPaths.data).toContain('search-hub');
    });
  });

  describe('configFile', () => {
    it('should end with config.toml', () => {
      expect(appPaths.configFile).toMatch(/config\.toml$/);
    });

    it('should be under config directory', () => {
      expect(appPaths.configFile).toContain(appPaths.config);
    });
  });

  describe('sessionsDir', () => {
    it('should end with sessions', () => {
      expect(appPaths.sessionsDir).toMatch(/sessions$/);
    });

    it('should be under data directory', () => {
      expect(appPaths.sessionsDir).toContain(appPaths.data);
    });
  });
});
