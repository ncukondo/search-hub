import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';
import {
  mergeArticles,
  copySourceProvenance,
  createMergedSession,
  formatMergeOutput,
  formatMergeJson,
  validateMergeSources,
} from './merge.js';

const makeArticle = (overrides: Partial<Article> & Pick<Article, 'title' | 'source'>): Article => ({
  authors: [{ family: 'Test', given: 'Author' }],
  retrievedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

describe('mergeArticles', () => {
  it('should merge articles from multiple sessions', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [makeArticle({ doi: '10.1234/a1', title: 'Article A1', source: 'pubmed' })]],
      ['session-b', [makeArticle({ doi: '10.1234/b1', title: 'Article B1', source: 'pubmed' })]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(2);
    expect(result.totalBefore).toBe(2);
    expect(result.totalAfter).toBe(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('should deduplicate articles by DOI (case-insensitive)', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      [
        'session-a',
        [makeArticle({ doi: '10.1234/SAME', title: 'Article Same', source: 'pubmed' })],
      ],
      [
        'session-b',
        [makeArticle({ doi: '10.1234/same', title: 'Article Same (copy)', source: 'scopus' })],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.totalBefore).toBe(2);
    expect(result.totalAfter).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should deduplicate articles by PMID', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [makeArticle({ pmid: '12345678', title: 'Article A', source: 'pubmed' })]],
      [
        'session-b',
        [makeArticle({ pmid: '12345678', title: 'Article A (other)', source: 'pubmed' })],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it('should keep richer metadata when deduplicating', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      [
        'session-a',
        [
          makeArticle({
            doi: '10.1234/a1',
            title: 'Sparse Article',
            source: 'pubmed',
          }),
        ],
      ],
      [
        'session-b',
        [
          makeArticle({
            doi: '10.1234/a1',
            title: 'Rich Article',
            source: 'scopus',
            abstract: 'This article has an abstract',
            journal: 'Test Journal',
            volume: '1',
          }),
        ],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.abstract).toBe('This article has an abstract');
    expect(result.articles[0]!.journal).toBe('Test Journal');
  });

  it('should keep articles without identifiers', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [makeArticle({ title: 'No ID Article A', source: 'pubmed' })]],
      ['session-b', [makeArticle({ title: 'No ID Article B', source: 'scopus' })]],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('should group merged articles by provider', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      [
        'session-a',
        [
          makeArticle({ doi: '10.1234/a1', title: 'PubMed Article', source: 'pubmed' }),
          makeArticle({ doi: '10.1234/a2', title: 'Scopus Article', source: 'scopus' }),
        ],
      ],
      [
        'session-b',
        [makeArticle({ doi: '10.1234/b1', title: 'Another PubMed', source: 'pubmed' })],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.byProvider.get('pubmed')).toHaveLength(2);
    expect(result.byProvider.get('scopus')).toHaveLength(1);
  });

  it('should handle three or more sessions', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      ['session-a', [makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' })]],
      [
        'session-b',
        [
          makeArticle({ doi: '10.1234/b1', title: 'Article B', source: 'pubmed' }),
          makeArticle({ doi: '10.1234/a1', title: 'Article A dup', source: 'pubmed' }),
        ],
      ],
      [
        'session-c',
        [
          makeArticle({ doi: '10.1234/c1', title: 'Article C', source: 'pubmed' }),
          makeArticle({ doi: '10.1234/b1', title: 'Article B dup', source: 'pubmed' }),
        ],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.articles).toHaveLength(3);
    expect(result.totalBefore).toBe(5);
    expect(result.duplicatesRemoved).toBe(2);
  });

  it('should track per-session stats', () => {
    const sessionArticles: Map<string, Article[]> = new Map([
      [
        'session-a',
        [
          makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
          makeArticle({ doi: '10.1234/a2', title: 'Article A2', source: 'pubmed' }),
        ],
      ],
      [
        'session-b',
        [
          makeArticle({ doi: '10.1234/a1', title: 'Article A dup', source: 'pubmed' }),
          makeArticle({ doi: '10.1234/b1', title: 'Article B', source: 'pubmed' }),
        ],
      ],
    ]);

    const result = mergeArticles(sessionArticles);

    expect(result.perSession.get('session-a')).toBe(2);
    expect(result.perSession.get('session-b')).toBe(2);
  });
});

function makeSession(
  overrides: Partial<SessionFile> & Pick<SessionFile, 'id' | 'name'>,
): SessionFile {
  return {
    version: 1,
    createdAt: '2026-02-08T10:00:00Z',
    updatedAt: '2026-02-08T10:00:00Z',
    query: {
      file: '/path/to/query.yaml',
      hash: 'abc123',
      targets: ['pubmed'],
    },
    databases: {
      pubmed: {
        status: 'completed',
        retrievedCount: 10,
        files: { query: 'query_pubmed.txt', results: 'results_pubmed.jsonl' },
      },
    },
    summary: { totalHits: 10, totalRetrieved: 10, status: 'completed' },
    ...overrides,
  };
}

async function setupSessionDir(sessionsDir: string, session: SessionFile): Promise<void> {
  const sessionDir = join(sessionsDir, session.id);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');
  await writeFile(join(sessionDir, 'query_common.yaml'), 'name: test\nblocks: []\n', 'utf-8');
  await writeFile(join(sessionDir, 'query_pubmed.txt'), 'diabetes[tiab]', 'utf-8');
}

describe('copySourceProvenance', () => {
  it('should copy session.yaml, query_common.yaml, and query texts to sources/', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'merge-test-'));
    const sourceSession = makeSession({ id: 'session-a', name: 'session-a' });
    await setupSessionDir(sessionsDir, sourceSession);

    const mergedDir = join(sessionsDir, 'merged-session');
    await mkdir(mergedDir, { recursive: true });

    await copySourceProvenance('session-a', sessionsDir, mergedDir);

    const sourcesDir = join(mergedDir, 'sources', 'session-a');
    const files = await readdir(sourcesDir);
    expect(files).toContain('session.yaml');
    expect(files).toContain('query_common.yaml');
    expect(files).toContain('query_pubmed.txt');

    const queryContent = await readFile(join(sourcesDir, 'query_pubmed.txt'), 'utf-8');
    expect(queryContent).toBe('diabetes[tiab]');
  });
});

describe('validateMergeSources', () => {
  it('should reject merged sessions as sources', () => {
    const sessions = new Map<string, SessionFile>([
      [
        'merged-session',
        makeSession({
          id: 'merged-session',
          name: 'merged',
          type: 'merge',
          sources: [
            { id: 'session-a', name: 'a' },
            { id: 'session-b', name: 'b' },
          ],
        }),
      ],
      ['session-c', makeSession({ id: 'session-c', name: 'c' })],
    ]);

    const result = validateMergeSources(sessions);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('merged-session');
    expect(result.expandedCommand).toContain('session-a');
    expect(result.expandedCommand).toContain('session-b');
    expect(result.expandedCommand).toContain('session-c');
  });

  it('should reject sessions that are not completed', () => {
    const sessions = new Map<string, SessionFile>([
      [
        'session-a',
        makeSession({
          id: 'session-a',
          name: 'a',
          summary: { totalHits: 10, totalRetrieved: 5, status: 'partial' },
        }),
      ],
      ['session-b', makeSession({ id: 'session-b', name: 'b' })],
    ]);

    const result = validateMergeSources(sessions);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('session-a');
    expect(result.error).toContain('partial');
  });

  it('should accept valid completed sessions', () => {
    const sessions = new Map<string, SessionFile>([
      ['session-a', makeSession({ id: 'session-a', name: 'a' })],
      ['session-b', makeSession({ id: 'session-b', name: 'b' })],
    ]);

    const result = validateMergeSources(sessions);

    expect(result.valid).toBe(true);
  });
});

describe('createMergedSession', () => {
  it('should create a merged session directory with results', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'merge-create-'));
    const sessionA = makeSession({ id: 'session-a', name: 'a' });
    const sessionB = makeSession({ id: 'session-b', name: 'b' });
    await setupSessionDir(sessionsDir, sessionA);
    await setupSessionDir(sessionsDir, sessionB);

    const articles = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/b1', title: 'Article B', source: 'pubmed' }),
    ];

    const byProvider = new Map<string, Article[]>([['pubmed', articles]]);

    const sources = [
      { id: 'session-a', name: 'a' },
      { id: 'session-b', name: 'b' },
    ];

    const sessionFile = await createMergedSession({
      name: 'merged',
      sources,
      byProvider: byProvider as Map<any, Article[]>,
      totalRetrieved: 2,
      sessionsDir,
      sourceSessionIds: ['session-a', 'session-b'],
    });

    expect(sessionFile.type).toBe('merge');
    expect(sessionFile.sources).toHaveLength(2);
    expect(sessionFile.summary.status).toBe('completed');
    expect(sessionFile.summary.totalRetrieved).toBe(2);

    // Verify session directory exists
    const sessionDir = join(sessionsDir, sessionFile.id);
    const files = await readdir(sessionDir);
    expect(files).toContain('session.yaml');
    expect(files).toContain('pubmed_results.jsonl');

    // Verify sources/ provenance
    const sourcesDir = join(sessionDir, 'sources');
    const sourceEntries = await readdir(sourcesDir);
    expect(sourceEntries).toContain('session-a');
    expect(sourceEntries).toContain('session-b');
  });
});

describe('formatMergeOutput', () => {
  it('should format merge result as human-readable text', () => {
    const output = formatMergeOutput({
      sessionId: 'merged-123',
      totalBefore: 10,
      totalAfter: 8,
      duplicatesRemoved: 2,
      sources: [
        { id: 'session-a', name: 'a', count: 5 },
        { id: 'session-b', name: 'b', count: 5 },
      ],
      byProvider: new Map([
        ['pubmed', 5],
        ['scopus', 3],
      ]),
    });

    expect(output).toContain('merged-123');
    expect(output).toContain('8');
    expect(output).toContain('2');
    expect(output).toContain('session-a');
    expect(output).toContain('session-b');
  });
});

describe('formatMergeJson', () => {
  it('should format merge result as JSON', () => {
    const json = formatMergeJson({
      sessionId: 'merged-123',
      totalBefore: 10,
      totalAfter: 8,
      duplicatesRemoved: 2,
      sources: [
        { id: 'session-a', name: 'a', count: 5 },
        { id: 'session-b', name: 'b', count: 5 },
      ],
      byProvider: new Map([
        ['pubmed', 5],
        ['scopus', 3],
      ]),
    });

    const parsed = JSON.parse(json);
    expect(parsed.sessionId).toBe('merged-123');
    expect(parsed.totalAfter).toBe(8);
    expect(parsed.duplicatesRemoved).toBe(2);
    expect(parsed.sources).toHaveLength(2);
  });
});
