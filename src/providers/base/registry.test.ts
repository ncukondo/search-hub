import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry, createProviderRegistry } from './registry';
import type { ProviderFactory } from './registry';
import { BaseProvider } from './provider';
import type { BaseProviderConfig } from './provider';
import type {
  ProviderName,
  Article,
  TranslatedQuery,
  SearchOptions,
  QueryAST,
  SearchState,
  SearchResumeResult,
} from './types';

// Mock provider for testing
class MockProvider extends BaseProvider {
  readonly name: ProviderName;

  constructor(name: ProviderName, config: BaseProviderConfig = {}) {
    super(config);
    this.name = name;
  }

  async *search(
    _query: TranslatedQuery,
    _options?: SearchOptions
  ): AsyncIterable<Article> {
    yield {
      doi: '10.1234/mock',
      title: 'Mock Article',
      authors: [{ family: 'Mock' }],
      source: this.name,
      retrievedAt: new Date().toISOString(),
    };
  }

  async count(_query: TranslatedQuery): Promise<number> {
    return 0;
  }

  translateQuery(ast: QueryAST): TranslatedQuery {
    return {
      native: 'mock query',
      originalAst: ast,
      provider: this.name,
    };
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  getSearchState(): SearchState | null {
    return null;
  }

  async *resumeSearch(_state: SearchState): AsyncIterable<Article> {
    // Not implemented for this mock
  }

  async validateState(_state: SearchState): Promise<SearchResumeResult> {
    return { valid: true };
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    // Create a fresh registry for each test
    registry = createProviderRegistry();
  });

  describe('register', () => {
    it('registers a provider factory', () => {
      const factory: ProviderFactory = (config) =>
        new MockProvider('pubmed', config);

      registry.register('pubmed', factory);

      expect(registry.list()).toContain('pubmed');
    });

    it('allows registering multiple providers', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));
      registry.register('eric', (config) => new MockProvider('eric', config));
      registry.register('arxiv', (config) => new MockProvider('arxiv', config));

      const providers = registry.list();
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
      expect(providers).toContain('arxiv');
    });

    it('overwrites existing registration for same name', () => {
      const factory1: ProviderFactory = () => new MockProvider('pubmed');
      const factory2: ProviderFactory = () => new MockProvider('pubmed');

      registry.register('pubmed', factory1);
      registry.register('pubmed', factory2);

      // Should still have only one pubmed
      expect(registry.list().filter((n) => n === 'pubmed')).toHaveLength(1);
    });
  });

  describe('get', () => {
    it('returns provider instance by name', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));

      const provider = registry.get('pubmed');

      expect(provider).toBeInstanceOf(BaseProvider);
      expect(provider.name).toBe('pubmed');
    });

    it('passes config to provider factory', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));

      const provider = registry.get('pubmed', { timeout: 60000 });

      expect(provider).toBeInstanceOf(BaseProvider);
    });

    it('throws on unknown provider', () => {
      expect(() => registry.get('unknown' as ProviderName)).toThrow(
        /provider.*not.*registered/i
      );
    });

    it('creates new instance each call', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));

      const provider1 = registry.get('pubmed');
      const provider2 = registry.get('pubmed');

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('list', () => {
    it('returns empty array when no providers registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('returns all registered provider names', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));
      registry.register('eric', (config) => new MockProvider('eric', config));

      const providers = registry.list();

      expect(providers).toHaveLength(2);
      expect(providers).toContain('pubmed');
      expect(providers).toContain('eric');
    });

    it('returns names in registration order', () => {
      registry.register('arxiv', (config) => new MockProvider('arxiv', config));
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));
      registry.register('eric', (config) => new MockProvider('eric', config));

      const providers = registry.list();

      expect(providers).toEqual(['arxiv', 'pubmed', 'eric']);
    });
  });

  describe('has', () => {
    it('returns true for registered provider', () => {
      registry.register('pubmed', (config) => new MockProvider('pubmed', config));

      expect(registry.has('pubmed')).toBe(true);
    });

    it('returns false for unregistered provider', () => {
      expect(registry.has('pubmed')).toBe(false);
    });
  });
});
