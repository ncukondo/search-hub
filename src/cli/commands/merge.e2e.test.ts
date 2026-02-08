/**
 * E2E Tests for `search-hub merge` command
 *
 * Tests the merge command with real file I/O:
 * - Merging two sessions with deduplication
 * - Merged session directory structure
 * - Source provenance copying
 * - Merged session detection (rejection)
 * - Resume rejection for merged sessions
 * - Dry-run mode
 * - JSON output
 * - Compatibility with status/summary/export commands
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import {
  setupE2EContext,
  type E2EContext,
} from '../e2e-helpers.js';
import {
  mergeArticles,
  validateMergeSources,
  createMergedSession,
  copySourceProvenance,
  formatMergeOutput,
  formatMergeJson,
} from './merge.js';
import { loadSessionArticles } from './session-utils.js';
import { loadSession } from '../../session/manager.js';
import { isMergedSession } from '../../session/types.js';
import { getResumableProvidersForCommand } from './resume.js';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';

// --- Fixtures ---

const pubmedArticles: Article[] = [
  {
    title: 'AI in Medical Education',
    authors: [{ family: 'Smith', given: 'John' }],
    pmid: '11111111',
    doi: '10.1000/med.001',
    source: 'pubmed',
    publicationDate: '2024-03-15',
    journal: 'BMC Med Ed',
    retrievedAt: '2026-02-08T10:00:00Z',
  },
  {
    title: 'Machine Learning Diagnosis',
    authors: [{ family: 'Jones', given: 'Alice' }],
    pmid: '22222222',
    doi: '10.1000/med.002',
    source: 'pubmed',
    publicationDate: '2024-06-01',
    journal: 'JMIR',
    retrievedAt: '2026-02-08T10:00:00Z',
  },
  {
    title: 'Deep Learning in Radiology',
    authors: [{ family: 'Chen', given: 'Wei' }],
    pmid: '33333333',
    source: 'pubmed',
    publicationDate: '2025-01-10',
    journal: 'Radiology',
    retrievedAt: '2026-02-08T10:00:00Z',
  },
];

const scopusArticles: Article[] = [
  {
    title: 'AI in Medical Education',
    authors: [{ family: 'Smith', given: 'John' }],
    doi: '10.1000/med.001',
    scopusId: 'SCOPUS:001',
    source: 'scopus',
    publicationDate: '2024-03-15',
    abstract: 'An abstract about AI in medical education.',
    journal: 'BMC Med Ed',
    retrievedAt: '2026-02-08T10:00:00Z',
  },
  {
    title: 'NLP for Clinical Notes',
    authors: [{ family: 'Brown', given: 'Emma' }],
    doi: '10.1000/nlp.001',
    scopusId: 'SCOPUS:002',
    source: 'scopus',
    publicationDate: '2025-02-01',
    journal: 'JAMIA',
    retrievedAt: '2026-02-08T10:00:00Z',
  },
];

const session2PubmedArticles: Article[] = [
  {
    title: 'Machine Learning Diagnosis',
    authors: [{ family: 'Jones', given: 'Alice' }],
    pmid: '22222222',
    doi: '10.1000/med.002',
    source: 'pubmed',
    publicationDate: '2024-06-01',
    journal: 'JMIR',
    abstract: 'A detailed abstract about ML diagnosis.',
    retrievedAt: '2026-02-08T11:00:00Z',
  },
  {
    title: 'Transformer Models in Healthcare',
    authors: [{ family: 'Lee', given: 'Min' }],
    pmid: '44444444',
    doi: '10.1000/transformer.001',
    source: 'pubmed',
    publicationDate: '2025-03-01',
    journal: 'Nature Medicine',
    retrievedAt: '2026-02-08T11:00:00Z',
  },
];

// --- Helpers ---

async function createTestSession(
  sessionsDir: string,
  sessionId: string,
  name: string,
  articles: Map<string, Article[]>,
): Promise<SessionFile> {
  const sessionDir = join(sessionsDir, sessionId);
  await mkdir(sessionDir, { recursive: true });

  const databases: SessionFile['databases'] = {};
  let totalRetrieved = 0;

  for (const [provider, providerArticles] of articles) {
    const jsonlContent = providerArticles.map((a) => JSON.stringify(a)).join('\n') + '\n';
    await writeFile(join(sessionDir, `${provider}_results.jsonl`), jsonlContent, 'utf-8');

    databases[provider as keyof typeof databases] = {
      status: 'completed',
      retrievedCount: providerArticles.length,
      files: {
        query: `query_${provider}.txt`,
        results: `${provider}_results.jsonl`,
      },
    };
    totalRetrieved += providerArticles.length;
  }

  const sessionFile: SessionFile = {
    version: 1,
    id: sessionId,
    name,
    createdAt: '2026-02-08T10:00:00Z',
    updatedAt: '2026-02-08T10:00:00Z',
    query: {
      file: '/path/to/query.yaml',
      hash: 'abc123',
      targets: [...articles.keys()] as any[],
    },
    databases,
    summary: {
      totalHits: totalRetrieved,
      totalRetrieved,
      status: 'completed',
    },
  };

  await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(sessionFile), 'utf-8');
  await writeFile(join(sessionDir, 'query_common.yaml'), `name: ${name}\nblocks: []\n`, 'utf-8');
  await writeFile(join(sessionDir, 'query_pubmed.txt'), `${name}[tiab]`, 'utf-8');

  return sessionFile;
}

// --- Tests ---

describe('search-hub merge E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('full merge workflow', () => {
    it('should merge two sessions with deduplication', async () => {
      // Create two sessions with overlapping articles
      await createTestSession(ctx.sessionsDir, 'session-v4', 'wba-v4', new Map([
        ['pubmed', pubmedArticles],
        ['scopus', scopusArticles],
      ]));

      await createTestSession(ctx.sessionsDir, 'session-v9', 'wba-v9', new Map([
        ['pubmed', session2PubmedArticles],
      ]));

      // Load sessions
      const sessionV4 = await loadSession('session-v4', ctx.sessionsDir);
      const sessionV9 = await loadSession('session-v9', ctx.sessionsDir);

      // Load articles
      const articlesV4 = await loadSessionArticles(sessionV4, 'session-v4', ctx.sessionsDir);
      const articlesV9 = await loadSessionArticles(sessionV9, 'session-v9', ctx.sessionsDir);

      expect(articlesV4).toHaveLength(5); // 3 pubmed + 2 scopus
      expect(articlesV9).toHaveLength(2);

      // Merge
      const sessionArticles = new Map([
        ['session-v4', articlesV4],
        ['session-v9', articlesV9],
      ]);

      const result = mergeArticles(sessionArticles);

      // 5 + 2 = 7 total, but 2 duplicates (doi:10.1000/med.001 across pubmed/scopus in v4,
      // and doi:10.1000/med.002 / pmid:22222222 across v4 and v9)
      expect(result.totalBefore).toBe(7);
      expect(result.duplicatesRemoved).toBe(2);
      expect(result.totalAfter).toBe(5);

      // Create merged session
      const mergedSession = await createMergedSession({
        name: 'wba-merged',
        sources: [
          { id: 'session-v4', name: 'wba-v4' },
          { id: 'session-v9', name: 'wba-v9' },
        ],
        byProvider: result.byProvider,
        totalRetrieved: result.totalAfter,
        sessionsDir: ctx.sessionsDir,
        sourceSessionIds: ['session-v4', 'session-v9'],
      });

      expect(mergedSession.type).toBe('merge');
      expect(mergedSession.sources).toHaveLength(2);
      expect(mergedSession.summary.status).toBe('completed');
      expect(mergedSession.summary.totalRetrieved).toBe(5);
      expect(isMergedSession(mergedSession)).toBe(true);

      // Verify session directory
      const mergedDir = join(ctx.sessionsDir, mergedSession.id);
      const files = await readdir(mergedDir);
      expect(files).toContain('session.yaml');

      // Verify sources/ provenance
      const sourcesDir = join(mergedDir, 'sources');
      const sourceEntries = await readdir(sourcesDir);
      expect(sourceEntries).toContain('session-v4');
      expect(sourceEntries).toContain('session-v9');

      // Verify source provenance contents
      const sourceV4Dir = join(sourcesDir, 'session-v4');
      const sourceV4Files = await readdir(sourceV4Dir);
      expect(sourceV4Files).toContain('session.yaml');
      expect(sourceV4Files).toContain('query_common.yaml');
      expect(sourceV4Files).toContain('query_pubmed.txt');

      // Verify merged session can be loaded back
      const loaded = await loadSession(mergedSession.id, ctx.sessionsDir);
      expect(loaded.type).toBe('merge');
      expect(loaded.sources).toHaveLength(2);
    });

    it('should keep richer metadata when deduplicating', async () => {
      await createTestSession(ctx.sessionsDir, 'session-v4', 'wba-v4', new Map([
        ['pubmed', pubmedArticles],
      ]));

      await createTestSession(ctx.sessionsDir, 'session-v9', 'wba-v9', new Map([
        ['pubmed', session2PubmedArticles],
      ]));

      const sessionV4 = await loadSession('session-v4', ctx.sessionsDir);
      const sessionV9 = await loadSession('session-v9', ctx.sessionsDir);

      const articlesV4 = await loadSessionArticles(sessionV4, 'session-v4', ctx.sessionsDir);
      const articlesV9 = await loadSessionArticles(sessionV9, 'session-v9', ctx.sessionsDir);

      const result = mergeArticles(new Map([
        ['session-v4', articlesV4],
        ['session-v9', articlesV9],
      ]));

      // Article with pmid:22222222 exists in both, but v9 has abstract
      const mlArticle = result.articles.find((a) => a.pmid === '22222222');
      expect(mlArticle).toBeDefined();
      expect(mlArticle!.abstract).toBe('A detailed abstract about ML diagnosis.');
    });
  });

  describe('merged session detection', () => {
    it('should reject merged sessions as merge sources', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', [pubmedArticles[0]!]],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', [pubmedArticles[1]!]],
      ]));

      // Create a merged session
      const mergedSession = await createMergedSession({
        name: 'merged-ab',
        sources: [
          { id: 'session-a', name: 'a' },
          { id: 'session-b', name: 'b' },
        ],
        byProvider: new Map([['pubmed', [pubmedArticles[0]!, pubmedArticles[1]!]]]),
        totalRetrieved: 2,
        sessionsDir: ctx.sessionsDir,
        sourceSessionIds: ['session-a', 'session-b'],
      });

      // Try to use merged session as source
      const sessions = new Map<string, SessionFile>([
        [mergedSession.id, await loadSession(mergedSession.id, ctx.sessionsDir)],
        ['session-a', await loadSession('session-a', ctx.sessionsDir)],
      ]);

      const validation = validateMergeSources(sessions);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('merged session');
      expect(validation.expandedCommand).toContain('session-a');
      expect(validation.expandedCommand).toContain('session-b');
    });

    it('should reject sessions that are not completed', async () => {
      const sessionDir = join(ctx.sessionsDir, 'partial-session');
      await mkdir(sessionDir, { recursive: true });

      const partialSession: SessionFile = {
        version: 1,
        id: 'partial-session',
        name: 'partial',
        createdAt: '2026-02-08T10:00:00Z',
        updatedAt: '2026-02-08T10:00:00Z',
        query: { file: '/q.yaml', hash: 'abc', targets: ['pubmed'] },
        databases: {
          pubmed: {
            status: 'failed',
            files: { query: 'query_pubmed.txt', results: 'results_pubmed.jsonl' },
            error: { code: 'NETWORK', message: 'Timeout', retryable: true },
          },
        },
        summary: { totalHits: 100, totalRetrieved: 50, status: 'partial' },
      };
      await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(partialSession), 'utf-8');

      await createTestSession(ctx.sessionsDir, 'good-session', 'good', new Map([
        ['pubmed', [pubmedArticles[0]!]],
      ]));

      const sessions = new Map<string, SessionFile>([
        ['partial-session', partialSession],
        ['good-session', await loadSession('good-session', ctx.sessionsDir)],
      ]);

      const validation = validateMergeSources(sessions);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('partial-session');
      expect(validation.error).toContain('partial');
    });
  });

  describe('resume rejection', () => {
    it('should reject resume on merged session', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', [pubmedArticles[0]!]],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', [pubmedArticles[1]!]],
      ]));

      const merged = await createMergedSession({
        name: 'merged-ab',
        sources: [{ id: 'session-a', name: 'a' }, { id: 'session-b', name: 'b' }],
        byProvider: new Map([['pubmed', [pubmedArticles[0]!, pubmedArticles[1]!]]]),
        totalRetrieved: 2,
        sessionsDir: ctx.sessionsDir,
        sourceSessionIds: ['session-a', 'session-b'],
      });

      const result = await getResumableProvidersForCommand(
        merged.id,
        ctx.sessionsDir,
        {},
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('merged session');
    });
  });

  describe('dry-run mode', () => {
    it('should show merge preview without creating session', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', pubmedArticles],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', session2PubmedArticles],
      ]));

      const sessionA = await loadSession('session-a', ctx.sessionsDir);
      const sessionB = await loadSession('session-b', ctx.sessionsDir);

      const articlesA = await loadSessionArticles(sessionA, 'session-a', ctx.sessionsDir);
      const articlesB = await loadSessionArticles(sessionB, 'session-b', ctx.sessionsDir);

      const result = mergeArticles(new Map([
        ['session-a', articlesA],
        ['session-b', articlesB],
      ]));

      const output = formatMergeOutput({
        sessionId: '(dry-run)',
        totalBefore: result.totalBefore,
        totalAfter: result.totalAfter,
        duplicatesRemoved: result.duplicatesRemoved,
        sources: [
          { id: 'session-a', name: 'a', count: articlesA.length },
          { id: 'session-b', name: 'b', count: articlesB.length },
        ],
        byProvider: new Map([...result.byProvider.entries()].map(([k, v]) => [k, v.length])),
      });

      expect(output).toContain('(dry-run)');
      expect(output).toContain('session-a');
      expect(output).toContain('session-b');
      expect(output).toContain('unique');
    });
  });

  describe('JSON output', () => {
    it('should produce valid JSON with merge stats', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', pubmedArticles],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', session2PubmedArticles],
      ]));

      const sessionA = await loadSession('session-a', ctx.sessionsDir);
      const sessionB = await loadSession('session-b', ctx.sessionsDir);

      const articlesA = await loadSessionArticles(sessionA, 'session-a', ctx.sessionsDir);
      const articlesB = await loadSessionArticles(sessionB, 'session-b', ctx.sessionsDir);

      const result = mergeArticles(new Map([
        ['session-a', articlesA],
        ['session-b', articlesB],
      ]));

      const json = formatMergeJson({
        sessionId: 'test-session',
        totalBefore: result.totalBefore,
        totalAfter: result.totalAfter,
        duplicatesRemoved: result.duplicatesRemoved,
        sources: [
          { id: 'session-a', name: 'a', count: articlesA.length },
          { id: 'session-b', name: 'b', count: articlesB.length },
        ],
        byProvider: new Map([...result.byProvider.entries()].map(([k, v]) => [k, v.length])),
      });

      const parsed = JSON.parse(json);
      expect(parsed.sessionId).toBe('test-session');
      expect(parsed.totalBefore).toBe(5);
      expect(parsed.totalAfter).toBe(4);
      expect(parsed.duplicatesRemoved).toBe(1);
      expect(parsed.sources).toHaveLength(2);
    });
  });

  describe('three-session merge', () => {
    it('should merge three sessions correctly', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', [pubmedArticles[0]!]],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', [pubmedArticles[1]!, pubmedArticles[0]!]], // has duplicate with session-a
      ]));
      await createTestSession(ctx.sessionsDir, 'session-c', 'c', new Map([
        ['pubmed', [pubmedArticles[2]!, pubmedArticles[1]!]], // has duplicate with session-b
      ]));

      const sessions = ['session-a', 'session-b', 'session-c'];
      const sessionArticlesMap = new Map<string, Article[]>();

      for (const sid of sessions) {
        const session = await loadSession(sid, ctx.sessionsDir);
        const articles = await loadSessionArticles(session, sid, ctx.sessionsDir);
        sessionArticlesMap.set(sid, articles);
      }

      const result = mergeArticles(sessionArticlesMap);

      expect(result.totalBefore).toBe(5);
      expect(result.duplicatesRemoved).toBe(2);
      expect(result.totalAfter).toBe(3);
    });
  });

  describe('merged session file structure', () => {
    it('should produce correct session.yaml for merged sessions', async () => {
      await createTestSession(ctx.sessionsDir, 'session-a', 'a', new Map([
        ['pubmed', [pubmedArticles[0]!]],
      ]));
      await createTestSession(ctx.sessionsDir, 'session-b', 'b', new Map([
        ['pubmed', [pubmedArticles[1]!]],
      ]));

      const merged = await createMergedSession({
        name: 'test-merged',
        sources: [{ id: 'session-a', name: 'a' }, { id: 'session-b', name: 'b' }],
        byProvider: new Map([['pubmed', [pubmedArticles[0]!, pubmedArticles[1]!]]]) as Map<any, Article[]>,
        totalRetrieved: 2,
        sessionsDir: ctx.sessionsDir,
        sourceSessionIds: ['session-a', 'session-b'],
      });

      // Read and parse the session.yaml
      const sessionYaml = await readFile(
        join(ctx.sessionsDir, merged.id, 'session.yaml'),
        'utf-8',
      );
      const parsed = parseYaml(sessionYaml) as SessionFile;

      expect(parsed.type).toBe('merge');
      expect(parsed.sources).toHaveLength(2);
      expect(parsed.sources![0]!.id).toBe('session-a');
      expect(parsed.sources![1]!.id).toBe('session-b');
      expect(parsed.query).toBeUndefined();
      expect(parsed.summary.status).toBe('completed');
      expect(parsed.summary.totalRetrieved).toBe(2);
      expect(parsed.databases.pubmed?.status).toBe('completed');
      expect(parsed.databases.pubmed?.retrievedCount).toBe(2);
    });
  });
});
