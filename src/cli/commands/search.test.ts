import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSearchOptions,
  validateSearchInput,
  formatDryRunOutput,
  type SearchCommandOptions,
} from './search.js';

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
  });
});
