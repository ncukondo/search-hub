import { describe, it, expect } from 'vitest';
import {
  ArxivProvider,
  translateQuery,
  parseAtomFeed,
  extractArxivId,
  ArxivClient,
} from './index.js';
import { globalRegistry } from '../base/registry.js';
import type { QueryAST } from '../../query/types.js';

describe('arXiv module exports', () => {
  it('should export ArxivProvider', () => {
    expect(ArxivProvider).toBeDefined();
    expect(typeof ArxivProvider).toBe('function');
  });

  it('should export translateQuery', () => {
    expect(translateQuery).toBeDefined();
    expect(typeof translateQuery).toBe('function');
  });

  it('should export parseAtomFeed', () => {
    expect(parseAtomFeed).toBeDefined();
    expect(typeof parseAtomFeed).toBe('function');
  });

  it('should export extractArxivId', () => {
    expect(extractArxivId).toBeDefined();
    expect(typeof extractArxivId).toBe('function');
  });

  it('should export ArxivClient', () => {
    expect(ArxivClient).toBeDefined();
    expect(typeof ArxivClient).toBe('function');
  });

  it('should be able to create ArxivProvider instance', () => {
    const provider = new ArxivProvider();
    expect(provider.name).toBe('arxiv');
  });

  it('should be able to use translateQuery', () => {
    const ast: QueryAST = {
      name: 'test',
      blocks: [{ id: 'block-1', field: 'title', terms: { keywords: ['test'] }, operator: 'OR' }],
      filters: {},
    };
    const result = translateQuery(ast);
    expect(result.native).toBe('ti:test');
    expect(result.provider).toBe('arxiv');
  });
});

describe('provider registration', () => {
  it('should register arxiv provider in global registry', async () => {
    // Import the module to trigger registration
    await import('./index.js');

    expect(globalRegistry.has('arxiv')).toBe(true);
  });

  it('should create provider from registry', async () => {
    await import('./index.js');

    const provider = globalRegistry.get('arxiv');
    expect(provider.name).toBe('arxiv');
  });

  it('should list arxiv in available providers', async () => {
    await import('./index.js');

    const providers = globalRegistry.list();
    expect(providers).toContain('arxiv');
  });
});
