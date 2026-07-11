import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  parseRegisterOptions,
  validateRegisterInput,
  formatRegistrationSummary,
  formatDryRunOutput,
  hasReviewFile,
  getReviewSummary,
  getIncludedArticles,
  formatReviewRequiredMessage,
  formatNoIncludedArticlesError,
  formatPendingWarning,
  formatIgnoringReviewsNote,
  confirmPrompt,
  formatLibraryPath,
  formatDefaultLibraryHint,
  type ReviewSummary,
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

    it('should parse --reviewed option', () => {
      const result = parseRegisterOptions('session-123', {
        reviewed: true,
      });

      expect(result.reviewed).toBe(true);
    });

    it('should parse --all option', () => {
      const result = parseRegisterOptions('session-123', {
        all: true,
      });

      expect(result.all).toBe(true);
    });

    it('should parse --force option', () => {
      const result = parseRegisterOptions('session-123', {
        force: true,
      });

      expect(result.force).toBe(true);
    });

    it('should parse --quiet option', () => {
      const result = parseRegisterOptions('session-123', {
        quiet: true,
      });

      expect(result.quiet).toBe(true);
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

  describe('hasReviewFile', () => {
    let tempDir: string;
    let sessionsDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'register-test-'));
      sessionsDir = join(tempDir, 'sessions');
      await mkdir(sessionsDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns true when reviews.yaml exists', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });
      await writeFile(join(internalDir, 'reviews.yaml'), 'sessionId: test-session\narticles: []');

      const result = await hasReviewFile(sessionId, sessionsDir);

      expect(result).toBe(true);
    });

    it('returns false when reviews.yaml does not exist', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

      const result = await hasReviewFile(sessionId, sessionsDir);

      expect(result).toBe(false);
    });

    it('returns false when session directory does not exist', async () => {
      const result = await hasReviewFile('nonexistent', sessionsDir);

      expect(result).toBe(false);
    });
  });

  describe('getReviewSummary', () => {
    let tempDir: string;
    let sessionsDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'register-test-'));
      sessionsDir = join(tempDir, 'sessions');
      await mkdir(sessionsDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns correct counts for mixed review states', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article A"
    reviews: []
    finalDecision: include
  - doi: "10.1000/b"
    title: "Article B"
    reviews: []
    finalDecision: exclude
  - doi: "10.1000/c"
    title: "Article C"
    reviews: []
  - doi: "10.1000/d"
    title: "Article D"
    reviews: []
    finalDecision: include
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getReviewSummary(sessionId, sessionsDir);

      expect(result).toEqual({
        total: 4,
        included: 2,
        excluded: 1,
        pending: 1,
      });
    });

    it('returns all pending when no reviews or decisions exist', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article A"
    reviews: []
  - doi: "10.1000/b"
    title: "Article B"
    reviews: []
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getReviewSummary(sessionId, sessionsDir);

      expect(result).toEqual({
        total: 2,
        included: 0,
        excluded: 0,
        pending: 2,
      });
    });

    it('counts agreed-include articles as pending', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article A"
    reviews:
      - reviewer: ai
        decision: include
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getReviewSummary(sessionId, sessionsDir);

      // has review but no finalDecision = agreed-include = counted as pending
      expect(result.pending).toBe(1);
      expect(result.included).toBe(0);
    });

    it('throws error when reviews.yaml does not exist', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      await mkdir(sessionDir, { recursive: true });

      await expect(getReviewSummary(sessionId, sessionsDir)).rejects.toThrow();
    });

    it('returns empty counts for session with no articles', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles: []
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getReviewSummary(sessionId, sessionsDir);

      expect(result).toEqual({
        total: 0,
        included: 0,
        excluded: 0,
        pending: 0,
      });
    });
  });

  describe('getIncludedArticles', () => {
    let tempDir: string;
    let sessionsDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'register-test-'));
      sessionsDir = join(tempDir, 'sessions');
      await mkdir(sessionsDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns only articles with finalDecision=include', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article A"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        doi: "10.1000/a"
  - doi: "10.1000/b"
    title: "Article B"
    reviews: []
    finalDecision: exclude
    mergedFrom:
      - source: scopus
        doi: "10.1000/b"
  - pmid: "12345"
    title: "Article C"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
  - doi: "10.1000/d"
    title: "Article D - pending"
    reviews: []
    mergedFrom:
      - source: scopus
        doi: "10.1000/d"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(2);
      expect(result[0]?.title).toBe('Article A');
      expect(result[1]?.title).toBe('Article C');
    });

    it('returns empty array when no included articles', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article A"
    reviews: []
    finalDecision: exclude
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(0);
    });

    it('converts review ArticleEntry to Article format', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    pmid: "12345"
    scopusId: "2-s2.0-123"
    arxivId: "2401.12345"
    ericId: "ED123456"
    title: "Test Article"
    authors: "Smith J, Doe A"
    year: "2024"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
        doi: "10.1000/a"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(1);
      const article = result[0]!;
      expect(article.doi).toBe('10.1000/a');
      expect(article.pmid).toBe('12345');
      expect(article.scopusId).toBe('2-s2.0-123');
      expect(article.arxivId).toBe('2401.12345');
      expect(article.ericId).toBe('ED123456');
      expect(article.title).toBe('Test Article');
      expect(article.publicationDate).toBe('2024');
      expect(article.source).toBe('pubmed');
    });

    it('parses "Family Initial" author format without swapping family/given (issue #145)', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      // reviews.yaml stores authors as "Family GivenInitial" (see review init formatAuthors)
      const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Schaye V, Jay S"
    year: "2026"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.authors).toEqual([
        { family: 'Schaye', given: 'V' },
        { family: 'Jay', given: 'S' },
      ]);
    });

    it('parses multi-word family names with a trailing initial', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "van der Berg V, Smith JD"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result[0]!.authors).toEqual([
        { family: 'van der Berg', given: 'V' },
        { family: 'Smith', given: 'JD' },
      ]);
    });

    it('parses single-word author names as family only', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Smith"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result[0]!.authors).toEqual([{ family: 'Smith' }]);
    });

    it('falls back to "Given Family" parsing when no trailing initials', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      // Manually edited entry with full given name
      const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Verity Schaye"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result[0]!.authors).toEqual([{ family: 'Schaye', given: 'Verity' }]);
    });

    it('gets source from mergedFrom when available', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article from Scopus"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        scopusId: "2-s2.0-123"
        doi: "10.1000/a"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe('scopus');
    });

    it('gets source from first entry of mergedFrom for merged articles', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    pmid: "12345"
    title: "Article from multiple sources"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
        doi: "10.1000/a"
      - source: scopus
        scopusId: "2-s2.0-123"
        doi: "10.1000/a"
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      const result = await getIncludedArticles(sessionId, sessionsDir);

      expect(result).toHaveLength(1);
      expect(result[0]!.source).toBe('pubmed');
    });

    it('throws error when mergedFrom is missing', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      // Legacy review file without mergedFrom
      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Legacy article"
    reviews: []
    finalDecision: include
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      await expect(getIncludedArticles(sessionId, sessionsDir)).rejects.toThrow(
        /mergedFrom.*missing/i
      );
    });

    it('throws error when mergedFrom is empty array', async () => {
      const sessionId = 'test-session';
      const sessionDir = join(sessionsDir, sessionId);
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });

      const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/a"
    title: "Article with empty mergedFrom"
    reviews: []
    finalDecision: include
    mergedFrom: []
`;
      await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

      await expect(getIncludedArticles(sessionId, sessionsDir)).rejects.toThrow(
        /mergedFrom.*empty/i
      );
    });

    describe('structured authors from session results (issue #149)', () => {
      it('uses structured authors from results matched by pmid, restoring full given names', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Test Article',
            authors: [
              { family: 'Schaye', given: 'Verity' },
              { family: 'Jay', given: 'Stephen' },
            ],
            pmid: '12345',
            source: 'pubmed',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'pubmed_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        // reviews.yaml only keeps the lossy display string
        const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Schaye V, Jay S"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result).toHaveLength(1);
        expect(result[0]!.authors).toEqual([
          { family: 'Schaye', given: 'Verity' },
          { family: 'Jay', given: 'Stephen' },
        ]);
      });

      it('preserves non-ASCII given names that the string round-trip would corrupt', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Test Article',
            authors: [{ family: 'Dupont', given: 'Émile' }],
            doi: '10.1000/x',
            source: 'scopus',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'scopus_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        // "Dupont É" would be mis-parsed as {family: "É", given: "Dupont"}
        const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/x"
    title: "Test Article"
    authors: "Dupont É"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        doi: "10.1000/x"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Dupont', given: 'Émile' }]);
      });

      it('matches DOIs case-insensitively', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Test Article',
            authors: [{ family: 'Smith', given: 'Jane' }],
            doi: '10.1000/ABC',
            source: 'scopus',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'scopus_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/abc"
    title: "Test Article"
    authors: "Smith J"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        doi: "10.1000/abc"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Smith', given: 'Jane' }]);
      });

      it('matches via mergedFrom identifiers when entry-level identifiers differ', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        // The pubmed record has only a pmid; the merged entry surfaces only a doi
        const resultArticles = [
          {
            title: 'Test Article',
            authors: [{ family: 'Yamada', given: 'Taro' }],
            pmid: '99999',
            source: 'pubmed',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'pubmed_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        const reviewContent = `
sessionId: test-session
articles:
  - doi: "10.1000/merged"
    title: "Test Article"
    authors: "Yamada T"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        doi: "10.1000/merged"
      - source: pubmed
        pmid: "99999"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Yamada', given: 'Taro' }]);
      });

      it('matches via arxivId when the article has no pmid/doi', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Preprint Article',
            authors: [{ family: 'Nakamura', given: 'Hanako' }],
            arxivId: '2401.12345',
            source: 'arxiv',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'arxiv_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        const reviewContent = `
sessionId: test-session
articles:
  - arxivId: "2401.12345"
    title: "Preprint Article"
    authors: "Nakamura H"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: arxiv
        arxivId: "2401.12345"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Nakamura', given: 'Hanako' }]);
      });

      it('matches via ericId when the article has no pmid/doi', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Education Article',
            authors: [{ family: 'García', given: 'María' }],
            ericId: 'EJ1234567',
            source: 'eric',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'eric_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        const reviewContent = `
sessionId: test-session
articles:
  - ericId: "EJ1234567"
    title: "Education Article"
    authors: "García M"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: eric
        ericId: "EJ1234567"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'García', given: 'María' }]);
      });

      it('matches via scopusId recorded only in mergedFrom', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        // The scopus record has only a scopusId; the merged entry surfaces no
        // matching entry-level identifier for it
        const resultArticles = [
          {
            title: 'Scopus Article',
            authors: [{ family: 'Okafor', given: 'Chidi' }],
            scopusId: '2-s2.0-99999',
            source: 'scopus',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'scopus_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        const reviewContent = `
sessionId: test-session
articles:
  - title: "Scopus Article"
    authors: "Okafor C"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: scopus
        scopusId: "2-s2.0-99999"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Okafor', given: 'Chidi' }]);
      });

      it('falls back to parsing the authors string when the article is not in the results', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Some Other Article',
            authors: [{ family: 'Other', given: 'Person' }],
            pmid: '11111',
            source: 'pubmed',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'pubmed_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        // Manually added article that never came from a search result
        const reviewContent = `
sessionId: test-session
articles:
  - pmid: "22222"
    title: "Manually Added Article"
    authors: "Schaye V"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "22222"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Schaye', given: 'V' }]);
      });

      it('falls back to the authors string when the matched result has no authors', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const resultArticles = [
          {
            title: 'Test Article',
            authors: [],
            pmid: '12345',
            source: 'pubmed',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'pubmed_results.jsonl'),
          resultArticles.map((a) => JSON.stringify(a)).join('\n')
        );

        // Authors string was filled in by hand after the fact
        const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Schaye V"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Schaye', given: 'V' }]);
      });

      it('prefers the YAML mirror over JSONL when both exist', async () => {
        const sessionId = 'test-session';
        const sessionDir = join(sessionsDir, sessionId);
        const internalDir = join(sessionDir, '.internal');
        await mkdir(internalDir, { recursive: true });

        const jsonlArticles = [
          {
            title: 'Test Article',
            authors: [{ family: 'Old', given: 'Name' }],
            pmid: '12345',
            source: 'pubmed',
            retrievedAt: '2026-01-01T00:00:00Z',
          },
        ];
        await writeFile(
          join(sessionDir, 'pubmed_results.jsonl'),
          jsonlArticles.map((a) => JSON.stringify(a)).join('\n')
        );
        const yamlContent = `
- title: "Test Article"
  authors:
    - family: "Corrected"
      given: "Name"
  pmid: "12345"
  source: pubmed
  retrievedAt: "2026-01-01T00:00:00Z"
`;
        await writeFile(join(sessionDir, 'pubmed_results.yaml'), yamlContent);

        const reviewContent = `
sessionId: test-session
articles:
  - pmid: "12345"
    title: "Test Article"
    authors: "Corrected N"
    reviews: []
    finalDecision: include
    mergedFrom:
      - source: pubmed
        pmid: "12345"
`;
        await writeFile(join(internalDir, 'reviews.yaml'), reviewContent);

        const result = await getIncludedArticles(sessionId, sessionsDir);

        expect(result[0]!.authors).toEqual([{ family: 'Corrected', given: 'Name' }]);
      });
    });
  });

  describe('formatReviewRequiredMessage', () => {
    it('shows review status and instructions', () => {
      const summary: ReviewSummary = {
        total: 150,
        included: 32,
        excluded: 108,
        pending: 10,
      };

      const output = formatReviewRequiredMessage(summary, 'my-session');

      expect(output).toContain('32 include');
      expect(output).toContain('108 exclude');
      expect(output).toContain('10 pending');
      expect(output).toContain('--reviewed');
      expect(output).toContain('--all');
      expect(output).toContain('search-hub register my-session --reviewed');
    });
  });

  describe('formatNoIncludedArticlesError', () => {
    it('shows error with status counts', () => {
      const summary: ReviewSummary = {
        total: 150,
        included: 0,
        excluded: 140,
        pending: 10,
      };

      const output = formatNoIncludedArticlesError(summary, 'my-session');

      expect(output).toContain("No articles marked as 'include'");
      expect(output).toContain('0 include');
      expect(output).toContain('140 exclude');
      expect(output).toContain('10 pending');
      expect(output).toContain('review status my-session');
    });
  });

  describe('formatPendingWarning', () => {
    it('shows warning with pending count and included count', () => {
      const summary: ReviewSummary = {
        total: 150,
        included: 32,
        excluded: 108,
        pending: 10,
      };

      const output = formatPendingWarning(summary);

      expect(output).toContain('10 articles still pending');
      expect(output).toContain('will be skipped');
      expect(output).toContain('32 included articles');
      expect(output).toContain('Proceed? [Y/n]');
    });

    it('uses singular when only 1 article pending', () => {
      const summary: ReviewSummary = {
        total: 150,
        included: 32,
        excluded: 117,
        pending: 1,
      };

      const output = formatPendingWarning(summary);

      expect(output).toContain('1 article still pending');
      expect(output).not.toContain('articles still pending');
    });
  });

  describe('formatIgnoringReviewsNote', () => {
    it('shows note about ignoring reviews with total count', () => {
      const output = formatIgnoringReviewsNote(150);

      expect(output).toBe('Note: Ignoring review decisions. Registering all 150 articles.');
    });

    it('handles singular article count', () => {
      const output = formatIgnoringReviewsNote(1);

      expect(output).toBe('Note: Ignoring review decisions. Registering all 1 articles.');
    });
  });

  describe('confirmPrompt', () => {
    // Helper to create a mock stdin stream
    function createMockInput(response: string): NodeJS.ReadableStream {
      const stream = new Readable({
        read() {
          this.push(response);
          this.push(null);
        },
      });
      return stream as unknown as NodeJS.ReadableStream;
    }

    // Null output stream to suppress output during tests
    const nullOutput = {
      write: () => true,
    } as unknown as NodeJS.WritableStream;

    it('returns true for empty input (Enter)', async () => {
      const result = await confirmPrompt(createMockInput('\n'), nullOutput);
      expect(result).toBe(true);
    });

    it('returns true for "y"', async () => {
      const result = await confirmPrompt(createMockInput('y\n'), nullOutput);
      expect(result).toBe(true);
    });

    it('returns true for "Y"', async () => {
      const result = await confirmPrompt(createMockInput('Y\n'), nullOutput);
      expect(result).toBe(true);
    });

    it('returns true for "yes"', async () => {
      const result = await confirmPrompt(createMockInput('yes\n'), nullOutput);
      expect(result).toBe(true);
    });

    it('returns false for "n"', async () => {
      const result = await confirmPrompt(createMockInput('n\n'), nullOutput);
      expect(result).toBe(false);
    });

    it('returns false for "N"', async () => {
      const result = await confirmPrompt(createMockInput('N\n'), nullOutput);
      expect(result).toBe(false);
    });

    it('returns false for "no"', async () => {
      const result = await confirmPrompt(createMockInput('no\n'), nullOutput);
      expect(result).toBe(false);
    });

    it('returns false for arbitrary input', async () => {
      const result = await confirmPrompt(createMockInput('xyz\n'), nullOutput);
      expect(result).toBe(false);
    });
  });

  describe('formatLibraryPath', () => {
    it('returns Library: <sessionDir>/references.json', () => {
      const result = formatLibraryPath('/home/user/sessions/my-session');
      expect(result).toBe('Library: /home/user/sessions/my-session/references.json');
    });
  });

  describe('formatDefaultLibraryHint', () => {
    it('returns import hint with ref add -i json command', () => {
      const result = formatDefaultLibraryHint('/home/user/sessions/my-session');
      expect(result).toContain('ref add -i json');
      expect(result).toContain('/home/user/sessions/my-session/references.json');
    });

    it('includes introductory text', () => {
      const result = formatDefaultLibraryHint('/home/user/sessions/my-session');
      expect(result).toContain('To also add to your default ref library:');
    });
  });
});
