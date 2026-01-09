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
      expect(output).toContain('no identifier');
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
  });
});
