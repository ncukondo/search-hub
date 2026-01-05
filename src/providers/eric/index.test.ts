/**
 * Tests for ERIC provider module exports and registration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ERICProvider,
  ERICClient,
  translateQuery,
  parseSearchResponse,
  ERIC_API_BASE_URL,
  DEFAULT_FIELDS,
} from './index';
import { createProviderRegistry } from '../base';

describe('ERIC Provider Module', () => {
  describe('exports', () => {
    it('should export ERICProvider class', () => {
      expect(ERICProvider).toBeDefined();
      expect(typeof ERICProvider).toBe('function');
    });

    it('should export ERICClient class', () => {
      expect(ERICClient).toBeDefined();
      expect(typeof ERICClient).toBe('function');
    });

    it('should export translateQuery function', () => {
      expect(translateQuery).toBeDefined();
      expect(typeof translateQuery).toBe('function');
    });

    it('should export parseSearchResponse function', () => {
      expect(parseSearchResponse).toBeDefined();
      expect(typeof parseSearchResponse).toBe('function');
    });

    it('should export ERIC_API_BASE_URL constant', () => {
      expect(ERIC_API_BASE_URL).toBe('https://api.ies.ed.gov/eric/');
    });

    it('should export DEFAULT_FIELDS constant', () => {
      expect(DEFAULT_FIELDS).toBeInstanceOf(Array);
      expect(DEFAULT_FIELDS).toContain('id');
      expect(DEFAULT_FIELDS).toContain('title');
    });
  });

  describe('provider registration', () => {
    let registry: ReturnType<typeof createProviderRegistry>;

    beforeEach(() => {
      registry = createProviderRegistry();
      registry.register('eric', (config) => new ERICProvider(config));
    });

    it('should be able to create provider from registry', () => {
      const provider = registry.get('eric');
      expect(provider).toBeInstanceOf(ERICProvider);
      expect(provider.name).toBe('eric');
    });

    it('should pass config to provider', () => {
      const provider = registry.get('eric', { rateLimit: 10 });
      expect(provider).toBeInstanceOf(ERICProvider);
    });

    it('should be listed in registry', () => {
      expect(registry.has('eric')).toBe(true);
      expect(registry.list()).toContain('eric');
    });
  });

  describe('ERICProvider instantiation', () => {
    it('should create provider with default config', () => {
      const provider = new ERICProvider();
      expect(provider.name).toBe('eric');
    });

    it('should create provider with custom config', () => {
      const provider = new ERICProvider({
        rateLimit: 10,
        timeout: 60000,
        maxResultsPerPage: 500,
      });
      expect(provider.name).toBe('eric');
    });
  });
});
