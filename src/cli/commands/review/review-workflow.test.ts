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
import { executeReviewMark } from './mark.js';
import { getIncludedArticles } from '../register.js';
import type { ReviewFile, WorkFile } from './types.js';

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

    // Verify reviews.yaml was created in .internal/
    const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
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

    // Add reviews to extracted articles (initialize reviews array if null from YAML parsing)
    extractedFile.articles[0]!.reviews = extractedFile.articles[0]!.reviews ?? [];
    extractedFile.articles[0]!.reviews.push({
      reviewer: 'gpt-4o',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    extractedFile.articles[0]!.finalDecision = 'include';

    extractedFile.articles[1]!.reviews = extractedFile.articles[1]!.reviews ?? [];
    extractedFile.articles[1]!.reviews.push({
      reviewer: 'gpt-4o',
      decision: 'exclude',
      timestamp: '2024-01-02T00:00:00Z',
    });
    extractedFile.articles[1]!.finalDecision = 'exclude';

    extractedFile.articles[2]!.reviews = extractedFile.articles[2]!.reviews ?? [];
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

    extractedFile.articles[3]!.reviews = extractedFile.articles[3]!.reviews ?? [];
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
    batch1.articles[0]!.reviews = batch1.articles[0]!.reviews ?? [];
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
    batch2.articles[0]!.reviews = batch2.articles[0]!.reviews ?? [];
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
    const finalReviews = await readFile(join(sessionsDir, sessionId, '.internal', 'reviews.yaml'), 'utf-8');
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
    batch.articles[0]!.reviews = batch.articles[0]!.reviews ?? [];
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

  it('preserves source information from search through register --reviewed', async () => {
    // Setup session with multiple sources
    const sessionDir = join(sessionsDir, sessionId);
    await mkdir(sessionDir, { recursive: true });

    // Write session.yaml
    const sessionYaml = `version: 1
id: ${sessionId}
name: Multi-source Test Session
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
  totalHits: 6
  totalRetrieved: 6
`;
    await writeFile(join(sessionDir, 'session.yaml'), sessionYaml);

    // Create articles from different sources
    // Article 1: from PubMed only
    // Article 2: from Scopus only
    // Article 3: from both (will be merged by DOI)
    const pubmedArticles = [
      {
        title: 'PubMed Only Article',
        authors: [{ family: 'Smith' }],
        pmid: '1001',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Multi-source Article',
        authors: [{ family: 'Jones' }],
        pmid: '1003',
        doi: '10.1234/multi',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];
    await writeFile(
      join(sessionDir, 'pubmed_results.jsonl'),
      pubmedArticles.map((a) => JSON.stringify(a)).join('\n')
    );

    const scopusArticles = [
      {
        title: 'Scopus Only Article',
        authors: [{ family: 'Brown' }],
        scopusId: '2-s2.0-2002',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Multi-source Article from Scopus',
        authors: [{ family: 'Jones' }],
        scopusId: '2-s2.0-2003',
        doi: '10.1234/multi',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];
    await writeFile(
      join(sessionDir, 'scopus_results.jsonl'),
      scopusArticles.map((a) => JSON.stringify(a)).join('\n')
    );

    // Step 1: Init review - should deduplicate and track mergedFrom
    const initResult = await executeReviewInit({ sessionId }, sessionsDir);
    expect(initResult.articleCount).toBe(3); // 2 unique + 1 merged

    // Read and verify reviews.yaml has mergedFrom for all articles
    const reviewsPath = join(sessionDir, '.internal', 'reviews.yaml');
    const reviewsContent = await readFile(reviewsPath, 'utf-8');
    const reviewFile = parseYaml(reviewsContent) as ReviewFile;

    // All articles should have mergedFrom
    for (const article of reviewFile.articles) {
      expect(article.mergedFrom).toBeDefined();
      expect(article.mergedFrom!.length).toBeGreaterThanOrEqual(1);
    }

    // Find the merged article (with DOI)
    const mergedArticle = reviewFile.articles.find((a) => a.doi === '10.1234/multi');
    expect(mergedArticle).toBeDefined();
    expect(mergedArticle!.mergedFrom).toHaveLength(2);
    const mergedSources = mergedArticle!.mergedFrom!.map((m) => m.source);
    expect(mergedSources).toContain('pubmed');
    expect(mergedSources).toContain('scopus');

    // Find single-source articles
    const pubmedOnlyArticle = reviewFile.articles.find((a) => a.pmid === '1001');
    expect(pubmedOnlyArticle!.mergedFrom).toHaveLength(1);
    expect(pubmedOnlyArticle!.mergedFrom![0]!.source).toBe('pubmed');

    const scopusOnlyArticle = reviewFile.articles.find((a) => a.scopusId === '2-s2.0-2002');
    expect(scopusOnlyArticle!.mergedFrom).toHaveLength(1);
    expect(scopusOnlyArticle!.mergedFrom![0]!.source).toBe('scopus');

    // Step 2: Simulate review decisions
    for (const article of reviewFile.articles) {
      article.reviews = [
        { reviewer: 'test', decision: 'include', timestamp: '2024-01-02T00:00:00Z' },
      ];
      article.finalDecision = 'include';
    }
    await writeFile(reviewsPath, stringifyYaml(reviewFile));

    // Step 3: Get included articles (simulating register --reviewed)
    const includedArticles = await getIncludedArticles(sessionId, sessionsDir);
    expect(includedArticles).toHaveLength(3);

    // Verify each article has the correct source from mergedFrom
    const pubmedOnlyIncluded = includedArticles.find((a) => a.pmid === '1001');
    expect(pubmedOnlyIncluded!.source).toBe('pubmed');

    const scopusOnlyIncluded = includedArticles.find((a) => a.scopusId === '2-s2.0-2002');
    expect(scopusOnlyIncluded!.source).toBe('scopus');

    // Merged article gets source from first mergedFrom entry (pubmed in this case, as it was added first)
    const mergedIncluded = includedArticles.find((a) => a.doi === '10.1234/multi');
    expect(mergedIncluded!.source).toBe('pubmed');
  });

  describe('AI Agent Workflow (extract → mark → merge)', () => {
    it('completes full title screening workflow with basis/reviewer/timestamp', async () => {
      await setupSessionWithResults();

      // Step 1: Init
      await executeReviewInit({ sessionId }, sessionsDir);

      // Step 2: Extract with basis and reviewer
      const workFilePath = join(tempDir, 'work', 'phase1.yaml');
      await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          output: workFilePath,
        },
        sessionsDir
      );

      // Verify work file format
      const workFileContent = await readFile(workFilePath, 'utf-8');
      const workFile = parseYaml(workFileContent) as WorkFile;
      expect(workFile.sessionId).toBe(sessionId);
      expect(workFile.basis).toBe('title');
      expect(workFile.reviewer).toBe('ai:claude');
      expect(workFile.articles).toHaveLength(5);
      expect(workFile.articles[0]!.decision).toBeNull();
      expect(workFile.articles[0]!.comment).toBe('');
      // Title-only basis should not include abstract
      expect(workFile.articles[0]!.abstract).toBeUndefined();

      // Step 3: Mark decisions using review mark command
      await executeReviewMark({
        file: workFilePath,
        id: workFile.articles[0]!.id,
        decision: 'include',
        comment: 'Relevant to research',
      });
      await executeReviewMark({
        file: workFilePath,
        id: workFile.articles[1]!.id,
        decision: 'exclude',
        comment: 'Off topic',
      });
      await executeReviewMark({
        file: workFilePath,
        id: workFile.articles[2]!.id,
        decision: 'uncertain',
        comment: 'Needs abstract review',
      });

      // Verify marks were saved
      const markedContent = await readFile(workFilePath, 'utf-8');
      const markedFile = parseYaml(markedContent) as WorkFile;
      expect(markedFile.articles[0]!.decision).toBe('include');
      expect(markedFile.articles[1]!.decision).toBe('exclude');
      expect(markedFile.articles[2]!.decision).toBe('uncertain');

      // Step 4: Merge work file back to master
      const mergeResult = await executeReviewMerge(
        { sessionId, file: workFilePath },
        sessionsDir
      );
      expect(mergeResult.reviewsAdded).toBe(3); // Only marked articles are merged
      expect(mergeResult.warnings).toHaveLength(0);

      // Step 5: Verify merged reviews have correct basis/reviewer/timestamp
      const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
      const reviewsContent = await readFile(reviewsPath, 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;

      // Find reviewed articles by DOI
      const article1 = reviewFile.articles.find((a) => a.doi === workFile.articles[0]!.id);
      expect(article1!.reviews).toHaveLength(1);
      expect(article1!.reviews[0]!.reviewer).toBe('ai:claude');
      expect(article1!.reviews[0]!.decision).toBe('include');
      expect(article1!.reviews[0]!.basis).toBe('title');
      expect(article1!.reviews[0]!.timestamp).toBeDefined();
      expect(article1!.reviews[0]!.comment).toBe('Relevant to research');

      const article2 = reviewFile.articles.find((a) => a.doi === workFile.articles[1]!.id);
      expect(article2!.reviews[0]!.decision).toBe('exclude');
      expect(article2!.reviews[0]!.basis).toBe('title');

      const article3 = reviewFile.articles.find((a) => a.doi === workFile.articles[2]!.id);
      expect(article3!.reviews[0]!.decision).toBe('uncertain');
    });

    it('completes two-phase screening (title then abstract)', async () => {
      await setupSessionWithResults();

      // Step 1: Init
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Title screening
      const phase1Path = join(tempDir, 'work', 'phase1.yaml');
      await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          output: phase1Path,
        },
        sessionsDir
      );

      // Mark all as uncertain (need abstract review)
      const phase1Content = await readFile(phase1Path, 'utf-8');
      const phase1File = parseYaml(phase1Content) as WorkFile;
      for (const article of phase1File.articles) {
        await executeReviewMark({
          file: phase1Path,
          id: article.id,
          decision: 'uncertain',
          comment: 'Need abstract review',
        });
      }

      // Merge phase 1
      await executeReviewMerge({ sessionId, file: phase1Path }, sessionsDir);

      // Verify status shows needs-final (reviewed but uncertain)
      const statusAfterPhase1 = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterPhase1.needsFinal).toBe(10); // All marked as uncertain

      // Phase 2: Abstract screening for uncertain articles
      const phase2Path = join(tempDir, 'work', 'phase2.yaml');
      await executeReviewExtract(
        {
          sessionId,
          filter: ['needs-final'], // Gets articles with reviews but no finalDecision
          basis: 'abstract',
          reviewer: 'ai:claude',
          output: phase2Path,
        },
        sessionsDir
      );

      // Verify abstract is included
      const phase2Content = await readFile(phase2Path, 'utf-8');
      const phase2File = parseYaml(phase2Content) as WorkFile;
      expect(phase2File.basis).toBe('abstract');
      // Articles should have abstract now
      const articlesWithAbstract = phase2File.articles.filter((a) => a.abstract);
      expect(articlesWithAbstract.length).toBeGreaterThan(0);

      // Mark some as include, some as exclude
      await executeReviewMark({
        file: phase2Path,
        id: phase2File.articles[0]!.id,
        decision: 'include',
        comment: 'Confirmed relevant from abstract',
      });
      await executeReviewMark({
        file: phase2Path,
        id: phase2File.articles[1]!.id,
        decision: 'exclude',
        comment: 'Not relevant after reading abstract',
      });

      // Merge phase 2
      await executeReviewMerge({ sessionId, file: phase2Path }, sessionsDir);

      // Verify reviews have different bases
      const finalReviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const finalReviews = parseYaml(finalReviewsContent) as ReviewFile;

      const articleWithTwoReviews = finalReviews.articles.find(
        (a) => a.doi === phase2File.articles[0]!.id
      );
      expect(articleWithTwoReviews!.reviews).toHaveLength(2);

      // First review should be from title screening
      const titleReview = articleWithTwoReviews!.reviews.find((r) => r.basis === 'title');
      expect(titleReview).toBeDefined();
      expect(titleReview!.reviewer).toBe('ai:gpt-4o');
      expect(titleReview!.decision).toBe('uncertain');

      // Second review should be from abstract screening
      const abstractReview = articleWithTwoReviews!.reviews.find((r) => r.basis === 'abstract');
      expect(abstractReview).toBeDefined();
      expect(abstractReview!.reviewer).toBe('ai:claude');
      expect(abstractReview!.decision).toBe('include');
    });

    it('handles batch marking via JSON input', async () => {
      await setupSessionWithResults();

      await executeReviewInit({ sessionId }, sessionsDir);

      const workFilePath = join(tempDir, 'work', 'batch.yaml');
      await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:test',
          limit: 5,
          output: workFilePath,
        },
        sessionsDir
      );

      const workFileContent = await readFile(workFilePath, 'utf-8');
      const workFile = parseYaml(workFileContent) as WorkFile;

      // Create JSON input for batch marking
      const decisions = [
        { id: workFile.articles[0]!.id, decision: 'include', comment: 'Yes' },
        { id: workFile.articles[1]!.id, decision: 'exclude', comment: 'No' },
        { id: workFile.articles[2]!.id, decision: 'uncertain' },
      ];
      const inputPath = join(tempDir, 'decisions.json');
      await writeFile(inputPath, JSON.stringify(decisions));

      // Batch mark
      const markResult = await executeReviewMark({
        file: workFilePath,
        input: inputPath,
      });
      expect(markResult.marked).toBe(3);

      // Verify
      const markedContent = await readFile(workFilePath, 'utf-8');
      const markedFile = parseYaml(markedContent) as WorkFile;
      expect(markedFile.articles[0]!.decision).toBe('include');
      expect(markedFile.articles[1]!.decision).toBe('exclude');
      expect(markedFile.articles[2]!.decision).toBe('uncertain');
    });
  });
});
