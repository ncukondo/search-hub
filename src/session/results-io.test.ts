/**
 * Tests for results I/O utilities.
 *
 * Tests the JSONL → YAML conversion and unified results reader.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { Article } from '../providers/base/types.js';
import { convertResultsToYaml, loadResults, type ConversionMetadata } from './results-io.js';

describe('results-io', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `results-io-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  const sampleArticles: Article[] = [
    {
      title: 'Article One with Special Characters: "Quotes" & <Tags>',
      authors: [
        { family: 'Smith', given: 'John' },
        { family: 'Doe', given: 'Jane', orcid: '0000-0001-2345-6789' },
      ],
      publicationDate: '2025-03-15',
      journal: 'Test Journal',
      doi: '10.1234/test.001',
      pmid: '12345678',
      abstract: `OBJECTIVE: This is a multi-line abstract.
It contains multiple paragraphs for testing purposes.

METHODS: The study used various methods.`,
      source: 'pubmed',
      retrievedAt: '2026-02-03T10:30:00Z',
      rawResponse: { raw: 'data', complex: { nested: true } },
    },
    {
      title: 'Article Two Without Abstract',
      authors: [{ family: 'Johnson', given: 'Bob' }],
      publicationDate: '2024-06-20',
      journal: 'Another Journal',
      doi: '10.1234/test.002',
      volume: '5',
      issue: '2',
      pages: '100-110',
      source: 'pubmed',
      retrievedAt: '2026-02-03T10:31:00Z',
    },
  ];

  // Article with null/undefined fields for testing (JSON serialization converts undefined to absent)
  const articleWithNullFields = {
    title: 'Article Three With Null Fields',
    authors: [],
    publicationDate: null,
    journal: null,
    pmid: '87654321',
    source: 'pubmed',
    retrievedAt: '2026-02-03T10:32:00Z',
    volume: null,
    rawResponse: null,
  };

  describe('convertResultsToYaml', () => {
    it('converts JSONL to valid YAML', async () => {
      const jsonlPath = join(testDir, 'results.jsonl');
      const yamlPath = join(testDir, 'results.yaml');

      // Write JSONL file
      const jsonlContent = sampleArticles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(jsonlPath, jsonlContent, 'utf-8');

      const metadata: ConversionMetadata = {
        provider: 'pubmed',
        queryName: 'test-query',
      };

      await convertResultsToYaml(jsonlPath, yamlPath, metadata);

      // Read and parse YAML
      const yamlContent = await readFile(yamlPath, 'utf-8');
      const parsed = parseYaml(yamlContent);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toHaveLength(2);
    });

    it('omits null/undefined fields and rawResponse', async () => {
      const jsonlPath = join(testDir, 'results.jsonl');
      const yamlPath = join(testDir, 'results.yaml');

      await writeFile(jsonlPath, JSON.stringify(articleWithNullFields), 'utf-8');

      await convertResultsToYaml(jsonlPath, yamlPath, {
        provider: 'pubmed',
        queryName: 'test',
      });

      const yamlContent = await readFile(yamlPath, 'utf-8');

      // Should not contain 'rawResponse', 'null', 'publicationDate:' with null value
      expect(yamlContent).not.toContain('rawResponse');
      expect(yamlContent).not.toContain('null');
      expect(yamlContent).not.toMatch(/journal:\s*$/m);
      expect(yamlContent).not.toMatch(/volume:\s*$/m);
    });

    it('uses block scalar for multi-line abstracts', async () => {
      const jsonlPath = join(testDir, 'results.jsonl');
      const yamlPath = join(testDir, 'results.yaml');

      await writeFile(jsonlPath, JSON.stringify(sampleArticles[0]), 'utf-8');

      await convertResultsToYaml(jsonlPath, yamlPath, {
        provider: 'pubmed',
        queryName: 'test',
      });

      const yamlContent = await readFile(yamlPath, 'utf-8');

      // Block scalar indicator should be present for multi-line content
      expect(yamlContent).toMatch(/abstract:\s*\|/);
    });

    it('includes header comment with provider name and count', async () => {
      const jsonlPath = join(testDir, 'results.jsonl');
      const yamlPath = join(testDir, 'results.yaml');

      const jsonlContent = sampleArticles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(jsonlPath, jsonlContent, 'utf-8');

      await convertResultsToYaml(jsonlPath, yamlPath, {
        provider: 'pubmed',
        queryName: 'my-test-query',
      });

      const yamlContent = await readFile(yamlPath, 'utf-8');

      // Check header comments
      expect(yamlContent).toMatch(/^# Results: pubmed/);
      expect(yamlContent).toContain('2 articles');
      expect(yamlContent).toContain('Query: my-test-query');
    });

    it('round-trip: articles loaded from YAML match original JSONL', async () => {
      const jsonlPath = join(testDir, 'results.jsonl');
      const yamlPath = join(testDir, 'results.yaml');

      // Filter out articles with rawResponse for comparison
      const articlesForComparison = sampleArticles.map((a) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { rawResponse: _rawResponse, ...rest } = a;
        // Remove undefined/null values for comparison
        return Object.fromEntries(
          Object.entries(rest).filter(([, v]) => v !== undefined && v !== null),
        );
      });

      const jsonlContent = sampleArticles.map((a) => JSON.stringify(a)).join('\n');
      await writeFile(jsonlPath, jsonlContent, 'utf-8');

      await convertResultsToYaml(jsonlPath, yamlPath, {
        provider: 'pubmed',
        queryName: 'test',
      });

      // Load from YAML
      const loadedArticles = await loadResults(testDir, 'pubmed');

      // Compare (ignoring rawResponse and null/undefined fields)
      for (let i = 0; i < loadedArticles.length; i++) {
        const loaded = Object.fromEntries(
          Object.entries(loadedArticles[i]!).filter(([, v]) => v !== undefined && v !== null),
        );
        expect(loaded).toEqual(articlesForComparison[i]);
      }
    });
  });

  describe('loadResults', () => {
    it('reads from YAML when present', async () => {
      const yamlPath = join(testDir, 'pubmed_results.yaml');
      const jsonlPath = join(testDir, 'pubmed_results.jsonl');

      // Create both files with different content
      const jsonlArticles = [{ ...sampleArticles[0], title: 'From JSONL' }];

      // Write YAML file (simplified format)
      const yamlContent = `# Results: pubmed (1 articles)
# Query: test
- title: "From YAML"
  authors:
    - family: Smith
      given: John
  source: pubmed
  retrievedAt: "2026-02-03T10:30:00Z"
`;
      await writeFile(yamlPath, yamlContent, 'utf-8');
      await writeFile(jsonlPath, JSON.stringify(jsonlArticles[0]), 'utf-8');

      const articles = await loadResults(testDir, 'pubmed');

      expect(articles).toHaveLength(1);
      expect(articles[0]!.title).toBe('From YAML');
    });

    it('falls back to JSONL when YAML is absent', async () => {
      const jsonlPath = join(testDir, 'pubmed_results.jsonl');

      await writeFile(jsonlPath, JSON.stringify(sampleArticles[0]), 'utf-8');

      const articles = await loadResults(testDir, 'pubmed');

      expect(articles).toHaveLength(1);
      expect(articles[0]!.title).toBe(sampleArticles[0]!.title);
    });

    it('returns Article[] in both cases', async () => {
      // Test with YAML
      const yamlDir = join(testDir, 'yaml-session');
      await mkdir(yamlDir, { recursive: true });

      const yamlContent = `# Results: pubmed (1 articles)
- title: "Test Article"
  authors: []
  source: pubmed
  retrievedAt: "2026-02-03T10:30:00Z"
`;
      await writeFile(join(yamlDir, 'pubmed_results.yaml'), yamlContent, 'utf-8');

      const yamlArticles = await loadResults(yamlDir, 'pubmed');
      expect(Array.isArray(yamlArticles)).toBe(true);
      expect(yamlArticles[0]).toHaveProperty('title');
      expect(yamlArticles[0]).toHaveProperty('source');

      // Test with JSONL
      const jsonlDir = join(testDir, 'jsonl-session');
      await mkdir(jsonlDir, { recursive: true });

      await writeFile(
        join(jsonlDir, 'pubmed_results.jsonl'),
        JSON.stringify(sampleArticles[0]),
        'utf-8',
      );

      const jsonlArticles = await loadResults(jsonlDir, 'pubmed');
      expect(Array.isArray(jsonlArticles)).toBe(true);
      expect(jsonlArticles[0]).toHaveProperty('title');
      expect(jsonlArticles[0]).toHaveProperty('source');
    });

    it('returns empty array when no results file exists', async () => {
      const emptyDir = join(testDir, 'empty-session');
      await mkdir(emptyDir, { recursive: true });

      const articles = await loadResults(emptyDir, 'pubmed');
      expect(articles).toEqual([]);
    });
  });
});
