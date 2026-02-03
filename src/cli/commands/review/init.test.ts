import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { executeReviewInit, type ReviewInitOptions } from './init.js';
import type { ReviewFile } from './types.js';

describe('executeReviewInit', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-init-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function setupSession(provider: string, results?: string[]): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Write minimal session.yaml that executeReviewInit can parse
    const sessionYaml = `version: 1
id: ${sessionId}
name: Test Session
createdAt: "2024-01-01T00:00:00Z"
updatedAt: "2024-01-01T00:00:00Z"
query:
  file: query.yaml
  hash: abc123
  targets:
    - ${provider}
databases:
  ${provider}:
    status: completed
    files:
      query: ${provider}_query.txt
      results: ${provider}_results.jsonl
summary:
  totalHits: ${results?.length ?? 0}
  totalRetrieved: ${results?.length ?? 0}
`;

    await writeFile(join(sessionDir, 'session.yaml'), sessionYaml);

    // Write results file if provided
    if (results && results.length > 0) {
      await writeFile(join(sessionDir, `${provider}_results.jsonl`), results.join('\n'));
    }
  }

  it('generates reviews.yaml with correct structure', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'Article 1', authors: [], pmid: '111', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
      JSON.stringify({ title: 'Article 2', authors: [], pmid: '222', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');

    // Should include schema reference comment
    expect(content).toContain('yaml-language-server');
    expect(content).toContain('review.schema.json');

    // Parse and check structure
    const reviewFile = parseYaml(content) as ReviewFile;
    expect(reviewFile.sessionId).toBe(sessionId);
    expect(reviewFile.articles).toHaveLength(2);
    // reviews is null when parsed because it has only comments (no actual items)
    // This is expected - the comments serve as examples for users
    expect(reviewFile.articles[0]!.reviews).toBeNull();
    expect(reviewFile.articles[0]!.title).toBe('Article 1');
    expect(reviewFile.articles[1]!.title).toBe('Article 2');

    // Verify that example comments are present in the raw YAML
    expect(content).toContain('# - reviewer: human:your-name');
    expect(content).toContain('# include / exclude / uncertain');
  });

  it('includes schema reference comment at the top', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'Article', authors: [], pmid: '111', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');

    // Schema comment should be first line
    const firstLine = content.split('\n')[0];
    expect(firstLine).toMatch(/^# yaml-language-server.*review\.schema\.json/);
  });

  it('copies schema file to .search-hub/schemas/', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'Article', authors: [], pmid: '111', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    // Check schema file was copied
    const schemaPath = join(tempDir, '.search-hub', 'schemas', 'review.schema.json');
    const schemaContent = await readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    expect(schema.$schema).toContain('json-schema.org');
    expect(schema.title).toBe('Review File');
  });

  it('fails if reviews.yaml already exists (without --force)', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'Article', authors: [], pmid: '111', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    // Create existing reviews.yaml
    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    await writeFile(reviewsPath, 'existing: content');

    const options: ReviewInitOptions = { sessionId };
    await expect(executeReviewInit(options, sessionsDir)).rejects.toThrow(/already exists/);
  });

  it('overwrites reviews.yaml when --force is used', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'New Article', authors: [], pmid: '999', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    // Create existing reviews.yaml
    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    await writeFile(reviewsPath, 'sessionId: old\narticles: []');

    const options: ReviewInitOptions = { sessionId, force: true };
    await executeReviewInit(options, sessionsDir);

    const content = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(content) as ReviewFile;
    expect(reviewFile.articles).toHaveLength(1);
    expect(reviewFile.articles[0]!.title).toBe('New Article');
  });

  it('deduplicates articles across providers', async () => {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Write session with two providers
    const sessionYaml = `version: 1
id: ${sessionId}
name: Test Session
createdAt: "2024-01-01T00:00:00Z"
updatedAt: "2024-01-01T00:00:00Z"
query:
  file: query.yaml
  hash: abc123
  targets:
    - pubmed
    - scopus
databases:
  pubmed:
    status: completed
    files:
      query: pubmed_query.txt
      results: pubmed_results.jsonl
  scopus:
    status: completed
    files:
      query: scopus_query.txt
      results: scopus_results.jsonl
summary:
  totalHits: 2
  totalRetrieved: 2
`;

    await writeFile(join(sessionDir, 'session.yaml'), sessionYaml);

    // Same article from two providers (shared DOI)
    await writeFile(join(sessionDir, 'pubmed_results.jsonl'),
      JSON.stringify({ title: 'Shared Article', authors: [], pmid: '111', doi: '10.1234/shared', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' })
    );
    await writeFile(join(sessionDir, 'scopus_results.jsonl'),
      JSON.stringify({ title: 'Shared Article', authors: [], scopusId: 'S222', doi: '10.1234/shared', source: 'scopus', retrievedAt: '2024-01-01T00:00:00Z' })
    );

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    const reviewsPath = join(sessionDir, 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(content) as ReviewFile;

    // Should have 1 article (deduplicated)
    expect(reviewFile.articles).toHaveLength(1);
    // Should have mergedFrom with both sources
    expect(reviewFile.articles[0]!.mergedFrom).toHaveLength(2);
  });

  it('extracts year from publicationDate', async () => {
    await setupSession('pubmed', [
      JSON.stringify({ title: 'Article', authors: [], pmid: '111', publicationDate: '2023-06-15', source: 'pubmed', retrievedAt: '2024-01-01T00:00:00Z' }),
    ]);

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(content) as ReviewFile;

    expect(reviewFile.articles[0]!.year).toBe('2023');
  });

  it('formats authors as string', async () => {
    await setupSession('pubmed', [
      JSON.stringify({
        title: 'Article',
        authors: [{ family: 'Smith', given: 'John' }, { family: 'Doe', given: 'Jane' }],
        pmid: '111',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z'
      }),
    ]);

    const options: ReviewInitOptions = { sessionId };
    await executeReviewInit(options, sessionsDir);

    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    const content = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(content) as ReviewFile;

    expect(reviewFile.articles[0]!.authors).toBe('Smith J, Doe J');
  });
});
