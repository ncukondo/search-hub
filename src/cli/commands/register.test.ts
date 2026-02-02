import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseRegisterOptions,
  validateRegisterInput,
  formatRegistrationSummary,
  formatDryRunOutput,
} from './register.js';

describe('register command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseRegisterOptions', () => {
    it('should parse session id', () => {
      const result = parseRegisterOptions('session-123', {});

      expect(result.sessionId).toBe('session-123');
    });

    it('should parse --db option for provider filtering', () => {
      const result = parseRegisterOptions('session-123', {
        db: 'pubmed,eric',
      });

      expect(result.providers).toEqual(['pubmed', 'eric']);
    });

    it('should parse --dry-run option', () => {
      const result = parseRegisterOptions('session-123', {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
    });

    it('should default dryRun to false', () => {
      const result = parseRegisterOptions('session-123', {});

      expect(result.dryRun).toBe(false);
    });

    it('should parse --with-abstracts option', () => {
      const result = parseRegisterOptions('session-123', {
        withAbstracts: true,
      });

      expect(result.withAbstracts).toBe(true);
    });

    it('should default withAbstracts to false', () => {
      const result = parseRegisterOptions('session-123', {});

      expect(result.withAbstracts).toBe(false);
    });
  });

  describe('validateRegisterInput', () => {
    it('should accept valid session id', () => {
      const result = validateRegisterInput({
        sessionId: 'session-123',
        dryRun: false,
        withAbstracts: false,
      });

      expect(result.valid).toBe(true);
    });

    it('should reject empty session id', () => {
      const result = validateRegisterInput({
        sessionId: '',
        dryRun: false,
        withAbstracts: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session');
    });

    it('should reject whitespace-only session id', () => {
      const result = validateRegisterInput({
        sessionId: '   ',
        dryRun: false,
        withAbstracts: false,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('session');
    });
  });

  describe('formatRegistrationSummary', () => {
    it('should format summary with all statistics', () => {
      const summary = {
        total: 100,
        added: 90,
        skipped: 5,
        failed: 3,
        noId: 2,
      };

      const output = formatRegistrationSummary(summary);

      expect(output).toContain('90 added');
      expect(output).toContain('5 duplicate');
      expect(output).toContain('3 failed');
      expect(output).toContain('2 skipped');
    });

    it('should use checkmark for added', () => {
      const summary = {
        total: 10,
        added: 10,
        skipped: 0,
        failed: 0,
        noId: 0,
      };

      const output = formatRegistrationSummary(summary);

      expect(output).toContain('✓');
    });

    it('should use warning symbol for duplicates when present', () => {
      const summary = {
        total: 10,
        added: 8,
        skipped: 2,
        failed: 0,
        noId: 0,
      };

      const output = formatRegistrationSummary(summary);

      expect(output).toContain('⚠');
    });

    it('should use error symbol for failures when present', () => {
      const summary = {
        total: 10,
        added: 9,
        skipped: 0,
        failed: 1,
        noId: 0,
      };

      const output = formatRegistrationSummary(summary);

      expect(output).toContain('✗');
    });
  });

  describe('formatDryRunOutput', () => {
    it('should show count of articles to register', () => {
      const articles = [
        { pmid: '12345678', title: 'Article 1', authors: [], source: 'pubmed' as const, retrievedAt: '' },
        { doi: '10.1234/test', title: 'Article 2', authors: [], source: 'pubmed' as const, retrievedAt: '' },
        { title: 'Article 3', authors: [], source: 'pubmed' as const, retrievedAt: '' }, // no ID
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('Would register 2 reference');
      expect(output).toContain('1 article');
      expect(output).toContain('no DOI or PMID');
    });

    it('should list articles with their identifiers', () => {
      const articles = [
        { pmid: '12345678', title: 'Article 1', authors: [], source: 'pubmed' as const, retrievedAt: '' },
        { doi: '10.1234/test', title: 'Article 2', authors: [], source: 'pubmed' as const, retrievedAt: '' },
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('pmid:12345678');
      expect(output).toContain('10.1234/test');
    });

    it('should indicate PMID preference over DOI', () => {
      const articles = [
        { pmid: '12345678', doi: '10.1234/test', title: 'Article with both', authors: [], source: 'pubmed' as const, retrievedAt: '' },
      ];

      const output = formatDryRunOutput(articles);

      // Should show PMID, not DOI
      expect(output).toContain('pmid:12345678');
      expect(output).not.toContain('10.1234/test');
    });

    it('should handle zero registrable articles', () => {
      const articles = [
        { title: 'No ID Article', authors: [], source: 'pubmed' as const, retrievedAt: '' },
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('Would register 0');
    });

    it('should show title, source, and alternative IDs for no-ID articles', () => {
      const articles = [
        { title: 'Article with arXiv', authors: [], source: 'arxiv' as const, retrievedAt: '', arxivId: '2401.12345' },
        { title: 'Article with ERIC', authors: [], source: 'eric' as const, retrievedAt: '', ericId: 'ED123456' },
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('no DOI or PMID');
      expect(output).toContain('"Article with arXiv"');
      expect(output).toContain('source: arxiv');
      expect(output).toContain('has: arxiv:2401.12345');
      expect(output).toContain('"Article with ERIC"');
      expect(output).toContain('source: eric');
      expect(output).toContain('has: eric:ED123456');
    });

    it('should truncate no-ID article titles at 50 characters', () => {
      const longTitle = 'A Very Long Article Title That Exceeds Fifty Characters Easily Here';
      const articles = [
        { title: longTitle, authors: [], source: 'pubmed' as const, retrievedAt: '' },
      ];

      const output = formatDryRunOutput(articles);

      // Title should be truncated to 50 chars with "..."
      expect(output).toContain('"A Very Long Article Title That Exceeds Fifty Chara..."');
      expect(output).not.toContain(longTitle);
    });

    it('should show maximum 10 no-ID articles with "... and N more"', () => {
      const articles = Array.from({ length: 15 }, (_, i) => ({
        title: `No ID Article ${i + 1}`,
        authors: [],
        source: 'pubmed' as const,
        retrievedAt: '',
      }));

      const output = formatDryRunOutput(articles);

      // Should show first 10
      expect(output).toContain('No ID Article 1');
      expect(output).toContain('No ID Article 10');
      // Should not show 11th
      expect(output).not.toContain('No ID Article 11');
      // Should show remainder count
      expect(output).toContain('... and 5 more');
    });

    it('should show only title and source for no-ID articles without alternative IDs', () => {
      const articles = [
        { title: 'Plain Article', authors: [], source: 'pubmed' as const, retrievedAt: '' },
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('"Plain Article"');
      expect(output).toContain('source: pubmed');
      expect(output).not.toContain('has:');
    });

    it('should show scopus alternative ID for no-ID articles', () => {
      const articles = [
        { title: 'Scopus Article', authors: [], source: 'scopus' as const, retrievedAt: '', scopusId: '2-s2.0-12345' },
      ];

      const output = formatDryRunOutput(articles);

      expect(output).toContain('"Scopus Article"');
      expect(output).toContain('has: scopus:2-s2.0-12345');
    });
  });
});
