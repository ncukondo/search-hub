import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
  formatProviderReadiness,
  formatQueryDiagnostics,
  type SearchCommandOptions,
  type TranslationResult,
} from './search.js';
import { getDefaultConfig } from '../../config/index.js';
import type { ProviderName } from '../../session/types.js';

describe('search command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseSearchOptions', () => {
    it('should parse query file path', () => {
      const result = parseSearchOptions('query.yaml', {});

      expect(result.queryFile).toBe('query.yaml');
      expect(result.directQuery).toBeUndefined();
    });

    it('should parse direct query with provider', () => {
      const result = parseSearchOptions(undefined, {
        db: 'pubmed',
        query: 'diabetes[tiab]',
      });

      expect(result.directQuery).toBe('diabetes[tiab]');
      expect(result.providers).toEqual(['pubmed']);
    });

    it('should parse multiple providers', () => {
      const result = parseSearchOptions('query.yaml', {
        db: 'pubmed,eric,arxiv',
      });

      expect(result.providers).toEqual(['pubmed', 'eric', 'arxiv']);
    });

    it('should parse max-results option', () => {
      const result = parseSearchOptions('query.yaml', {
        maxResults: '100',
      });

      expect(result.maxResults).toBe(100);
    });

    it('should parse dry-run option', () => {
      const result = parseSearchOptions('query.yaml', {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
    });

    it('should parse session name option', () => {
      const result = parseSearchOptions('query.yaml', {
        name: 'my-search',
      });

      expect(result.sessionName).toBe('my-search');
    });
  });

  describe('validateSearchInput', () => {
    it('should accept valid query file', () => {
      const options: SearchCommandOptions = {
        queryFile: 'query.yaml',
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(true);
    });

    it('should accept valid direct query with provider', () => {
      const options: SearchCommandOptions = {
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed'],
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(true);
    });

    it('should reject direct query without provider', () => {
      const options: SearchCommandOptions = {
        directQuery: 'diabetes[tiab]',
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('--db');
    });

    it('should reject empty input', () => {
      const options: SearchCommandOptions = {};

      const result = validateSearchInput(options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('query file');
    });

    it('should reject direct query with multiple providers', () => {
      const options: SearchCommandOptions = {
        directQuery: 'diabetes[tiab]',
        providers: ['pubmed', 'eric'],
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('single');
    });
  });

  describe('formatDryRunOutput', () => {
    it('should format translated queries for display', () => {
      const translations = [
        { provider: 'pubmed', query: '(diabetes[tiab]) AND (AI[tiab])' },
        { provider: 'eric', query: 'diabetes AND AI' },
      ];

      const result = formatDryRunOutput(translations);

      expect(result).toContain('pubmed');
      expect(result).toContain('(diabetes[tiab]) AND (AI[tiab])');
      expect(result).toContain('eric');
      expect(result).toContain('diabetes AND AI');
    });

    it('should handle empty translations', () => {
      const result = formatDryRunOutput([]);

      expect(result).toContain('No translations');
    });

    it('should include provider readiness section when config is provided', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];
      const config = getDefaultConfig();
      config.providers.pubmed.email = 'test@example.com';
      const providers: ProviderName[] = ['pubmed'];

      const result = formatDryRunOutput(translations, { config, providers });

      expect(result).toContain('Provider readiness:');
      expect(result).toContain('Translated queries:');
    });

    it('should produce same output without config (backward compat)', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];

      const withoutConfig = formatDryRunOutput(translations);
      expect(withoutConfig).not.toContain('Provider readiness:');
      expect(withoutConfig).toContain('Translated queries:');
    });

    it('should include diagnostics section when queries have issues', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab] NOT review[pt]' },
      ];
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['pubmed'];

      const result = formatDryRunOutput(translations, { config, providers });

      expect(result).toContain('Diagnostics:');
    });

    it('should not include diagnostics section when queries are clean', () => {
      const translations: TranslationResult[] = [
        { provider: 'eric', query: 'diabetes AND education' },
      ];
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['eric'];

      const result = formatDryRunOutput(translations, { config, providers });

      expect(result).not.toContain('Diagnostics:');
    });
  });

  describe('formatProviderReadiness', () => {
    it('should show ready for properly configured providers', () => {
      const config = getDefaultConfig();
      config.providers.pubmed.email = 'test@example.com';
      const providers: ProviderName[] = ['pubmed'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('Provider readiness:');
      expect(result).toContain('✓');
      expect(result).toContain('pubmed');
      expect(result).toContain('ready');
    });

    it('should flag missing PubMed email as not configured (recommended)', () => {
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['pubmed'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('pubmed');
      expect(result).toContain('email: not configured (recommended)');
    });

    it('should flag missing Scopus API key with cross mark', () => {
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['scopus'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✗');
      expect(result).toContain('scopus');
      expect(result).toContain('missing api_key (required)');
    });

    it('should show eric as always ready', () => {
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['eric'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✓');
      expect(result).toContain('eric');
      expect(result).toContain('ready');
    });

    it('should show arxiv as always ready', () => {
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['arxiv'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✓');
      expect(result).toContain('arxiv');
      expect(result).toContain('ready');
    });

    it('should show scopus as ready when api_key is configured', () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'my-scopus-key';
      const providers: ProviderName[] = ['scopus'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✓');
      expect(result).toContain('scopus');
      expect(result).toContain('ready');
    });

    it('should show pubmed email configured status', () => {
      const config = getDefaultConfig();
      config.providers.pubmed.email = 'researcher@uni.edu';
      const providers: ProviderName[] = ['pubmed'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✓');
      expect(result).toContain('pubmed');
      expect(result).toContain('ready');
      expect(result).toContain('email: configured');
    });

    it('should handle multiple providers', () => {
      const config = getDefaultConfig();
      config.providers.pubmed.email = 'test@example.com';
      const providers: ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('pubmed');
      expect(result).toContain('eric');
      expect(result).toContain('arxiv');
      expect(result).toContain('scopus');
    });
  });

  describe('formatQueryDiagnostics', () => {
    it('should warn about NOT operator in PubMed queries', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab] NOT review[pt]' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toContain('Diagnostics:');
      expect(result).toContain('⚠');
      expect(result).toContain('pubmed');
      expect(result).toContain('NOT');
    });

    it('should warn about wildcards in MeSH terms', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabet*[mh] AND treatment[tiab]' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toContain('Diagnostics:');
      expect(result).toContain('pubmed');
      expect(result).toContain('wildcard');
      expect(result).toContain('MeSH');
    });

    it('should warn about wildcards in mesh terms (case insensitive)', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabet*[Mesh] AND treatment[tiab]' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toContain('Diagnostics:');
      expect(result).toContain('wildcard');
    });

    it('should return empty string when queries are clean', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab] AND treatment[tiab]' },
        { provider: 'eric', query: 'diabetes AND education' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toBe('');
    });

    it('should not apply diagnostics to non-PubMed providers', () => {
      const translations: TranslationResult[] = [
        { provider: 'eric', query: 'diabetes NOT review' },
        { provider: 'arxiv', query: 'ti:diabetes NOT cat:cs' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toBe('');
    });

    it('should report multiple diagnostics for same query', () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabet*[mh] NOT review[pt]' },
      ];

      const result = formatQueryDiagnostics(translations);

      expect(result).toContain('NOT');
      expect(result).toContain('wildcard');
    });
  });
});
