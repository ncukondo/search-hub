import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
  formatProviderReadiness,
  formatQueryDiagnostics,
  formatCountOnlyOutput,
  formatSearchCompletionTip,
  formatCountOnlyTip,
  formatDirectQueryTip,
  formatPreviewOutput,
  formatShortKeywordWarning,
  type SearchCommandOptions,
  type TranslationResult,
  type CountResult,
  type PreviewResult,
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

    it('should parse count-only option', () => {
      const result = parseSearchOptions('query.yaml', {
        countOnly: true,
      });

      expect(result.countOnly).toBe(true);
    });

    it('should parse preview option', () => {
      const result = parseSearchOptions('query.yaml', {
        preview: true,
      });

      expect(result.preview).toBe(true);
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

    it('should reject --preview with --count-only', () => {
      const options: SearchCommandOptions = {
        queryFile: 'query.yaml',
        preview: true,
        countOnly: true,
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('--preview');
      expect(result.error).toContain('--count-only');
    });

    it('should accept valid preview option', () => {
      const options: SearchCommandOptions = {
        queryFile: 'query.yaml',
        preview: true,
      };

      const result = validateSearchInput(options);

      expect(result.valid).toBe(true);
    });
  });

  describe('formatDryRunOutput', () => {
    it('should format translated queries for display', async () => {
      const translations = [
        { provider: 'pubmed', query: '(diabetes[tiab]) AND (AI[tiab])' },
        { provider: 'eric', query: 'diabetes AND AI' },
      ];

      const result = await formatDryRunOutput(translations);

      expect(result).toContain('pubmed');
      expect(result).toContain('(diabetes[tiab]) AND (AI[tiab])');
      expect(result).toContain('eric');
      expect(result).toContain('diabetes AND AI');
    });

    it('should handle empty translations', async () => {
      const result = await formatDryRunOutput([]);

      expect(result).toContain('No translations');
    });

    it('should include provider readiness section when config is provided', async () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];
      const config = getDefaultConfig();
      config.providers.pubmed.email = 'test@example.com';
      const providers: ProviderName[] = ['pubmed'];

      const result = await formatDryRunOutput(translations, { config, providers, skipConnectionTest: true });

      expect(result).toContain('Provider readiness:');
      expect(result).toContain('Translated queries:');
    });

    it('should produce same output without config (backward compat)', async () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab]' },
      ];

      const withoutConfig = await formatDryRunOutput(translations);
      expect(withoutConfig).not.toContain('Provider readiness:');
      expect(withoutConfig).toContain('Translated queries:');
    });

    it('should include diagnostics section when queries have issues', async () => {
      const translations: TranslationResult[] = [
        { provider: 'pubmed', query: 'diabetes[tiab] NOT review[pt]' },
      ];
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['pubmed'];

      const result = await formatDryRunOutput(translations, { config, providers, skipConnectionTest: true });

      expect(result).toContain('Diagnostics:');
    });

    it('should not include diagnostics section when queries are clean', async () => {
      const translations: TranslationResult[] = [
        { provider: 'eric', query: 'diabetes AND education' },
      ];
      const config = getDefaultConfig();
      const providers: ProviderName[] = ['eric'];

      const result = await formatDryRunOutput(translations, { config, providers, skipConnectionTest: true });

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

    it('should show connection test failure for scopus with invalid key', () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'invalid-key';
      const providers: ProviderName[] = ['scopus'];
      const connectionResults = {
        scopus: { ok: false as const, error: 'Scopus API authentication failed: Unauthorized' },
      };

      const result = formatProviderReadiness(providers, config, connectionResults);

      expect(result).toContain('✗');
      expect(result).toContain('scopus');
      expect(result).toContain('not ready');
      expect(result).toContain('authentication failed');
    });

    it('should show verified status when connection test passes', () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'valid-key';
      const providers: ProviderName[] = ['scopus'];
      const connectionResults = {
        scopus: { ok: true as const },
      };

      const result = formatProviderReadiness(providers, config, connectionResults);

      expect(result).toContain('✓');
      expect(result).toContain('scopus');
      expect(result).toContain('ready (verified)');
    });

    it('should show config-only readiness when no connection results provided', () => {
      const config = getDefaultConfig();
      config.providers.scopus.api_key = 'some-key';
      const providers: ProviderName[] = ['scopus'];

      const result = formatProviderReadiness(providers, config);

      expect(result).toContain('✓');
      expect(result).toContain('scopus');
      expect(result).toContain('ready');
      expect(result).not.toContain('verified');
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

  describe('formatCountOnlyOutput', () => {
    it('should format count results for multiple providers', () => {
      const counts: CountResult[] = [
        { provider: 'pubmed', count: 28 },
        { provider: 'scopus', count: 145 },
        { provider: 'eric', count: 3 },
      ];

      const result = formatCountOnlyOutput(counts, 'wba-genai-v6.yaml');

      expect(result).toContain('wba-genai-v6.yaml');
      expect(result).toContain('count only');
      expect(result).toContain('pubmed:');
      expect(result).toContain('28');
      expect(result).toContain('scopus:');
      expect(result).toContain('145');
      expect(result).toContain('eric:');
      expect(result).toContain('3');
      expect(result).toContain('total:');
      expect(result).toContain('176');
    });

    it('should format count results for a single provider', () => {
      const counts: CountResult[] = [
        { provider: 'pubmed', count: 42 },
      ];

      const result = formatCountOnlyOutput(counts, 'query.yaml');

      expect(result).toContain('pubmed:');
      expect(result).toContain('42');
      expect(result).toContain('total:');
      expect(result).toContain('42');
    });

    it('should include error information for failed providers', () => {
      const counts: CountResult[] = [
        { provider: 'pubmed', count: 28 },
        { provider: 'scopus', count: 0, error: 'API key invalid' },
      ];

      const result = formatCountOnlyOutput(counts, 'query.yaml');

      expect(result).toContain('pubmed:');
      expect(result).toContain('28');
      expect(result).toContain('scopus:');
      expect(result).toContain('error');
      expect(result).toContain('API key invalid');
    });

    it('should handle zero results', () => {
      const counts: CountResult[] = [
        { provider: 'pubmed', count: 0 },
      ];

      const result = formatCountOnlyOutput(counts, 'query.yaml');

      expect(result).toContain('0');
      expect(result).toContain('total');
    });

    it('should use direct-query as label when no query file', () => {
      const counts: CountResult[] = [
        { provider: 'pubmed', count: 10 },
      ];

      const result = formatCountOnlyOutput(counts);

      expect(result).toContain('direct-query');
    });
  });

  describe('formatSearchCompletionTip', () => {
    it('should include tip text about diff command', () => {
      const result = formatSearchCompletionTip('20260204_query_abc123');

      expect(result).toContain('Tip:');
      expect(result).toContain('diff');
      expect(result).toContain('20260204_query_abc123');
    });

    it('should suggest comparing with another query version', () => {
      const result = formatSearchCompletionTip('my-session');

      expect(result).toContain('compare');
      expect(result).toContain('search-hub diff');
    });
  });

  describe('formatCountOnlyTip', () => {
    it('should include tip about running without --count-only', () => {
      const result = formatCountOnlyTip();

      expect(result).toContain('Tip:');
      expect(result).toContain('--count-only');
    });

    it('should suggest using diff to compare query versions', () => {
      const result = formatCountOnlyTip();

      expect(result).toContain('diff');
    });
  });

  describe('formatDirectQueryTip', () => {
    it('should recommend using YAML query file for reproducibility', () => {
      const result = formatDirectQueryTip();

      expect(result).toContain('Tip:');
      expect(result).toContain('YAML');
      expect(result).toContain('reproducible');
    });

    it('should show query init command', () => {
      const result = formatDirectQueryTip();

      expect(result).toContain('search-hub query init');
    });
  });

  describe('formatShortKeywordWarning', () => {
    it('should format warning with list of short keywords', () => {
      const result = formatShortKeywordWarning(['EPA', 'OSCE', 'AI']);

      expect(result).toContain('⚠');
      expect(result).toContain('EPA');
      expect(result).toContain('OSCE');
      expect(result).toContain('AI');
      expect(result).toContain('short');
    });

    it('should include suggestion for full phrases', () => {
      const result = formatShortKeywordWarning(['EPA']);

      expect(result).toContain('full phrases');
    });

    it('should include suggestion for exclude terms', () => {
      const result = formatShortKeywordWarning(['EPA']);

      expect(result).toContain('exclude');
    });

    it('should return empty string for empty array', () => {
      const result = formatShortKeywordWarning([]);

      expect(result).toBe('');
    });
  });

  describe('formatPreviewOutput', () => {
    it('should format preview results with count and titles', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 28,
          titles: [
            'First article title',
            'Second article title',
            'Third article title',
          ],
        },
      ];

      const result = formatPreviewOutput(results, 'query.yaml');

      expect(result).toContain('query.yaml');
      expect(result).toContain('preview');
      expect(result).toContain('pubmed:');
      expect(result).toContain('28');
      expect(result).toContain('First article title');
      expect(result).toContain('Second article title');
      expect(result).toContain('Third article title');
    });

    it('should format preview results for multiple providers', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 28,
          titles: ['Article A', 'Article B'],
        },
        {
          provider: 'eric',
          count: 15,
          titles: ['Article C', 'Article D'],
        },
      ];

      const result = formatPreviewOutput(results, 'query.yaml');

      expect(result).toContain('pubmed:');
      expect(result).toContain('28');
      expect(result).toContain('Article A');
      expect(result).toContain('eric:');
      expect(result).toContain('15');
      expect(result).toContain('Article C');
      expect(result).toContain('total:');
      expect(result).toContain('43');
    });

    it('should handle provider errors', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 10,
          titles: ['Article 1'],
        },
        {
          provider: 'scopus',
          count: 0,
          titles: [],
          error: 'API key invalid',
        },
      ];

      const result = formatPreviewOutput(results, 'query.yaml');

      expect(result).toContain('pubmed:');
      expect(result).toContain('10');
      expect(result).toContain('scopus:');
      expect(result).toContain('error');
      expect(result).toContain('API key invalid');
    });

    it('should use direct-query label when no query file', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 5,
          titles: ['Test article'],
        },
      ];

      const result = formatPreviewOutput(results);

      expect(result).toContain('direct-query');
    });

    it('should show empty preview for zero results', () => {
      const results: PreviewResult[] = [
        {
          provider: 'pubmed',
          count: 0,
          titles: [],
        },
      ];

      const result = formatPreviewOutput(results, 'query.yaml');

      expect(result).toContain('pubmed:');
      expect(result).toContain('0');
    });
  });
});
