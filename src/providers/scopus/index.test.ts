/**
 * Scopus Module Export Tests
 */
import { describe, it, expect } from 'vitest';
import {
  ScopusProvider,
  ScopusClient,
  translateQuery,
  parseSearchResponse,
  parseDocument,
  registerScopusProvider,
} from './index';
import type { ScopusConfig, ScopusDocument } from './index';
import { createProviderRegistry } from '../base/registry';

describe('Scopus Module Exports', () => {
  describe('Classes', () => {
    it('should export ScopusProvider', () => {
      expect(ScopusProvider).toBeDefined();
      expect(typeof ScopusProvider).toBe('function');
    });

    it('should export ScopusClient', () => {
      expect(ScopusClient).toBeDefined();
      expect(typeof ScopusClient).toBe('function');
    });
  });

  describe('Functions', () => {
    it('should export translateQuery', () => {
      expect(translateQuery).toBeDefined();
      expect(typeof translateQuery).toBe('function');
    });

    it('should export parseSearchResponse', () => {
      expect(parseSearchResponse).toBeDefined();
      expect(typeof parseSearchResponse).toBe('function');
    });

    it('should export parseDocument', () => {
      expect(parseDocument).toBeDefined();
      expect(typeof parseDocument).toBe('function');
    });

    it('should export registerScopusProvider', () => {
      expect(registerScopusProvider).toBeDefined();
      expect(typeof registerScopusProvider).toBe('function');
    });
  });

  describe('Types', () => {
    it('should allow using ScopusConfig type', () => {
      const config: ScopusConfig = {
        apiKey: 'test-key',
        rateLimit: 2,
      };
      expect(config.apiKey).toBe('test-key');
    });

    it('should allow using ScopusDocument type', () => {
      const doc: ScopusDocument = {
        scopusId: 'SCOPUS_ID:12345',
        title: 'Test',
        authors: [],
        source: 'scopus',
        retrievedAt: new Date().toISOString(),
      };
      expect(doc.scopusId).toBe('SCOPUS_ID:12345');
    });
  });

  describe('Registry', () => {
    it('should register provider in registry', () => {
      const registry = createProviderRegistry();
      registerScopusProvider(registry, { apiKey: 'test-key' });

      expect(registry.has('scopus')).toBe(true);
    });

    it('should create provider from registry', () => {
      const registry = createProviderRegistry();
      registerScopusProvider(registry, { apiKey: 'test-key' });

      const provider = registry.get('scopus');
      expect(provider.name).toBe('scopus');
    });
  });
});
