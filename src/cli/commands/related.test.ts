/**
 * Tests for related command module.
 */

import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile } from '../../session/types.js';
import {
  parseRelatedOptions,
  validateRelatedInput,
  resolveSeeds,
  formatRelatedOutput,
  createRelatedSession,
} from './related.js';

describe('parseRelatedOptions', () => {
  it('should parse positional PMIDs', () => {
    const result = parseRelatedOptions(['12345678', '23456789'], {});
    expect(result.pmids).toEqual(['12345678', '23456789']);
    expect(result.maxResults).toBe(20);
  });

  it('should parse name option', () => {
    const result = parseRelatedOptions(['12345678'], { name: 'my-related' });
    expect(result.name).toBe('my-related');
  });

  it('should parse max-results option', () => {
    const result = parseRelatedOptions(['12345678'], { maxResults: '50' });
    expect(result.maxResults).toBe(50);
  });

  it('should parse from-session option', () => {
    const result = parseRelatedOptions([], {
      fromSession: 'session-abc',
      pmid: ['12345678'],
    });
    expect(result.fromSession).toBe('session-abc');
    expect(result.pmids).toEqual(['12345678']);
  });

  it('should parse term option', () => {
    const result = parseRelatedOptions(['12345678'], { term: 'review[filter]' });
    expect(result.term).toBe('review[filter]');
  });

  it('should handle pmid option as string', () => {
    const result = parseRelatedOptions([], {
      fromSession: 'session-abc',
      pmid: '12345678',
    });
    expect(result.pmids).toEqual(['12345678']);
  });
});

describe('validateRelatedInput', () => {
  it('should accept valid PMIDs', () => {
    const result = validateRelatedInput({
      pmids: ['12345678', '23456789'],
      maxResults: 20,
    });
    expect(result.valid).toBe(true);
  });

  it('should reject empty PMIDs without from-session', () => {
    const result = validateRelatedInput({
      pmids: [],
      maxResults: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('PMID');
  });

  it('should accept empty PMIDs with from-session', () => {
    const result = validateRelatedInput({
      pmids: [],
      maxResults: 20,
      fromSession: 'session-abc',
    });
    expect(result.valid).toBe(true);
  });

  it('should reject invalid PMID format', () => {
    const result = validateRelatedInput({
      pmids: ['abc', '12345678'],
      maxResults: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('abc');
  });

  it('should reject maxResults <= 0', () => {
    const result = validateRelatedInput({
      pmids: ['12345678'],
      maxResults: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('max-results');
  });
});

describe('resolveSeeds', () => {
  it('should return PMIDs directly when no from-session', async () => {
    const result = await resolveSeeds({
      pmids: ['12345678', '23456789'],
      maxResults: 20,
    }, '');
    expect(result).toEqual(['12345678', '23456789']);
  });

  it('should load PMIDs from session and filter by --pmid', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'related-test-'));
    const sessionId = 'test-session';
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Create session.yaml
    const session: SessionFile = {
      version: 1,
      id: sessionId,
      name: 'test',
      createdAt: '2026-02-16T10:00:00Z',
      updatedAt: '2026-02-16T10:00:00Z',
      databases: {
        pubmed: {
          status: 'completed',
          retrievedCount: 2,
          files: { query: '', results: 'results_pubmed.jsonl' },
        },
      },
      summary: { totalHits: 2, totalRetrieved: 2, status: 'completed' },
    };
    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session));

    // Create results file with articles that have PMIDs
    const articles: Article[] = [
      { title: 'Article 1', pmid: '11111111', source: 'pubmed', authors: [], retrievedAt: '2026-01-01T00:00:00Z' },
      { title: 'Article 2', pmid: '22222222', source: 'pubmed', authors: [], retrievedAt: '2026-01-01T00:00:00Z' },
      { title: 'Article 3', pmid: '33333333', source: 'pubmed', authors: [], retrievedAt: '2026-01-01T00:00:00Z' },
    ];
    const jsonl = articles.map(a => JSON.stringify(a)).join('\n') + '\n';
    await writeFile(join(sessionDir, 'pubmed_results.jsonl'), jsonl);

    const result = await resolveSeeds({
      pmids: ['11111111', '33333333'],
      fromSession: sessionId,
      maxResults: 20,
    }, sessionsDir);

    expect(result).toEqual(['11111111', '33333333']);
  });

  it('should error when --pmid value not found in session', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'related-test-'));
    const sessionId = 'test-session';
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    const session: SessionFile = {
      version: 1,
      id: sessionId,
      name: 'test',
      createdAt: '2026-02-16T10:00:00Z',
      updatedAt: '2026-02-16T10:00:00Z',
      databases: {
        pubmed: {
          status: 'completed',
          retrievedCount: 1,
          files: { query: '', results: 'results_pubmed.jsonl' },
        },
      },
      summary: { totalHits: 1, totalRetrieved: 1, status: 'completed' },
    };
    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session));

    const articles: Article[] = [
      { title: 'Article 1', pmid: '11111111', source: 'pubmed', authors: [], retrievedAt: '2026-01-01T00:00:00Z' },
    ];
    await writeFile(
      join(sessionDir, 'pubmed_results.jsonl'),
      articles.map(a => JSON.stringify(a)).join('\n') + '\n'
    );

    await expect(resolveSeeds({
      pmids: ['99999999'],
      fromSession: sessionId,
      maxResults: 20,
    }, sessionsDir)).rejects.toThrow('99999999');
  });
});

describe('createRelatedSession', () => {
  it('should create a session directory with correct structure', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'related-create-'));

    const articles: Article[] = [
      {
        title: 'Related Article 1',
        pmid: '44444444',
        source: 'pubmed',
        authors: [{ family: 'Smith', given: 'John' }],
        retrievedAt: '2026-02-16T10:00:00Z',
      },
      {
        title: 'Related Article 2',
        pmid: '55555555',
        source: 'pubmed',
        authors: [{ family: 'Doe', given: 'Jane' }],
        retrievedAt: '2026-02-16T10:00:00Z',
      },
    ];

    const sessionFile = await createRelatedSession({
      name: 'my-related',
      seeds: { ids: ['12345678', '23456789'] },
      articles,
      sessionsDir,
    });

    expect(sessionFile.type).toBe('related');
    expect(sessionFile.seeds).toEqual({ ids: ['12345678', '23456789'] });
    expect(sessionFile.summary.totalRetrieved).toBe(2);
    expect(sessionFile.summary.status).toBe('completed');

    // Verify files on disk
    const sessionDir = join(sessionsDir, sessionFile.id);
    const files = await readdir(sessionDir);
    expect(files).toContain('session.yaml');
    expect(files).toContain('pubmed_results.jsonl');
    expect(files).toContain('pubmed_results.yaml');

    // Verify session.yaml content
    const content = await readFile(join(sessionDir, 'session.yaml'), 'utf-8');
    expect(content).toContain('related');
    expect(content).toContain('12345678');
  });

  it('should include sourceSession in seeds when provided', async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), 'related-create-'));

    const sessionFile = await createRelatedSession({
      name: 'from-session-related',
      seeds: { ids: ['12345678'], sourceSession: 'original-session' },
      articles: [{
        title: 'Related',
        pmid: '44444444',
        source: 'pubmed',
        authors: [],
        retrievedAt: '2026-02-16T10:00:00Z',
      }],
      sessionsDir,
    });

    expect(sessionFile.seeds?.sourceSession).toBe('original-session');
  });
});

describe('formatRelatedOutput', () => {
  it('should format summary with seed count and results', () => {
    const output = formatRelatedOutput({
      sessionId: 'related-session-123',
      seedCount: 2,
      totalRelated: 50,
      retrievedCount: 20,
      articles: [
        {
          title: 'Very Important Related Article About Medicine',
          pmid: '44444444',
          source: 'pubmed',
          authors: [{ family: 'Smith' }],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
        {
          title: 'Another Related Study',
          pmid: '55555555',
          source: 'pubmed',
          authors: [{ family: 'Doe' }],
          retrievedAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    expect(output).toContain('related-session-123');
    expect(output).toContain('2');  // seed count
    expect(output).toContain('50'); // total related
    expect(output).toContain('20'); // retrieved
    expect(output).toContain('Very Important Related Article');
    expect(output).toContain('Another Related Study');
  });

  it('should truncate long titles', () => {
    const longTitle = 'A'.repeat(100);
    const output = formatRelatedOutput({
      sessionId: 'test',
      seedCount: 1,
      totalRelated: 1,
      retrievedCount: 1,
      articles: [{
        title: longTitle,
        pmid: '11111111',
        source: 'pubmed',
        authors: [],
        retrievedAt: '2026-01-01T00:00:00Z',
      }],
    });

    // Title should be truncated
    expect(output.length).toBeLessThan(longTitle.length + 200);
  });
});
