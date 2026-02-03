/**
 * E2E Integration Test for Review Workflow
 *
 * Tests the full workflow:
 * init → status → extract → (simulate edit) → merge → export
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, access, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewInit } from './init.js';
import { executeReviewStatus } from './status.js';
import { executeReviewList } from './list.js';
import { executeReviewExtract } from './extract.js';
import { executeReviewMerge } from './merge.js';
import { executeReviewExport } from './export.js';
import type { ReviewFile } from './types.js';

describe('Review Workflow E2E', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'e2e-test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-e2e-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });

    // Create schema file in .search-hub/schemas
    const schemasDir = join(tempDir, '.search-hub', 'schemas');
    await mkdir(schemasDir, { recursive: true });
    const schemaPath = join(process.cwd(), 'schemas', 'review.schema.json');
    try {
      await access(schemaPath);
      await copyFile(schemaPath, join(schemasDir, 'review.schema.json'));
    } catch {
      // Create a minimal schema if the real one is not available
      await writeFile(
        join(schemasDir, 'review.schema.json'),
        JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: 'Review File' })
      );
    }
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function setupSessionWithResults(): Promise<void> {
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Write session.yaml
    const sessionYaml = `version: 1
id: ${sessionId}
name: E2E Test Session
createdAt: "2024-01-01T00:00:00Z"
updatedAt: "2024-01-01T00:00:00Z"
query:
  file: query.yaml
  hash: abc123
  targets:
    - pubmed
databases:
  pubmed:
    status: completed
    files:
      query: pubmed_query.txt
      results: pubmed_results.jsonl
summary:
  totalHits: 10
  totalRetrieved: 10
`;
    await writeFile(join(sessionDir, 'session.yaml'), sessionYaml);

    // Write results file with 10 articles
    const articles = Array.from({ length: 10 }, (_, i) => ({
      title: `Article ${i + 1}`,
      authors: [{ family: `Author${i + 1}` }],
      pmid: `${1000 + i}`,
      doi: `10.1234/test${i + 1}`,
      publicationDate: `202${i % 5}-01-01`,
      abstract: `Abstract for article ${i + 1}`,
      source: 'pubmed',
      retrievedAt: '2024-01-01T00:00:00Z',
    }));

    const jsonl = articles.map((a) => JSON.stringify(a)).join('\n');
    await writeFile(join(sessionDir, 'pubmed_results.jsonl'), jsonl);
  }

  it('completes full workflow: init → status → list → extract → merge → export', async () => {
    // Setup session with search results
    await setupSessionWithResults();

    // Step 1: Init - Generate reviews.yaml
    const initResult = await executeReviewInit({ sessionId }, sessionsDir);
    expect(initResult.articleCount).toBe(10);

    // Verify reviews.yaml was created
    const reviewsPath = join(sessionsDir, sessionId, 'reviews.yaml');
    await access(reviewsPath);

    // Step 2: Status - Check initial status (all pending)
    const statusResult1 = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(statusResult1.total).toBe(10);
    expect(statusResult1.pending).toBe(10);
    expect(statusResult1.conflicting).toBe(0);
    expect(statusResult1.needsFinal).toBe(0);
    expect(statusResult1.finalized).toBe(0);

    // Step 3: List - Verify pending articles
    const listResult = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);
    expect(listResult.articles).toHaveLength(10);

    // Step 4: Extract - Create batch for review
    const batchPath = join(tempDir, 'work', 'batch1.yaml');
    const extractResult = await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 5, output: batchPath },
      sessionsDir
    );
    expect(extractResult.extractedCount).toBe(5);

    // Verify extracted file has schema reference
    const extractedContent = await readFile(batchPath, 'utf-8');
    expect(extractedContent).toContain('yaml-language-server');

    // Step 5: Simulate manual review by editing extracted file
    const extractedFile = parseYaml(extractedContent) as ReviewFile;

    // Add reviews to extracted articles
    extractedFile.articles[0]!.reviews.push({
      reviewer: 'gpt-4o',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    extractedFile.articles[0]!.finalDecision = 'include';

    extractedFile.articles[1]!.reviews.push({
      reviewer: 'gpt-4o',
      decision: 'exclude',
      timestamp: '2024-01-02T00:00:00Z',
    });
    extractedFile.articles[1]!.finalDecision = 'exclude';

    extractedFile.articles[2]!.reviews.push({
      reviewer: 'gpt-4o',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    extractedFile.articles[2]!.reviews.push({
      reviewer: 'claude',
      decision: 'exclude',
      timestamp: '2024-01-02T01:00:00Z',
    });
    // Leave as conflicting (no finalDecision)

    extractedFile.articles[3]!.reviews.push({
      reviewer: 'human:reviewer1',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    // Leave as needs-final (review but no finalDecision)

    // Write edited file back
    const editedContent = stringifyYaml(extractedFile);
    await writeFile(batchPath, editedContent);

    // Step 6: Merge - Combine reviewed articles back
    const mergeResult = await executeReviewMerge(
      { sessionId, file: batchPath },
      sessionsDir
    );
    expect(mergeResult.reviewsAdded).toBe(5); // 1+1+2+1+0
    expect(mergeResult.decisionsSet).toBe(2); // Two finalDecisions set

    // Step 7: Status - Verify updated counts
    const statusResult2 = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(statusResult2.total).toBe(10);
    expect(statusResult2.pending).toBe(6); // 10 - 4 reviewed
    expect(statusResult2.conflicting).toBe(1);
    expect(statusResult2.needsFinal).toBe(1);
    expect(statusResult2.finalized).toBe(2);
    expect(statusResult2.included).toBe(1);
    expect(statusResult2.excluded).toBe(1);

    // Step 8: Export - Export included articles
    const exportPath = join(tempDir, 'output', 'included.yaml');
    const exportResult = await executeReviewExport(
      { sessionId, only: 'included', output: exportPath, format: 'yaml' },
      sessionsDir
    );
    expect(exportResult.exportedCount).toBe(1);

    // Verify export content
    const exportContent = await readFile(exportPath, 'utf-8');
    const exportedFile = parseYaml(exportContent) as { articles: Array<{ title: string }> };
    expect(exportedFile.articles).toHaveLength(1);
    expect(exportedFile.articles[0]!.title).toBe('Article 1');
  });

  it('handles schema validation in extracted files', async () => {
    await setupSessionWithResults();

    // Init
    await executeReviewInit({ sessionId }, sessionsDir);

    // Extract with schema
    const batchPath = join(tempDir, 'work', 'batch.yaml');
    await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 3, output: batchPath },
      sessionsDir
    );

    // Verify schema reference is present and points to adjacent file
    const content = await readFile(batchPath, 'utf-8');
    expect(content).toMatch(/^# yaml-language-server: \$schema=\.\/review\.schema\.json/);

    // Verify schema file was copied alongside
    const schemaPath = join(tempDir, 'work', 'review.schema.json');
    await access(schemaPath);
    const schemaContent = await readFile(schemaPath, 'utf-8');
    expect(schemaContent).toContain('json-schema.org');
  });

  it('preserves data integrity through multiple extract-merge cycles', async () => {
    await setupSessionWithResults();

    // Init
    await executeReviewInit({ sessionId }, sessionsDir);

    // First cycle: Extract → Edit → Merge
    const batch1Path = join(tempDir, 'work', 'batch1.yaml');
    await executeReviewExtract(
      { sessionId, filter: ['pending'], offset: 0, limit: 3, output: batch1Path },
      sessionsDir
    );

    const batch1Content = await readFile(batch1Path, 'utf-8');
    const batch1 = parseYaml(batch1Content) as ReviewFile;
    batch1.articles[0]!.reviews.push({
      reviewer: 'reviewer1',
      decision: 'include',
      timestamp: '2024-01-01T00:00:00Z',
    });
    batch1.articles[0]!.finalDecision = 'include';
    await writeFile(batch1Path, stringifyYaml(batch1));
    await executeReviewMerge({ sessionId, file: batch1Path }, sessionsDir);

    // Second cycle: Another reviewer
    const batch2Path = join(tempDir, 'work', 'batch2.yaml');
    await executeReviewExtract(
      { sessionId, filter: ['pending'], offset: 0, limit: 3, output: batch2Path },
      sessionsDir
    );

    const batch2Content = await readFile(batch2Path, 'utf-8');
    const batch2 = parseYaml(batch2Content) as ReviewFile;
    batch2.articles[0]!.reviews.push({
      reviewer: 'reviewer2',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    batch2.articles[0]!.finalDecision = 'include';
    await writeFile(batch2Path, stringifyYaml(batch2));
    await executeReviewMerge({ sessionId, file: batch2Path }, sessionsDir);

    // Verify final state
    // Cycle 1: finalized 1 article (Article 1)
    // Cycle 2: extracted 3 pending (Articles 2,3,4), finalized Article 2
    // Result: 2 finalized, 8 pending
    const status = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(status.finalized).toBe(2);
    expect(status.pending).toBe(8);

    // Verify the first article has the review from cycle 1
    const finalReviews = await readFile(join(sessionsDir, sessionId, 'reviews.yaml'), 'utf-8');
    const finalFile = parseYaml(finalReviews) as ReviewFile;
    const article1 = finalFile.articles[0];
    expect(article1!.reviews).toHaveLength(1); // reviewer1's review
    expect(article1!.finalDecision).toBe('include');
  });

  it('handles dry-run merge correctly', async () => {
    await setupSessionWithResults();

    await executeReviewInit({ sessionId }, sessionsDir);

    const batchPath = join(tempDir, 'work', 'batch.yaml');
    await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 2, output: batchPath },
      sessionsDir
    );

    // Edit batch
    const batchContent = await readFile(batchPath, 'utf-8');
    const batch = parseYaml(batchContent) as ReviewFile;
    batch.articles[0]!.reviews.push({
      reviewer: 'test',
      decision: 'include',
      timestamp: '2024-01-01T00:00:00Z',
    });
    batch.articles[0]!.finalDecision = 'include';
    await writeFile(batchPath, stringifyYaml(batch));

    // Dry-run merge
    const dryRunResult = await executeReviewMerge(
      { sessionId, file: batchPath, dryRun: true },
      sessionsDir
    );
    expect(dryRunResult.reviewsAdded).toBe(1);
    expect(dryRunResult.decisionsSet).toBe(1);

    // Verify no changes were made
    const status = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(status.finalized).toBe(0);
    expect(status.pending).toBe(10);
  });
});
