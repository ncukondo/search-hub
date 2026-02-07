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
import type { ReviewDecision, ReviewFile, WorkFile } from './types.js';

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
    expect(statusResult1.agreedInclude).toBe(0);
    expect(statusResult1.agreedExclude).toBe(0);
    expect(statusResult1.finalized).toBe(0);

    // Step 3: List - Verify pending articles
    const listResult = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);
    expect(listResult.articles).toHaveLength(10);

    // Step 4: Extract - Create batch for review (uses --name)
    const extractResult = await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 5, name: 'batch1' },
      sessionsDir
    );
    expect(extractResult.extractedCount).toBe(5);

    // Verify output is in for-review/ directory
    const expectedPath = join(sessionsDir, sessionId, 'for-review', 'batch1', 'review.yaml');
    expect(extractResult.outputPath).toBe(expectedPath);

    // Verify extracted file has schema reference
    const extractedContent = await readFile(extractResult.outputPath, 'utf-8');
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
    // Leave as agreed-include (review but no finalDecision)

    // Write edited file back to for-review/ path
    const editedContent = stringifyYaml(extractedFile);
    await writeFile(extractResult.outputPath, editedContent);

    // Step 6: Merge - Combine reviewed articles back (uses --name)
    const mergeResult = await executeReviewMerge(
      { sessionId, name: 'batch1' },
      sessionsDir
    );
    expect(mergeResult.reviewsAdded).toBe(5); // 1+1+2+1+0
    expect(mergeResult.decisionsSet).toBe(2); // Two finalDecisions set

    // Step 7: Status - Verify updated counts
    // With reviewer registration from merge, reviewed articles missing a registered reviewer are "incomplete"
    const statusResult2 = await executeReviewStatus({ sessionId }, sessionsDir);
    expect(statusResult2.total).toBe(10);
    expect(statusResult2.pending).toBe(6); // Articles with no reviews at all
    expect(statusResult2.incomplete).toBe(2); // Articles 2,3: have some reviews but missing a registered reviewer
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

    // Extract with schema (uses --name)
    const extractResult = await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 3, name: 'schema-test' },
      sessionsDir
    );

    // Verify schema reference is present and points to adjacent file
    const content = await readFile(extractResult.outputPath, 'utf-8');
    expect(content).toMatch(/^# yaml-language-server: \$schema=\.\/review\.schema\.json/);

    // Verify schema file was copied alongside
    const schemaPath = join(sessionsDir, sessionId, 'for-review', 'schema-test', 'review.schema.json');
    await access(schemaPath);
    const schemaContent = await readFile(schemaPath, 'utf-8');
    expect(schemaContent).toContain('json-schema.org');
  });

  it('preserves data integrity through multiple extract-merge cycles', async () => {
    await setupSessionWithResults();

    // Init
    await executeReviewInit({ sessionId }, sessionsDir);

    // First cycle: Extract → Edit → Merge
    const extract1 = await executeReviewExtract(
      { sessionId, filter: ['pending'], offset: 0, limit: 3, name: 'cycle1' },
      sessionsDir
    );

    const batch1Content = await readFile(extract1.outputPath, 'utf-8');
    const batch1 = parseYaml(batch1Content) as ReviewFile;
    batch1.articles[0]!.reviews = batch1.articles[0]!.reviews ?? [];
    batch1.articles[0]!.reviews.push({
      reviewer: 'reviewer1',
      decision: 'include',
      timestamp: '2024-01-01T00:00:00Z',
    });
    batch1.articles[0]!.finalDecision = 'include';
    await writeFile(extract1.outputPath, stringifyYaml(batch1));
    await executeReviewMerge({ sessionId, name: 'cycle1' }, sessionsDir);

    // Second cycle: Another reviewer
    const extract2 = await executeReviewExtract(
      { sessionId, filter: ['pending'], offset: 0, limit: 3, name: 'cycle2' },
      sessionsDir
    );

    const batch2Content = await readFile(extract2.outputPath, 'utf-8');
    const batch2 = parseYaml(batch2Content) as ReviewFile;
    batch2.articles[0]!.reviews = batch2.articles[0]!.reviews ?? [];
    batch2.articles[0]!.reviews.push({
      reviewer: 'reviewer2',
      decision: 'include',
      timestamp: '2024-01-02T00:00:00Z',
    });
    batch2.articles[0]!.finalDecision = 'include';
    await writeFile(extract2.outputPath, stringifyYaml(batch2));
    await executeReviewMerge({ sessionId, name: 'cycle2' }, sessionsDir);

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

    const extractResult = await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 2, name: 'dryrun-test' },
      sessionsDir
    );

    // Edit batch
    const batchContent = await readFile(extractResult.outputPath, 'utf-8');
    const batch = parseYaml(batchContent) as ReviewFile;
    batch.articles[0]!.reviews = batch.articles[0]!.reviews ?? [];
    batch.articles[0]!.reviews.push({
      reviewer: 'test',
      decision: 'include',
      timestamp: '2024-01-01T00:00:00Z',
    });
    batch.articles[0]!.finalDecision = 'include';
    await writeFile(extractResult.outputPath, stringifyYaml(batch));

    // Dry-run merge
    const dryRunResult = await executeReviewMerge(
      { sessionId, name: 'dryrun-test', dryRun: true },
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

  describe('AI Agent Workflow (extract → mark → merge) with --name', () => {
    it('completes full title screening workflow within for-review/', async () => {
      await setupSessionWithResults();

      // Step 1: Init
      await executeReviewInit({ sessionId }, sessionsDir);

      // Step 2: Extract with basis and reviewer (uses --name)
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'title-screening',
        },
        sessionsDir
      );

      // Verify output is in for-review/title-screening/
      const expectedPath = join(sessionsDir, sessionId, 'for-review', 'title-screening', 'review.yaml');
      expect(extractResult.outputPath).toBe(expectedPath);

      // Verify work file format
      const workFileContent = await readFile(extractResult.outputPath, 'utf-8');
      const workFile = parseYaml(workFileContent) as WorkFile;
      expect(workFile.sessionId).toBe(sessionId);
      expect(workFile.basis).toBe('title');
      expect(workFile.reviewer).toBe('ai:claude');
      expect(workFile.articles).toHaveLength(5);
      expect(workFile.articles[0]!.decision).toBe('uncertain');
      expect(workFile.articles[0]!.comment).toBe('');
      // Title-only basis should not include abstract
      expect(workFile.articles[0]!.abstract).toBeUndefined();

      // Step 3: Mark decisions using review mark command
      await executeReviewMark({
        file: extractResult.outputPath,
        id: workFile.articles[0]!.id,
        decision: 'include',
        comment: 'Relevant to research',
      });
      await executeReviewMark({
        file: extractResult.outputPath,
        id: workFile.articles[1]!.id,
        decision: 'exclude',
        comment: 'Off topic',
      });
      await executeReviewMark({
        file: extractResult.outputPath,
        id: workFile.articles[2]!.id,
        decision: 'uncertain',
        comment: 'Needs abstract review',
      });

      // Verify marks were saved
      const markedContent = await readFile(extractResult.outputPath, 'utf-8');
      const markedFile = parseYaml(markedContent) as WorkFile;
      expect(markedFile.articles[0]!.decision).toBe('include');
      expect(markedFile.articles[1]!.decision).toBe('exclude');
      expect(markedFile.articles[2]!.decision).toBe('uncertain');

      // Step 4: Merge work file back to master (uses --name)
      const mergeResult = await executeReviewMerge(
        { sessionId, name: 'title-screening' },
        sessionsDir
      );
      expect(mergeResult.reviewsAdded).toBe(5); // All articles merged (default is uncertain, not null)
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

    it('completes two-phase screening (title then abstract) within for-review/', async () => {
      await setupSessionWithResults();

      // Step 1: Init
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Title screening
      const phase1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          name: 'title-screening',
        },
        sessionsDir
      );

      // Mark all as uncertain (need abstract review)
      const phase1Content = await readFile(phase1Extract.outputPath, 'utf-8');
      const phase1File = parseYaml(phase1Content) as WorkFile;
      for (const article of phase1File.articles) {
        await executeReviewMark({
          file: phase1Extract.outputPath,
          id: article.id,
          decision: 'uncertain',
          comment: 'Need abstract review',
        });
      }

      // Merge phase 1
      await executeReviewMerge({ sessionId, name: 'title-screening' }, sessionsDir);

      // Verify status shows uncertain (all marked as uncertain)
      const statusAfterPhase1 = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterPhase1.uncertain).toBe(10); // All marked as uncertain

      // Phase 2: Abstract screening for uncertain articles
      const phase2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['uncertain'], // Gets articles with uncertain reviews
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'abstract-screening',
        },
        sessionsDir
      );

      // Verify abstract is included
      const phase2Content = await readFile(phase2Extract.outputPath, 'utf-8');
      const phase2File = parseYaml(phase2Content) as WorkFile;
      expect(phase2File.basis).toBe('abstract');
      // Articles should have abstract now
      const articlesWithAbstract = phase2File.articles.filter((a) => a.abstract);
      expect(articlesWithAbstract.length).toBeGreaterThan(0);

      // Mark some as include, some as exclude
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: phase2File.articles[0]!.id,
        decision: 'include',
        comment: 'Confirmed relevant from abstract',
      });
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: phase2File.articles[1]!.id,
        decision: 'exclude',
        comment: 'Not relevant after reading abstract',
      });

      // Merge phase 2
      await executeReviewMerge({ sessionId, name: 'abstract-screening' }, sessionsDir);

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

    it('registers reviewer in reviewers array after work file merge', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 3,
          name: 'reviewer-reg-test',
        },
        sessionsDir
      );

      const workFileContent = await readFile(extractResult.outputPath, 'utf-8');
      const workFile = parseYaml(workFileContent) as WorkFile;

      await executeReviewMark({
        file: extractResult.outputPath,
        id: workFile.articles[0]!.id,
        decision: 'include',
        comment: 'Yes',
      });

      await executeReviewMerge({ sessionId, name: 'reviewer-reg-test' }, sessionsDir);

      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      expect(reviewFile.reviewers).toEqual([{ name: 'ai:claude', basis: 'title' }]);
    });

    it('registers multiple reviewers from different merges', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Title screening by gpt-4o
      const phase1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          limit: 5,
          name: 'phase1-reg',
        },
        sessionsDir
      );
      const phase1Content = await readFile(phase1Extract.outputPath, 'utf-8');
      const phase1File = parseYaml(phase1Content) as WorkFile;
      await executeReviewMark({
        file: phase1Extract.outputPath,
        id: phase1File.articles[0]!.id,
        decision: 'uncertain',
        comment: 'Needs more review',
      });
      await executeReviewMerge({ sessionId, name: 'phase1-reg' }, sessionsDir);

      // Phase 2: Abstract screening by claude
      const phase2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['uncertain'],
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'phase2-reg',
        },
        sessionsDir
      );
      const phase2Content = await readFile(phase2Extract.outputPath, 'utf-8');
      const phase2File = parseYaml(phase2Content) as WorkFile;
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: phase2File.articles[0]!.id,
        decision: 'include',
        comment: 'Confirmed',
      });
      await executeReviewMerge({ sessionId, name: 'phase2-reg' }, sessionsDir);

      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      expect(reviewFile.reviewers).toHaveLength(2);
      expect(reviewFile.reviewers).toEqual([
        { name: 'ai:gpt-4o', basis: 'title' },
        { name: 'ai:claude', basis: 'abstract' },
      ]);
    });

    it('does not duplicate reviewer registration on same name+basis', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // First merge with ai:claude at title basis
      const extract1 = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 3,
          name: 'no-dup-1',
        },
        sessionsDir
      );
      const wf1 = parseYaml(await readFile(extract1.outputPath, 'utf-8')) as WorkFile;
      await executeReviewMark({
        file: extract1.outputPath,
        id: wf1.articles[0]!.id,
        decision: 'include',
        comment: '',
      });
      await executeReviewMerge({ sessionId, name: 'no-dup-1' }, sessionsDir);

      // Second merge with same reviewer+basis
      const extract2 = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 3,
          name: 'no-dup-2',
        },
        sessionsDir
      );
      const wf2 = parseYaml(await readFile(extract2.outputPath, 'utf-8')) as WorkFile;
      await executeReviewMark({
        file: extract2.outputPath,
        id: wf2.articles[0]!.id,
        decision: 'exclude',
        comment: '',
      });
      await executeReviewMerge({ sessionId, name: 'no-dup-2' }, sessionsDir);

      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      // Same reviewer+basis should appear only once
      expect(reviewFile.reviewers).toHaveLength(1);
      expect(reviewFile.reviewers).toEqual([{ name: 'ai:claude', basis: 'title' }]);
    });

    it('extract → mark → merge flow completes entirely within for-review/', async () => {
      await setupSessionWithResults();

      await executeReviewInit({ sessionId }, sessionsDir);

      // Extract
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 3,
          name: 'internal-flow',
        },
        sessionsDir
      );

      // Verify the file is inside the session directory
      expect(extractResult.outputPath).toContain(join(sessionsDir, sessionId, 'for-review'));

      // Read, mark, and verify flow uses internal paths
      const workFileContent = await readFile(extractResult.outputPath, 'utf-8');
      const workFile = parseYaml(workFileContent) as WorkFile;

      // Mark all articles
      for (const article of workFile.articles) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: article.id,
          decision: 'include',
          comment: 'Relevant',
        });
      }

      // Merge using name (not file path)
      const mergeResult = await executeReviewMerge(
        { sessionId, name: 'internal-flow' },
        sessionsDir
      );

      expect(mergeResult.reviewsAdded).toBe(3);
      expect(mergeResult.warnings).toHaveLength(0);

      // Verify reviews were merged to master
      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const reviewedArticles = reviewFile.articles.filter((a) => (a.reviews ?? []).length > 0);
      expect(reviewedArticles).toHaveLength(3);
    });
  });

  describe('7-state status model E2E', () => {
    it('shows incomplete status when one registered reviewer has not reviewed', async () => {
      await setupSessionWithResults();

      // Init review
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Reviewer 1 (ai:gpt-4o) reviews all articles at title basis
      const phase1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          name: 'reviewer1-title',
        },
        sessionsDir
      );
      const phase1Content = await readFile(phase1Extract.outputPath, 'utf-8');
      const phase1File = parseYaml(phase1Content) as WorkFile;
      // Mark all articles as include
      for (const article of phase1File.articles) {
        await executeReviewMark({
          file: phase1Extract.outputPath,
          id: article.id,
          decision: 'include',
          comment: '',
        });
      }
      await executeReviewMerge({ sessionId, name: 'reviewer1-title' }, sessionsDir);

      // Phase 2: Reviewer 2 (ai:claude) reviews only SOME articles at title basis
      const phase2Extract = await executeReviewExtract(
        {
          sessionId,
          // All are agreed-include now (only one reviewer, all said include)
          // But after registering reviewer 2, they become incomplete
          filter: ['agreed-include'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 3, // Only review 3 of 10
          name: 'reviewer2-partial',
        },
        sessionsDir
      );
      const phase2Content = await readFile(phase2Extract.outputPath, 'utf-8');
      const phase2File = parseYaml(phase2Content) as WorkFile;
      // Mark the 3 extracted articles as include
      for (const article of phase2File.articles) {
        await executeReviewMark({
          file: phase2Extract.outputPath,
          id: article.id,
          decision: 'include',
          comment: '',
        });
      }
      await executeReviewMerge({ sessionId, name: 'reviewer2-partial' }, sessionsDir);

      // Now we have 2 registered reviewers at title basis:
      // - ai:gpt-4o reviewed all 10
      // - ai:claude reviewed only 3
      // So 3 articles have both reviews → agreed-include
      // And 7 articles are missing ai:claude → incomplete

      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(status.reviewers).toHaveLength(2);
      expect(status.incomplete).toBe(7);
      expect(status.agreedInclude).toBe(3);
      expect(status.pending).toBe(0);
    });

    it('detects agreed-include and agreed-exclude consensus from multiple reviewers', async () => {
      await setupSessionWithResults();

      await executeReviewInit({ sessionId }, sessionsDir);

      // Reviewer 1: reviews first 5 articles
      const r1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          limit: 5,
          name: 'r1-screen',
        },
        sessionsDir
      );
      const r1Content = await readFile(r1Extract.outputPath, 'utf-8');
      const r1File = parseYaml(r1Content) as WorkFile;
      // Mark first 3 as include, last 2 as exclude
      for (let i = 0; i < r1File.articles.length; i++) {
        await executeReviewMark({
          file: r1Extract.outputPath,
          id: r1File.articles[i]!.id,
          decision: i < 3 ? 'include' : 'exclude',
          comment: '',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r1-screen' }, sessionsDir);

      // After r1 merge: 1 registered reviewer (ai:gpt-4o)
      // 3 articles = agreed-include, 2 = agreed-exclude, 5 = pending
      const statusAfterR1 = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterR1.agreedInclude).toBe(3);
      expect(statusAfterR1.agreedExclude).toBe(2);
      expect(statusAfterR1.pending).toBe(5);

      // Reviewer 2: reviews same 5 articles (use agreed-include + agreed-exclude filter)
      // After r1 merge, articles are agreed-include/agreed-exclude (only 1 reviewer registered)
      const r2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['agreed-include', 'agreed-exclude'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'r2-screen',
        },
        sessionsDir
      );
      const r2Content = await readFile(r2Extract.outputPath, 'utf-8');
      const r2File = parseYaml(r2Content) as WorkFile;
      expect(r2File.articles).toHaveLength(5);

      // Match reviewer 1's decisions exactly
      for (const article of r2File.articles) {
        // Find corresponding article in r1 by ID
        const r1Index = r1File.articles.findIndex((a) => a.id === article.id);
        const decision = r1Index < 3 ? 'include' : 'exclude';
        await executeReviewMark({
          file: r2Extract.outputPath,
          id: article.id,
          decision: decision as ReviewDecision,
          comment: '',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r2-screen' }, sessionsDir);

      // Now 2 registered reviewers. Both agreed on include/exclude.
      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(status.agreedInclude).toBe(3); // Both reviewers said include
      expect(status.agreedExclude).toBe(2); // Both reviewers said exclude
      expect(status.pending).toBe(5); // Remaining 5 have no reviews → still pending
      expect(status.incomplete).toBe(0);
      expect(status.conflicting).toBe(0);
    });

    it('classifies correctly when reviewer registry is empty (backward compatibility)', async () => {
      await setupSessionWithResults();

      await executeReviewInit({ sessionId }, sessionsDir);

      // Manually add reviews without using extract/merge workflow
      // This simulates backward-compatible scenario with no reviewer registry
      const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
      const reviewsContent = await readFile(reviewsPath, 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;

      // Ensure no reviewer registry
      reviewFile.reviewers = [];

      // Add reviews directly (simulating manual edits or old workflow)
      // Article 0: one include → agreed-include (no incomplete check since registry empty)
      reviewFile.articles[0]!.reviews = [
        { reviewer: 'manual-reviewer', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
      ];

      // Article 1: one exclude → agreed-exclude
      reviewFile.articles[1]!.reviews = [
        { reviewer: 'manual-reviewer', decision: 'exclude', timestamp: '2024-01-01T00:00:00Z' },
      ];

      // Article 2: conflicting decisions
      reviewFile.articles[2]!.reviews = [
        { reviewer: 'reviewer-a', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
        { reviewer: 'reviewer-b', decision: 'exclude', timestamp: '2024-01-01T01:00:00Z' },
      ];

      // Article 3: uncertain
      reviewFile.articles[3]!.reviews = [
        { reviewer: 'reviewer-a', decision: 'uncertain', timestamp: '2024-01-01T00:00:00Z' },
      ];

      // Article 4: finalized
      reviewFile.articles[4]!.reviews = [
        { reviewer: 'reviewer-a', decision: 'include', timestamp: '2024-01-01T00:00:00Z' },
      ];
      reviewFile.articles[4]!.finalDecision = 'include';

      await writeFile(reviewsPath, stringifyYaml(reviewFile));

      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(status.agreedInclude).toBe(1);
      expect(status.agreedExclude).toBe(1);
      expect(status.conflicting).toBe(1);
      expect(status.uncertain).toBe(1);
      expect(status.finalized).toBe(1);
      expect(status.included).toBe(1);
      expect(status.pending).toBe(5); // Articles 5-9 still pending
      expect(status.incomplete).toBe(0); // No incomplete since registry is empty

      // Also verify list filtering works
      const agreedIncludeList = await executeReviewList(
        { sessionId, filter: 'agreed-include' },
        sessionsDir
      );
      expect(agreedIncludeList.articles).toHaveLength(1);
      expect(agreedIncludeList.articles[0]!.status).toBe('agreed-include');

      const conflictingList = await executeReviewList(
        { sessionId, filter: 'conflicting' },
        sessionsDir
      );
      expect(conflictingList.articles).toHaveLength(1);
    });
  });
});
