/**
 * E2E Integration Test for Review Workflow
 *
 * Tests the full workflow:
 * init → status → extract → (simulate edit) → merge → export
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { executeReviewInit } from './init.js';
import { executeReviewStatus } from './status.js';
import { executeReviewList } from './list.js';
import { executeReviewExtract } from './extract.js';
import { executeReviewMerge } from './merge.js';
import { executeReviewExport } from './export.js';
import { executeReviewMark } from './mark.js';
import { executeReviewFinalize } from './finalize.js';
import { getIncludedArticles } from '../register.js';
import { generateReviewNextSteps } from './next-steps.js';
import type { ReviewDecision, ReviewFile, ArticleEntry } from './types.js';

/** Get the best identifier for an extracted article (mirrors getArticleId in extract.ts) */
function getArticleId(article: ArticleEntry): string {
  if (article.doi) return article.doi;
  if (article.pmid) return article.pmid;
  if (article.scopusId) return article.scopusId;
  if (article.arxivId) return article.arxivId;
  if (article.ericId) return article.ericId;
  return article.title;
}

describe('Review Workflow E2E', () => {
  let tempDir: string;
  let sessionsDir: string;
  const sessionId = 'e2e-test-session';

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'review-e2e-test-'));
    sessionsDir = join(tempDir, 'sessions');
    await mkdir(sessionsDir, { recursive: true });
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
    expect(statusResult1.divided).toBe(0);
    expect(statusResult1.agreedInclude).toBe(0);
    expect(statusResult1.agreedExclude).toBe(0);
    expect(statusResult1.finalized).toBe(0);

    // Step 3: List - Verify pending articles
    const listResult = await executeReviewList({ sessionId, filter: 'pending' }, sessionsDir);
    expect(listResult.articles).toHaveLength(10);

    // Step 4: Extract - Create batch for review (uses --name)
    const extractResult = await executeReviewExtract(
      { sessionId, filter: ['pending'], limit: 5, name: 'batch1', reviewer: 'human:admin' },
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
      { sessionId, filter: ['pending'], limit: 3, name: 'schema-test', reviewer: 'human:admin' },
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
      { sessionId, filter: ['pending'], offset: 0, limit: 3, name: 'cycle1', reviewer: 'human:admin' },
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
      { sessionId, filter: ['pending'], offset: 0, limit: 3, name: 'cycle2', reviewer: 'human:admin' },
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
      { sessionId, filter: ['pending'], limit: 2, name: 'dryrun-test', reviewer: 'human:admin' },
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

      // Verify ReviewFile screening format
      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;
      expect(screeningFile.sessionId).toBe(sessionId);
      expect(screeningFile.basis).toBe('title');
      expect(screeningFile.reviewer).toBe('ai:claude');
      expect(screeningFile.articles).toHaveLength(5);
      expect(screeningFile.articles[0]!.reviews[0]!.decision).toBe('uncertain');
      expect(screeningFile.articles[0]!.reviews[0]!.comment).toBe('');
      // Title-only basis should not include abstract
      expect(screeningFile.articles[0]!.abstract).toBeUndefined();

      // Step 3: Mark decisions using review mark command
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[0]!),
        decision: 'include',
        comment: 'Relevant to research',
      });
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[1]!),
        decision: 'exclude',
        comment: 'Off topic',
      });
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[2]!),
        decision: 'uncertain',
        comment: 'Needs abstract review',
      });

      // Verify marks were saved
      const markedContent = await readFile(extractResult.outputPath, 'utf-8');
      const markedFile = parseYaml(markedContent) as ReviewFile;
      expect(markedFile.articles[0]!.reviews[0]!.decision).toBe('include');
      expect(markedFile.articles[1]!.reviews[0]!.decision).toBe('exclude');
      expect(markedFile.articles[2]!.reviews[0]!.decision).toBe('uncertain');

      // Step 4: Merge screening file back to master (uses --name)
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
      const article1 = reviewFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[0]!));
      expect(article1!.reviews).toHaveLength(1);
      expect(article1!.reviews[0]!.reviewer).toBe('ai:claude');
      expect(article1!.reviews[0]!.decision).toBe('include');
      expect(article1!.reviews[0]!.basis).toBe('title');
      expect(article1!.reviews[0]!.timestamp).toBeDefined();
      expect(article1!.reviews[0]!.comment).toBe('Relevant to research');

      const article2 = reviewFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[1]!));
      expect(article2!.reviews[0]!.decision).toBe('exclude');
      expect(article2!.reviews[0]!.basis).toBe('title');

      const article3 = reviewFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[2]!));
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
      const phase1File = parseYaml(phase1Content) as ReviewFile;
      for (const article of phase1File.articles) {
        await executeReviewMark({
          file: phase1Extract.outputPath,
          id: getArticleId(article),
          decision: 'uncertain',
          comment: 'Need abstract review',
        });
      }

      // Merge phase 1
      await executeReviewMerge({ sessionId, name: 'title-screening' }, sessionsDir);

      // Verify status shows uncertain (all marked as uncertain)
      const statusAfterPhase1 = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterPhase1.allUncertain).toBe(10); // All marked as uncertain

      // Phase 2: Abstract screening for uncertain articles
      const phase2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['all-uncertain'], // Gets articles with uncertain reviews
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'abstract-screening',
        },
        sessionsDir
      );

      // Verify abstract is included
      const phase2Content = await readFile(phase2Extract.outputPath, 'utf-8');
      const phase2File = parseYaml(phase2Content) as ReviewFile;
      expect(phase2File.basis).toBe('abstract');
      // Articles should have abstract now
      const articlesWithAbstract = phase2File.articles.filter((a) => a.abstract);
      expect(articlesWithAbstract.length).toBeGreaterThan(0);

      // Mark some as include, some as exclude
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: getArticleId(phase2File.articles[0]!),
        decision: 'include',
        comment: 'Confirmed relevant from abstract',
      });
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: getArticleId(phase2File.articles[1]!),
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
        (a) => a.doi === getArticleId(phase2File.articles[0]!)
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

      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;

      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[0]!),
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
      const phase1File = parseYaml(phase1Content) as ReviewFile;
      await executeReviewMark({
        file: phase1Extract.outputPath,
        id: getArticleId(phase1File.articles[0]!),
        decision: 'uncertain',
        comment: 'Needs more review',
      });
      await executeReviewMerge({ sessionId, name: 'phase1-reg' }, sessionsDir);

      // Phase 2: Abstract screening by claude
      const phase2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['all-uncertain'],
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'phase2-reg',
        },
        sessionsDir
      );
      const phase2Content = await readFile(phase2Extract.outputPath, 'utf-8');
      const phase2File = parseYaml(phase2Content) as ReviewFile;
      await executeReviewMark({
        file: phase2Extract.outputPath,
        id: getArticleId(phase2File.articles[0]!),
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
      const sf1 = parseYaml(await readFile(extract1.outputPath, 'utf-8')) as ReviewFile;
      await executeReviewMark({
        file: extract1.outputPath,
        id: getArticleId(sf1.articles[0]!),
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
      const sf2 = parseYaml(await readFile(extract2.outputPath, 'utf-8')) as ReviewFile;
      await executeReviewMark({
        file: extract2.outputPath,
        id: getArticleId(sf2.articles[0]!),
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
      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;

      // Mark all articles
      for (const article of screeningFile.articles) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(article),
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
      const phase1File = parseYaml(phase1Content) as ReviewFile;
      // Mark all articles as include
      for (const article of phase1File.articles) {
        await executeReviewMark({
          file: phase1Extract.outputPath,
          id: getArticleId(article),
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
      const phase2File = parseYaml(phase2Content) as ReviewFile;
      // Mark the 3 extracted articles as include
      for (const article of phase2File.articles) {
        await executeReviewMark({
          file: phase2Extract.outputPath,
          id: getArticleId(article),
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
      const r1File = parseYaml(r1Content) as ReviewFile;
      // Mark first 3 as include, last 2 as exclude
      for (let i = 0; i < r1File.articles.length; i++) {
        await executeReviewMark({
          file: r1Extract.outputPath,
          id: getArticleId(r1File.articles[i]!),
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
      const r2File = parseYaml(r2Content) as ReviewFile;
      expect(r2File.articles).toHaveLength(5);

      // Match reviewer 1's decisions exactly
      for (const article of r2File.articles) {
        // Find corresponding article in r1 by identifier
        const articleId = getArticleId(article);
        const r1Index = r1File.articles.findIndex((a) => getArticleId(a) === articleId);
        const decision = r1Index < 3 ? 'include' : 'exclude';
        await executeReviewMark({
          file: r2Extract.outputPath,
          id: articleId,
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
      expect(status.divided).toBe(0);
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
      expect(status.divided).toBe(1);
      expect(status.allUncertain).toBe(1);
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
        { sessionId, filter: 'divided' },
        sessionsDir
      );
      expect(conflictingList.articles).toHaveLength(1);
    });
  });

  describe('New extract format workflows (Task 73)', () => {
    it('mark-by-exception workflow: default uncertain → edit some to exclude → merge', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Extract with basis (work file mode) - all articles default to 'uncertain'
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'mark-by-exception',
        },
        sessionsDir
      );

      // Verify all articles default to 'uncertain'
      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;
      expect(screeningFile.articles).toHaveLength(10);
      for (const article of screeningFile.articles) {
        expect(article.reviews[0]!.decision).toBe('uncertain');
      }

      // Mark-by-exception: only change the ones we want to exclude, leave rest as uncertain
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[0]!),
        decision: 'exclude',
        comment: 'Off topic',
      });
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[3]!),
        decision: 'exclude',
        comment: 'Wrong population',
      });
      // Leave remaining 8 as 'uncertain' (mark-by-exception: only mark exceptions)

      // Merge
      const mergeResult = await executeReviewMerge(
        { sessionId, name: 'mark-by-exception' },
        sessionsDir
      );

      // All 10 articles should be merged (uncertain is a valid decision, not null)
      expect(mergeResult.reviewsAdded).toBe(10);

      // Verify reviews were created for all articles
      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;

      // Check that excluded articles have 'exclude' review
      const excludedArticle = reviewFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[0]!));
      expect(excludedArticle!.reviews).toHaveLength(1);
      expect(excludedArticle!.reviews[0]!.decision).toBe('exclude');
      expect(excludedArticle!.reviews[0]!.comment).toBe('Off topic');

      // Check that uncertain articles have 'uncertain' review
      const uncertainArticle = reviewFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[1]!));
      expect(uncertainArticle!.reviews).toHaveLength(1);
      expect(uncertainArticle!.reviews[0]!.decision).toBe('uncertain');

      // Status: all articles now have 'uncertain' status (uncertain reviews from single reviewer)
      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      // 8 uncertain + 2 agreed-exclude (since only 1 reviewer registered, exclude articles are agreed-exclude)
      expect(status.allUncertain).toBe(8);
      expect(status.agreedExclude).toBe(2);
      expect(status.pending).toBe(0);
    });

    it('responsible person confirmation workflow: extract → reviewHistory → finalDecision → merge', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // First, add some AI reviews via work file flow
      const aiExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'ai-screening',
        },
        sessionsDir
      );
      const aiScreening = parseYaml(await readFile(aiExtract.outputPath, 'utf-8')) as ReviewFile;
      // AI marks: 3 include, 2 exclude
      for (let i = 0; i < aiScreening.articles.length; i++) {
        await executeReviewMark({
          file: aiExtract.outputPath,
          id: getArticleId(aiScreening.articles[i]!),
          decision: i < 3 ? 'include' : 'exclude',
          comment: '',
        });
      }
      await executeReviewMerge({ sessionId, name: 'ai-screening' }, sessionsDir);

      // Now responsible person extracts for confirmation (ReviewFile mode, no --basis)
      const rpExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['agreed-include', 'agreed-exclude'],
          reviewer: 'human:responsible-person',
          name: 'rp-confirmation',
        },
        sessionsDir
      );

      // Verify ReviewFile format with reviewHistory
      const rpContent = await readFile(rpExtract.outputPath, 'utf-8');
      const rpFile = parseYaml(rpContent) as ReviewFile;
      expect(rpFile.reviewer).toBe('human:responsible-person');
      expect(rpFile.articles).toHaveLength(5);

      for (const article of rpFile.articles) {
        // reviewHistory should contain the AI reviews
        expect(article.reviewHistory).toBeDefined();
        expect(article.reviewHistory!.length).toBeGreaterThanOrEqual(1);
        expect(article.reviewHistory![0]!.reviewer).toBe('ai:claude');

        // reviews should be empty (for new reviews)
        expect(article.reviews).toHaveLength(0);

        // finalDecision should be null
        expect(article.finalDecision).toBeNull();
      }

      // Responsible person reviews and sets finalDecisions
      rpFile.articles[0]!.reviews.push({
        reviewer: 'human:responsible-person',
        decision: 'include',
        timestamp: '2024-02-01T00:00:00Z',
      });
      rpFile.articles[0]!.finalDecision = 'include';

      rpFile.articles[1]!.reviews.push({
        reviewer: 'human:responsible-person',
        decision: 'include',
        timestamp: '2024-02-01T00:00:00Z',
      });
      rpFile.articles[1]!.finalDecision = 'include';

      rpFile.articles[2]!.reviews.push({
        reviewer: 'human:responsible-person',
        decision: 'exclude',
        timestamp: '2024-02-01T00:00:00Z',
      });
      rpFile.articles[2]!.finalDecision = 'exclude';

      // Articles 3,4: no new review, no finalDecision (leave for later)

      await writeFile(rpExtract.outputPath, stringifyYaml(rpFile));

      // Merge the RP review
      const mergeResult = await executeReviewMerge(
        { sessionId, name: 'rp-confirmation' },
        sessionsDir
      );
      expect(mergeResult.reviewsAdded).toBe(3); // Only 3 articles have new reviews
      expect(mergeResult.decisionsSet).toBe(3); // 3 finalDecisions set

      // Verify final state
      const finalContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const finalFile = parseYaml(finalContent) as ReviewFile;

      // Find finalized articles
      const finalizedArticles = finalFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalizedArticles).toHaveLength(3);

      // Verify reviewHistory was NOT copied to master
      for (const article of finalFile.articles) {
        expect(article.reviewHistory).toBeUndefined();
      }

      // Status should show finalized articles
      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(status.finalized).toBe(3);
      expect(status.included).toBe(2);
      expect(status.excluded).toBe(1);
    });

    it('fulltext workflow: extract --basis fulltext includes fulltext dirName', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Add fulltext references to some articles in reviews.yaml
      const reviewsPath = join(sessionsDir, sessionId, '.internal', 'reviews.yaml');
      const reviewsContent = await readFile(reviewsPath, 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;

      // Simulate fulltext init having attached fulltext refs
      reviewFile.articles[0]!.fulltext = { dirName: '2024-smith-machine-learning', hasFiles: { pdf: true, xml: false, html: false, markdown: false } };
      reviewFile.articles[1]!.fulltext = { dirName: '2023-jones-deep-learning', hasFiles: { pdf: true, xml: false, html: false, markdown: false } };
      // Article 2 has no fulltext (not all articles have PDFs)
      await writeFile(reviewsPath, stringifyYaml(reviewFile));

      // Extract with --basis fulltext
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'fulltext',
          reviewer: 'ai:claude',
          limit: 3,
          name: 'fulltext-screening',
        },
        sessionsDir
      );

      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;
      expect(screeningFile.basis).toBe('fulltext');
      expect(screeningFile.articles).toHaveLength(3);

      // Article 0: has fulltext and abstract
      expect(screeningFile.articles[0]!.fulltext).toEqual({ dirName: '2024-smith-machine-learning', hasFiles: { pdf: true, xml: false, html: false, markdown: false } });
      expect(screeningFile.articles[0]!.abstract).toBeDefined();

      // Article 1: has fulltext and abstract
      expect(screeningFile.articles[1]!.fulltext).toEqual({ dirName: '2023-jones-deep-learning', hasFiles: { pdf: true, xml: false, html: false, markdown: false } });
      expect(screeningFile.articles[1]!.abstract).toBeDefined();

      // Article 2: no fulltext ref
      expect(screeningFile.articles[2]!.fulltext).toBeUndefined();
      expect(screeningFile.articles[2]!.abstract).toBeDefined();

      // Mark and merge to verify fulltext basis is carried through
      await executeReviewMark({
        file: extractResult.outputPath,
        id: getArticleId(screeningFile.articles[0]!),
        decision: 'include',
        comment: 'Good paper',
      });
      await executeReviewMerge({ sessionId, name: 'fulltext-screening' }, sessionsDir);

      // Verify merged review has fulltext basis
      const finalContent = await readFile(reviewsPath, 'utf-8');
      const finalFile = parseYaml(finalContent) as ReviewFile;
      const reviewedArticle = finalFile.articles.find((a) => a.doi === getArticleId(screeningFile.articles[0]!));
      expect(reviewedArticle!.reviews).toHaveLength(1);
      expect(reviewedArticle!.reviews[0]!.basis).toBe('fulltext');
      expect(reviewedArticle!.reviews[0]!.decision).toBe('include');
    });
  });

  describe('review finalize E2E', () => {
    it('full workflow: init → extract → mark → merge → finalize → verify finalDecisions', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Extract and mark articles
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'finalize-e2e',
        },
        sessionsDir
      );
      const screeningContent = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile = parseYaml(screeningContent) as ReviewFile;

      // Mark first 3 as include, next 2 as exclude, rest as uncertain
      for (let i = 0; i < screeningFile.articles.length; i++) {
        let decision: ReviewDecision;
        if (i < 3) decision = 'include';
        else if (i < 5) decision = 'exclude';
        else decision = 'uncertain';
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(screeningFile.articles[i]!),
          decision,
        });
      }

      await executeReviewMerge({ sessionId, name: 'finalize-e2e' }, sessionsDir);

      // Finalize
      const finalizeResult = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(finalizeResult.includedCount).toBe(3);
      expect(finalizeResult.excludedCount).toBe(2);
      expect(finalizeResult.skippedByStatus['all-uncertain']).toBe(5);

      // Verify finalDecisions were set in reviews.yaml
      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;

      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(5);
      const included = finalized.filter((a) => a.finalDecision === 'include');
      expect(included).toHaveLength(3);
      const excluded = finalized.filter((a) => a.finalDecision === 'exclude');
      expect(excluded).toHaveLength(2);
    });

    it('two-reviewer workflow: both agree → finalized; one uncertain → not finalized', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Reviewer 1: all include
      const r1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          limit: 5,
          name: 'r1-finalize',
        },
        sessionsDir
      );
      const r1Content = await readFile(r1Extract.outputPath, 'utf-8');
      const r1File = parseYaml(r1Content) as ReviewFile;
      for (const article of r1File.articles) {
        await executeReviewMark({
          file: r1Extract.outputPath,
          id: getArticleId(article),
          decision: 'include',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r1-finalize' }, sessionsDir);

      // Reviewer 2: first 3 include, last 2 uncertain
      const r2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['agreed-include'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'r2-finalize',
        },
        sessionsDir
      );
      const r2Content = await readFile(r2Extract.outputPath, 'utf-8');
      const r2File = parseYaml(r2Content) as ReviewFile;
      for (let i = 0; i < r2File.articles.length; i++) {
        await executeReviewMark({
          file: r2Extract.outputPath,
          id: getArticleId(r2File.articles[i]!),
          decision: i < 3 ? 'include' : 'uncertain',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r2-finalize' }, sessionsDir);

      // Finalize
      const finalizeResult = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(finalizeResult.includedCount).toBe(3); // Both agreed on include
      expect(finalizeResult.excludedCount).toBe(0);
      expect(finalizeResult.skippedByStatus.divided).toBe(2); // include + uncertain = divided
      expect(finalizeResult.skippedByStatus.pending).toBe(5); // Remaining 5
    });

    it('dry-run does not modify reviews.yaml', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Add reviews for all articles
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'dryrun-finalize',
        },
        sessionsDir
      );
      const screeningContent2 = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile2 = parseYaml(screeningContent2) as ReviewFile;
      for (const article of screeningFile2.articles) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(article),
          decision: 'include',
        });
      }
      await executeReviewMerge({ sessionId, name: 'dryrun-finalize' }, sessionsDir);

      // Dry-run finalize
      const dryResult = await executeReviewFinalize(
        { sessionId, dryRun: true },
        sessionsDir
      );
      expect(dryResult.includedCount).toBe(10);
      expect(dryResult.excludedCount).toBe(0);

      // Verify NO changes were made
      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(0);
    });

    it('min-reviewers: with 1 reviewer and --min-reviewers 2 → nothing finalized', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Only one reviewer
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'min-rev-finalize',
        },
        sessionsDir
      );
      const screeningContent3 = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile3 = parseYaml(screeningContent3) as ReviewFile;
      for (const article of screeningFile3.articles) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(article),
          decision: 'include',
        });
      }
      await executeReviewMerge({ sessionId, name: 'min-rev-finalize' }, sessionsDir);

      // Finalize with min-reviewers 2
      const result = await executeReviewFinalize(
        { sessionId, minReviewers: 2 },
        sessionsDir
      );
      expect(result.includedCount).toBe(0);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(5);
    });

    it('idempotency: running finalize twice produces same result', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Add reviews
      const extractResult = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          limit: 5,
          name: 'idem-finalize',
        },
        sessionsDir
      );
      const screeningContent4 = await readFile(extractResult.outputPath, 'utf-8');
      const screeningFile4 = parseYaml(screeningContent4) as ReviewFile;
      for (let i = 0; i < screeningFile4.articles.length; i++) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(screeningFile4.articles[i]!),
          decision: i < 3 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'idem-finalize' }, sessionsDir);

      // First finalize
      const result1 = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result1.includedCount).toBe(3);
      expect(result1.excludedCount).toBe(2);

      // Second finalize - all should be already finalized, so 0 new
      const result2 = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(result2.includedCount).toBe(0);
      expect(result2.excludedCount).toBe(0);
      expect(result2.skippedByStatus.finalized).toBe(5);
      expect(result2.skippedByStatus.pending).toBe(5);

      // Verify data is unchanged
      const reviewsContent = await readFile(
        join(sessionsDir, sessionId, '.internal', 'reviews.yaml'),
        'utf-8'
      );
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(5);
    });
  });

  describe('review finalize --decision E2E', () => {
    it('--decision exclude: only exclude consensus finalized, include consensus untouched', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Single reviewer marks: first 4 include, next 4 exclude, last 2 uncertain
      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'decision-exc' },
        sessionsDir
      );
      const content = await readFile(extractResult.outputPath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      for (let i = 0; i < file.articles.length; i++) {
        let decision: ReviewDecision;
        if (i < 4) decision = 'include';
        else if (i < 8) decision = 'exclude';
        else decision = 'uncertain';
        await executeReviewMark({ file: extractResult.outputPath, id: getArticleId(file.articles[i]!), decision });
      }
      await executeReviewMerge({ sessionId, name: 'decision-exc' }, sessionsDir);

      // Finalize with --decision exclude
      const result = await executeReviewFinalize({ sessionId, decision: 'exclude' }, sessionsDir);
      expect(result.excludedCount).toBe(4);
      expect(result.includedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(4);
      expect(result.skippedByStatus['all-uncertain']).toBe(2);

      // Verify only exclude articles have finalDecision
      const reviewsContent = await readFile(join(sessionsDir, sessionId, '.internal', 'reviews.yaml'), 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(4);
      for (const a of finalized) {
        expect(a.finalDecision).toBe('exclude');
      }
      // Include articles should NOT have finalDecision
      const includeArticles = reviewFile.articles.slice(0, 4);
      for (const a of includeArticles) {
        expect(a.finalDecision).toBeUndefined();
      }
    });

    it('--decision include: only include consensus finalized, exclude consensus untouched', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Single reviewer marks: first 3 include, next 5 exclude, last 2 uncertain
      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'decision-inc' },
        sessionsDir
      );
      const content = await readFile(extractResult.outputPath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      for (let i = 0; i < file.articles.length; i++) {
        let decision: ReviewDecision;
        if (i < 3) decision = 'include';
        else if (i < 8) decision = 'exclude';
        else decision = 'uncertain';
        await executeReviewMark({ file: extractResult.outputPath, id: getArticleId(file.articles[i]!), decision });
      }
      await executeReviewMerge({ sessionId, name: 'decision-inc' }, sessionsDir);

      // Finalize with --decision include
      const result = await executeReviewFinalize({ sessionId, decision: 'include' }, sessionsDir);
      expect(result.includedCount).toBe(3);
      expect(result.excludedCount).toBe(0);
      expect(result.skippedByStatus['agreed-exclude']).toBe(5);
      expect(result.skippedByStatus['all-uncertain']).toBe(2);

      // Verify only include articles have finalDecision
      const reviewsContent = await readFile(join(sessionsDir, sessionId, '.internal', 'reviews.yaml'), 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(3);
      for (const a of finalized) {
        expect(a.finalDecision).toBe('include');
      }
    });

    it('sequential use: --decision exclude then --decision include finalizes all consensus', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Mark: first 4 include, next 4 exclude, last 2 uncertain
      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'decision-seq' },
        sessionsDir
      );
      const content = await readFile(extractResult.outputPath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      for (let i = 0; i < file.articles.length; i++) {
        let decision: ReviewDecision;
        if (i < 4) decision = 'include';
        else if (i < 8) decision = 'exclude';
        else decision = 'uncertain';
        await executeReviewMark({ file: extractResult.outputPath, id: getArticleId(file.articles[i]!), decision });
      }
      await executeReviewMerge({ sessionId, name: 'decision-seq' }, sessionsDir);

      // Step 1: finalize exclude only
      const r1 = await executeReviewFinalize({ sessionId, decision: 'exclude' }, sessionsDir);
      expect(r1.excludedCount).toBe(4);
      expect(r1.includedCount).toBe(0);

      // Step 2: finalize include only
      const r2 = await executeReviewFinalize({ sessionId, decision: 'include' }, sessionsDir);
      expect(r2.includedCount).toBe(4);
      expect(r2.excludedCount).toBe(0);

      // Verify all 8 consensus articles are finalized
      const reviewsContent = await readFile(join(sessionsDir, sessionId, '.internal', 'reviews.yaml'), 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(8);
    });

    it('--decision combined with --dry-run: correct preview output', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'decision-dry' },
        sessionsDir
      );
      const content = await readFile(extractResult.outputPath, 'utf-8');
      const file = parseYaml(content) as ReviewFile;
      for (let i = 0; i < file.articles.length; i++) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(file.articles[i]!),
          decision: i < 5 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'decision-dry' }, sessionsDir);

      // Dry-run with --decision exclude
      const result = await executeReviewFinalize(
        { sessionId, decision: 'exclude', dryRun: true },
        sessionsDir
      );
      expect(result.excludedCount).toBe(5);
      expect(result.includedCount).toBe(0);
      expect(result.skippedByStatus['agreed-include']).toBe(5);

      // Verify NO changes were made
      const reviewsContent = await readFile(join(sessionsDir, sessionId, '.internal', 'reviews.yaml'), 'utf-8');
      const reviewFile = parseYaml(reviewsContent) as ReviewFile;
      const finalized = reviewFile.articles.filter((a) => a.finalDecision !== undefined);
      expect(finalized).toHaveLength(0);
    });

    it('--decision combined with --min-reviewers: both filters applied', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Reviewer 1 (title basis): all 10 articles, first 5 include, last 5 exclude
      const r1 = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'decision-minrev-r1' },
        sessionsDir
      );
      const r1Content = await readFile(r1.outputPath, 'utf-8');
      const r1File = parseYaml(r1Content) as ReviewFile;
      for (let i = 0; i < r1File.articles.length; i++) {
        await executeReviewMark({
          file: r1.outputPath,
          id: getArticleId(r1File.articles[i]!),
          decision: i < 5 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'decision-minrev-r1' }, sessionsDir);

      // Reviewer 2 (abstract basis): only first 3 include articles at abstract level
      // Using abstract basis means unreviewed articles at title level remain agreed (not incomplete)
      const r2 = await executeReviewExtract(
        { sessionId, filter: ['agreed-include'], basis: 'abstract', reviewer: 'ai:gpt-4o', limit: 3, name: 'decision-minrev-r2' },
        sessionsDir
      );
      const r2Content = await readFile(r2.outputPath, 'utf-8');
      const r2File = parseYaml(r2Content) as ReviewFile;
      for (const article of r2File.articles) {
        await executeReviewMark({
          file: r2.outputPath,
          id: getArticleId(article),
          decision: 'include',
        });
      }
      await executeReviewMerge({ sessionId, name: 'decision-minrev-r2' }, sessionsDir);

      // Finalize with --decision include AND --min-reviewers 2
      // Articles 0-2: agreed-include, 2 unique reviewers → passes both filters
      // Articles 3-4: agreed-include, 1 unique reviewer → passes decision, fails min-reviewers
      // Articles 5-9: agreed-exclude → skipped by decision filter
      const result = await executeReviewFinalize(
        { sessionId, decision: 'include', minReviewers: 2 },
        sessionsDir
      );
      expect(result.includedCount).toBe(3);
      expect(result.excludedCount).toBe(0);
      // 2 agreed-include skipped by min-reviewers, 5 agreed-exclude skipped by decision filter
      expect(result.skippedByStatus['agreed-include']).toBe(2);
      expect(result.skippedByStatus['agreed-exclude']).toBe(5);
    });
  });

  describe('Dynamic Next Steps progression', () => {
    it('suggests correct next steps through entire workflow', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // 1. All pending → suggests title screening extract
      const status1 = await executeReviewStatus({ sessionId }, sessionsDir);
      const steps1 = generateReviewNextSteps({ sessionId, statusResult: status1 });
      expect(steps1).not.toBeNull();
      expect(steps1!.next[0]!.command).toContain('review extract');
      expect(steps1!.next[0]!.command).toContain('--basis title');
      expect(steps1!.next[0]!.command).toContain('--filter pending');
      expect(steps1!.next[0]!.command).toContain('--reviewer "<name>"');

      // 2. After title screening → agreed articles → suggests finalize
      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'ns-title' },
        sessionsDir
      );
      const nsContent = await readFile(extractResult.outputPath, 'utf-8');
      const nsFile = parseYaml(nsContent) as ReviewFile;
      for (let i = 0; i < nsFile.articles.length; i++) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(nsFile.articles[i]!),
          decision: i < 5 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'ns-title' }, sessionsDir);

      const status2 = await executeReviewStatus({ sessionId }, sessionsDir);
      const steps2 = generateReviewNextSteps({ sessionId, statusResult: status2 });
      expect(steps2).not.toBeNull();
      expect(steps2!.next[0]!.command).toContain('review finalize');

      // 3. After finalize → all finalized → suggests register
      await executeReviewFinalize({ sessionId }, sessionsDir);

      const status3 = await executeReviewStatus({ sessionId }, sessionsDir);
      const steps3 = generateReviewNextSteps({ sessionId, statusResult: status3 });
      expect(steps3).not.toBeNull();
      expect(steps3!.next[0]!.command).toContain('register');
      expect(steps3!.next[0]!.command).toContain('--reviewed');
    });

    it('suggests abstract screening after title screening with uncertain results', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Title screening: mark all as uncertain
      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', name: 'ns-title-unc' },
        sessionsDir
      );
      const nsUncContent = await readFile(extractResult.outputPath, 'utf-8');
      const nsUncFile = parseYaml(nsUncContent) as ReviewFile;
      for (const article of nsUncFile.articles) {
        await executeReviewMark({
          file: extractResult.outputPath,
          id: getArticleId(article),
          decision: 'uncertain',
        });
      }
      await executeReviewMerge({ sessionId, name: 'ns-title-unc' }, sessionsDir);

      // All uncertain, reviewer registry has title → should suggest abstract screening
      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      const steps = generateReviewNextSteps({ sessionId, statusResult: status });
      expect(steps).not.toBeNull();
      expect(steps!.next[0]!.command).toContain('review extract');
      expect(steps!.next[0]!.command).toContain('--basis abstract');
      expect(steps!.next[0]!.command).toContain('--reviewer "<name>"');
      expect(steps!.next[0]!.command).toContain('--name abstract-screening');
    });

    it('batch continuation: suggests next batch with correct offset', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      const extractResult = await executeReviewExtract(
        { sessionId, filter: ['pending'], basis: 'title', reviewer: 'ai:claude', limit: 3, offset: 0, name: 'batch-1' },
        sessionsDir
      );

      const status = await executeReviewStatus({ sessionId }, sessionsDir);
      const steps = generateReviewNextSteps({
        sessionId,
        statusResult: status,
        extractName: 'batch-1',
        extractedCount: extractResult.extractedCount,
        totalMatching: extractResult.totalMatching,
        limit: 3,
        offset: 0,
      });
      expect(steps).not.toBeNull();
      // Should have batch continuation in seeAlso
      const batchSuggestion = steps!.seeAlso.find(s => s.command.includes('--offset'));
      expect(batchSuggestion).toBeDefined();
      expect(batchSuggestion!.command).toContain('--offset 3');
      expect(batchSuggestion!.command).toContain('--limit 3');
      expect(batchSuggestion!.description).toContain('7'); // 10 - 3 = 7 remaining
    });
  });

  describe('Multi-stage screening with basis priority (Task 88)', () => {
    it('full multi-stage workflow: title uncertain → abstract include/exclude → finalize', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Title screening - mark some exclude, rest uncertain
      const titleExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'multi-stage-title',
        },
        sessionsDir
      );
      const titleContent = await readFile(titleExtract.outputPath, 'utf-8');
      const titleFile = parseYaml(titleContent) as ReviewFile;

      // Mark first 3 as exclude (clearly irrelevant), rest as uncertain
      for (let i = 0; i < titleFile.articles.length; i++) {
        await executeReviewMark({
          file: titleExtract.outputPath,
          id: getArticleId(titleFile.articles[i]!),
          decision: i < 3 ? 'exclude' : 'uncertain',
        });
      }
      await executeReviewMerge({ sessionId, name: 'multi-stage-title' }, sessionsDir);

      // After title screening: 3 agreed-exclude, 7 uncertain
      const statusAfterTitle = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterTitle.agreedExclude).toBe(3);
      expect(statusAfterTitle.allUncertain).toBe(7);

      // Phase 2: Abstract screening for uncertain articles
      const abstractExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['all-uncertain'],
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'multi-stage-abstract',
        },
        sessionsDir
      );
      const abstractContent = await readFile(abstractExtract.outputPath, 'utf-8');
      const abstractFile = parseYaml(abstractContent) as ReviewFile;
      expect(abstractFile.articles).toHaveLength(7);

      // Mark 4 as include, 3 as exclude based on abstract
      for (let i = 0; i < abstractFile.articles.length; i++) {
        await executeReviewMark({
          file: abstractExtract.outputPath,
          id: getArticleId(abstractFile.articles[i]!),
          decision: i < 4 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'multi-stage-abstract' }, sessionsDir);

      // After abstract screening with basis priority:
      // The 7 articles that were title-uncertain now have abstract decisions
      // Basis priority: abstract include/exclude overrides title uncertain
      // So: 4 agreed-include, 3+3=6 agreed-exclude, 0 uncertain
      const statusAfterAbstract = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterAbstract.agreedInclude).toBe(4);
      expect(statusAfterAbstract.agreedExclude).toBe(6); // 3 from title + 3 from abstract
      expect(statusAfterAbstract.allUncertain).toBe(0); // No uncertain left

      // Phase 3: Finalize - all articles should now be finalizable
      const finalizeResult = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(finalizeResult.includedCount).toBe(4);
      expect(finalizeResult.excludedCount).toBe(6);
      expect(finalizeResult.skippedByStatus['all-uncertain']).toBe(0);

      // Verify all articles are finalized
      const finalStatus = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(finalStatus.finalized).toBe(10);
      expect(finalStatus.included).toBe(4);
      expect(finalStatus.excluded).toBe(6);
    });

    it('two-reviewer multi-stage: reviewer A title screening → reviewer B abstract screening → finalize', async () => {
      await setupSessionWithResults();
      await executeReviewInit({ sessionId }, sessionsDir);

      // Phase 1: Reviewer A does title screening
      const r1Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:gpt-4o',
          name: 'r1-title',
        },
        sessionsDir
      );
      const r1Content = await readFile(r1Extract.outputPath, 'utf-8');
      const r1File = parseYaml(r1Content) as ReviewFile;

      // Reviewer A: exclude 2, uncertain for rest
      for (let i = 0; i < r1File.articles.length; i++) {
        await executeReviewMark({
          file: r1Extract.outputPath,
          id: getArticleId(r1File.articles[i]!),
          decision: i < 2 ? 'exclude' : 'uncertain',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r1-title' }, sessionsDir);

      // Phase 2: Reviewer B does abstract screening for uncertain articles
      const r2Extract = await executeReviewExtract(
        {
          sessionId,
          filter: ['all-uncertain'],
          basis: 'abstract',
          reviewer: 'ai:claude',
          name: 'r2-abstract',
        },
        sessionsDir
      );
      const r2Content = await readFile(r2Extract.outputPath, 'utf-8');
      const r2File = parseYaml(r2Content) as ReviewFile;
      expect(r2File.articles).toHaveLength(8);

      // Reviewer B: include 5, exclude 3
      for (let i = 0; i < r2File.articles.length; i++) {
        await executeReviewMark({
          file: r2Extract.outputPath,
          id: getArticleId(r2File.articles[i]!),
          decision: i < 5 ? 'include' : 'exclude',
        });
      }
      await executeReviewMerge({ sessionId, name: 'r2-abstract' }, sessionsDir);

      // Basis priority resolves: title uncertain from R1 is overridden by abstract decisions from R2
      // The 2 articles excluded by R1 at title are NOT incomplete — R2 is registered at abstract
      // basis, but these articles only have title-level reviews, so R2 is not applicable yet
      const statusAfter = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfter.agreedInclude).toBe(5);
      expect(statusAfter.agreedExclude).toBe(5); // 2 from R1 title + 3 from R2 abstract
      expect(statusAfter.incomplete).toBe(0); // Basis-aware: abstract reviewer doesn't apply to title-only articles
      expect(statusAfter.allUncertain).toBe(0);

      // Finalize: all agreed articles get finalized
      const finalizeResult = await executeReviewFinalize({ sessionId }, sessionsDir);
      expect(finalizeResult.includedCount).toBe(5);
      expect(finalizeResult.excludedCount).toBe(5);

      // Verify
      const finalStatus = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(finalStatus.finalized).toBe(10);
      expect(finalStatus.incomplete).toBe(0);
    });

    it('3-stage workflow without finalization: title exclude stays after abstract reviewer registered (Task 92)', async () => {
      // Uses the standard 10-article setup
      await setupSessionWithResults();

      // Init
      const initResult = await executeReviewInit({ sessionId }, sessionsDir);
      expect(initResult.articleCount).toBe(10);

      // === Stage 1: Title screening ===
      // Reviewer ai:claude screens all 10 at title basis
      const titleExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['pending'],
          basis: 'title',
          reviewer: 'ai:claude',
          name: 'task92-title',
        },
        sessionsDir
      );
      const titleContent = await readFile(titleExtract.outputPath, 'utf-8');
      const titleFile = parseYaml(titleContent) as ReviewFile;
      expect(titleFile.articles).toHaveLength(10);

      // Mark first 2 as exclude, remaining 8 as uncertain
      for (let i = 0; i < titleFile.articles.length; i++) {
        await executeReviewMark({
          file: titleExtract.outputPath,
          id: getArticleId(titleFile.articles[i]!),
          decision: i < 2 ? 'exclude' : 'uncertain',
        });
      }
      await executeReviewMerge({ sessionId, name: 'task92-title' }, sessionsDir);

      // Verify after title screening: 2 agreed-exclude, 8 uncertain
      const statusAfterTitle = await executeReviewStatus({ sessionId }, sessionsDir);
      expect(statusAfterTitle.agreedExclude).toBe(2);
      expect(statusAfterTitle.allUncertain).toBe(8);

      // === Stage 2: Abstract screening (NO finalization between stages) ===
      // Reviewer ai:gpt-4o screens the 8 uncertain at abstract basis
      const abstractExtract = await executeReviewExtract(
        {
          sessionId,
          filter: ['all-uncertain'],
          basis: 'abstract',
          reviewer: 'ai:gpt-4o',
          name: 'task92-abstract',
        },
        sessionsDir
      );
      const abstractContent = await readFile(abstractExtract.outputPath, 'utf-8');
      const abstractFile = parseYaml(abstractContent) as ReviewFile;
      expect(abstractFile.articles).toHaveLength(8);

      // Mark all 8 as include based on abstract
      for (const article of abstractFile.articles) {
        await executeReviewMark({
          file: abstractExtract.outputPath,
          id: getArticleId(article),
          decision: 'include',
          comment: 'Relevant after reading abstract',
        });
      }
      await executeReviewMerge({ sessionId, name: 'task92-abstract' }, sessionsDir);

      // === Key assertions (Task 92 fixes) ===
      const statusAfterAbstract = await executeReviewStatus({ sessionId }, sessionsDir);

      // Fix 1: Title-excluded articles stay agreed-exclude (not incomplete)
      // because abstract reviewer is registered at abstract basis,
      // but these articles only have title-level reviews
      expect(statusAfterAbstract.agreedExclude).toBe(2);
      expect(statusAfterAbstract.incomplete).toBe(0);

      // Fix 2: Abstract-include overrides title-uncertain → agreed-include
      // (higher basis definitive wins over lower basis decisions)
      expect(statusAfterAbstract.agreedInclude).toBe(8);
      expect(statusAfterAbstract.allUncertain).toBe(0);
      expect(statusAfterAbstract.divided).toBe(0);

      // All 10 articles have a definitive status, ready for finalization
      expect(statusAfterAbstract.pending).toBe(0);
    });
  });
});
