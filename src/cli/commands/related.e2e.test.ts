/**
 * E2E Tests for `search-hub related` command
 *
 * Tests the related command with real file I/O:
 * - Creating a related session from seed PMIDs
 * - Loading seeds from existing session (--from-session)
 * - Session directory structure and content
 * - Compatibility with results, summary, and export commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import {
  parseRelatedOptions,
  validateRelatedInput,
  resolveSeeds,
  createRelatedSession,
  formatRelatedOutput,
} from './related.js';
import { loadSession } from '../../session/manager.js';
import { isRelatedSession } from '../../session/types.js';
import { loadSessionArticles } from './session-utils.js';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';

// --- Fixtures ---

const relatedArticles: Article[] = [
  {
    title: 'Effectiveness of AI-Assisted Diagnosis in Primary Care',
    authors: [{ family: 'Johnson', given: 'Emily' }],
    pmid: '44444444',
    doi: '10.1000/rel.001',
    source: 'pubmed',
    publicationDate: '2025-06-15',
    journal: 'Ann Intern Med',
    abstract: 'Background: Artificial intelligence...',
    retrievedAt: '2026-02-16T10:00:00Z',
  },
  {
    title: 'Machine Learning for Clinical Decision Support',
    authors: [{ family: 'Lee', given: 'Sarah' }],
    pmid: '55555555',
    doi: '10.1000/rel.002',
    source: 'pubmed',
    publicationDate: '2025-03-20',
    journal: 'JAMA',
    retrievedAt: '2026-02-16T10:00:00Z',
  },
  {
    title: 'Deep Learning in Medical Imaging: A Review',
    authors: [
      { family: 'Garcia', given: 'Carlos' },
      { family: 'Wang', given: 'Li' },
    ],
    pmid: '66666666',
    source: 'pubmed',
    publicationDate: '2024-11-01',
    journal: 'Radiology',
    retrievedAt: '2026-02-16T10:00:00Z',
  },
];

const seedPmids = ['12345678', '23456789'];

// --- Helpers ---

async function createSourceSession(
  sessionsDir: string,
  sessionId: string,
  articles: Article[],
): Promise<SessionFile> {
  const sessionDir = join(sessionsDir, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const session: SessionFile = {
    version: 1,
    id: sessionId,
    name: 'source-session',
    createdAt: '2026-02-16T08:00:00Z',
    updatedAt: '2026-02-16T08:30:00Z',
    databases: {
      pubmed: {
        status: 'completed',
        retrievedCount: articles.length,
        files: {
          query: 'query_pubmed.txt',
          results: 'pubmed_results.jsonl',
          resultsYaml: 'pubmed_results.yaml',
        },
      },
    },
    summary: {
      totalHits: articles.length,
      totalRetrieved: articles.length,
      status: 'completed',
    },
  };

  await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');

  // Write results JSONL
  const jsonl = articles.map((a) => JSON.stringify(a)).join('\n') + '\n';
  await writeFile(join(sessionDir, 'pubmed_results.jsonl'), jsonl, 'utf-8');

  return session;
}

// --- Tests ---

describe('related command E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('full related session creation', () => {
    it('should create a related session with correct directory structure', async () => {
      const sessionFile = await createRelatedSession({
        name: 'ai-related',
        seeds: { ids: seedPmids },
        articles: relatedArticles,
        sessionsDir: ctx.sessionsDir,
      });

      // Verify session file
      expect(sessionFile.type).toBe('related');
      expect(sessionFile.seeds).toEqual({ ids: seedPmids });
      expect(sessionFile.summary.totalRetrieved).toBe(3);
      expect(sessionFile.summary.status).toBe('completed');
      expect(isRelatedSession(sessionFile)).toBe(true);

      // Verify directory contents
      const sessionDir = join(ctx.sessionsDir, sessionFile.id);
      const files = await readdir(sessionDir);
      expect(files).toContain('session.yaml');
      expect(files).toContain('pubmed_results.jsonl');
      expect(files).toContain('pubmed_results.yaml');

      // Verify session.yaml on disk
      const loadedSession = await loadSession(sessionFile.id, ctx.sessionsDir);
      expect(loadedSession.type).toBe('related');
      expect(loadedSession.seeds?.ids).toEqual(seedPmids);
    });

    it('should create a related session with sourceSession reference', async () => {
      const sessionFile = await createRelatedSession({
        name: 'from-session-related',
        seeds: { ids: ['12345678'], sourceSession: 'original-search' },
        articles: relatedArticles.slice(0, 1),
        sessionsDir: ctx.sessionsDir,
      });

      expect(sessionFile.seeds?.sourceSession).toBe('original-search');

      // Load from disk and verify
      const loaded = await loadSession(sessionFile.id, ctx.sessionsDir);
      expect(loaded.seeds?.sourceSession).toBe('original-search');
    });
  });

  describe('seed resolution from session', () => {
    it('should resolve all PMIDs from a source session', async () => {
      const sourceArticles: Article[] = [
        {
          title: 'Art 1',
          pmid: '11111111',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
        {
          title: 'Art 2',
          pmid: '22222222',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
        {
          title: 'Art 3',
          pmid: '33333333',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
      ];
      await createSourceSession(ctx.sessionsDir, 'source-session', sourceArticles);

      const seeds = await resolveSeeds(
        {
          pmids: [],
          fromSession: 'source-session',
          maxResults: 20,
        },
        ctx.sessionsDir,
      );

      expect(seeds).toHaveLength(3);
      expect(seeds).toContain('11111111');
      expect(seeds).toContain('22222222');
      expect(seeds).toContain('33333333');
    });

    it('should filter PMIDs by --pmid option', async () => {
      const sourceArticles: Article[] = [
        {
          title: 'Art 1',
          pmid: '11111111',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
        {
          title: 'Art 2',
          pmid: '22222222',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
        {
          title: 'Art 3',
          pmid: '33333333',
          source: 'pubmed',
          authors: [],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
      ];
      await createSourceSession(ctx.sessionsDir, 'source-session', sourceArticles);

      const seeds = await resolveSeeds(
        {
          pmids: ['11111111', '33333333'],
          fromSession: 'source-session',
          maxResults: 20,
        },
        ctx.sessionsDir,
      );

      expect(seeds).toEqual(['11111111', '33333333']);
    });

    it('should error when session does not exist', async () => {
      await expect(
        resolveSeeds(
          {
            pmids: [],
            fromSession: 'nonexistent-session',
            maxResults: 20,
          },
          ctx.sessionsDir,
        ),
      ).rejects.toThrow('Session not found');
    });
  });

  describe('compatibility with other commands', () => {
    it('should load articles from related session via loadSessionArticles', async () => {
      const sessionFile = await createRelatedSession({
        name: 'compat-test',
        seeds: { ids: seedPmids },
        articles: relatedArticles,
        sessionsDir: ctx.sessionsDir,
      });

      // Load via standard session loading
      const loaded = await loadSession(sessionFile.id, ctx.sessionsDir);
      const articles = await loadSessionArticles(loaded, sessionFile.id, ctx.sessionsDir);

      expect(articles).toHaveLength(3);
      expect(articles[0]!.title).toBe('Effectiveness of AI-Assisted Diagnosis in Primary Care');
      expect(articles[1]!.pmid).toBe('55555555');
    });

    it('should create valid YAML results file', async () => {
      const sessionFile = await createRelatedSession({
        name: 'yaml-test',
        seeds: { ids: seedPmids },
        articles: relatedArticles,
        sessionsDir: ctx.sessionsDir,
      });

      const sessionDir = join(ctx.sessionsDir, sessionFile.id);
      const yamlContent = await readFile(join(sessionDir, 'pubmed_results.yaml'), 'utf-8');

      // Should have header comment
      expect(yamlContent).toContain('# Results: pubmed');
      expect(yamlContent).toContain('3 articles');

      // Should parse as valid YAML array
      const parsed = parseYaml(yamlContent) as Article[];
      expect(parsed).toHaveLength(3);
      expect(parsed[0]!.pmid).toBe('44444444');
    });

    it('should create valid JSONL results file', async () => {
      const sessionFile = await createRelatedSession({
        name: 'jsonl-test',
        seeds: { ids: seedPmids },
        articles: relatedArticles,
        sessionsDir: ctx.sessionsDir,
      });

      const sessionDir = join(ctx.sessionsDir, sessionFile.id);
      const jsonlContent = await readFile(join(sessionDir, 'pubmed_results.jsonl'), 'utf-8');

      const lines = jsonlContent.trim().split('\n');
      expect(lines).toHaveLength(3);

      const first = JSON.parse(lines[0]!) as Article;
      expect(first.title).toBe('Effectiveness of AI-Assisted Diagnosis in Primary Care');
      expect(first.pmid).toBe('44444444');
    });
  });

  describe('output formatting', () => {
    it('should format complete output with all fields', () => {
      const output = formatRelatedOutput({
        sessionId: 'test-related-session',
        seedCount: 2,
        totalRelated: 150,
        retrievedCount: 20,
        articles: relatedArticles,
      });

      expect(output).toContain('test-related-session');
      expect(output).toContain('2 PMIDs');
      expect(output).toContain('150');
      expect(output).toContain('20');
      expect(output).toContain('Effectiveness of AI-Assisted Diagnosis');
      expect(output).toContain('Machine Learning for Clinical Decision');
      expect(output).toContain('Deep Learning in Medical Imaging');
    });

    it('should handle empty articles list', () => {
      const output = formatRelatedOutput({
        sessionId: 'empty-session',
        seedCount: 1,
        totalRelated: 0,
        retrievedCount: 0,
        articles: [],
      });

      expect(output).toContain('empty-session');
      expect(output).toContain('0');
      expect(output).not.toContain('Top results');
    });
  });

  describe('input validation', () => {
    it('should validate complete options', () => {
      const parsed = parseRelatedOptions(['12345678', '23456789'], {
        name: 'my-related',
        maxResults: '50',
      });
      expect(parsed.pmids).toEqual(['12345678', '23456789']);
      expect(parsed.name).toBe('my-related');
      expect(parsed.maxResults).toBe(50);

      const validation = validateRelatedInput(parsed);
      expect(validation.valid).toBe(true);
    });

    it('should reject non-numeric PMIDs', () => {
      const parsed = parseRelatedOptions(['abc123'], {});
      const validation = validateRelatedInput(parsed);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('abc123');
    });

    it('should accept from-session without positional PMIDs', () => {
      const parsed = parseRelatedOptions([], { fromSession: 'session-abc' });
      const validation = validateRelatedInput(parsed);
      expect(validation.valid).toBe(true);
    });
  });
});
