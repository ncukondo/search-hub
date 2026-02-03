import { describe, it, expect } from 'vitest';
import type { Article, ProviderName } from '../../../providers/base/types.js';
import { deduplicateForReview } from './dedup.js';

// Helper to create a minimal Author object
const author = (family: string) => ({ family });

describe('deduplicateForReview', () => {
  it('always sets mergedFrom for articles with identifiers (single source)', () => {
    const articles: Article[] = [
      {
        title: 'Article 1',
        authors: [author('Author A')],
        pmid: '111',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Article 2',
        authors: [author('Author B')],
        doi: '10.1234/a',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(2);
    expect(result.duplicatesRemoved).toBe(0);

    // Single-source articles should have mergedFrom with one entry to preserve source info
    expect(result.articles[0]!.mergedFrom).toHaveLength(1);
    expect(result.articles[0]!.mergedFrom![0]!.source).toBe('pubmed');
    expect(result.articles[0]!.mergedFrom![0]!.pmid).toBe('111');

    expect(result.articles[1]!.mergedFrom).toHaveLength(1);
    expect(result.articles[1]!.mergedFrom![0]!.source).toBe('scopus');
    expect(result.articles[1]!.mergedFrom![0]!.doi).toBe('10.1234/a');
  });

  it('tracks mergedFrom for DOI duplicates', () => {
    const articles: Article[] = [
      {
        title: 'Article from PubMed',
        authors: [author('Author A')],
        pmid: '111',
        doi: '10.1234/shared',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Same article from Scopus',
        authors: [author('Author A')],
        scopusId: 'S222',
        doi: '10.1234/shared',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);

    const merged = result.articles[0]!;
    expect(merged.mergedFrom).toBeDefined();
    expect(merged.mergedFrom).toHaveLength(2);

    // Check that both sources are recorded
    const sources = merged.mergedFrom!.map((m) => m.source);
    expect(sources).toContain('pubmed');
    expect(sources).toContain('scopus');

    // Check source identifiers are preserved
    const pubmedSource = merged.mergedFrom!.find((m) => m.source === 'pubmed');
    expect(pubmedSource?.pmid).toBe('111');
    expect(pubmedSource?.doi).toBe('10.1234/shared');

    const scopusSource = merged.mergedFrom!.find((m) => m.source === 'scopus');
    expect(scopusSource?.scopusId).toBe('S222');
    expect(scopusSource?.doi).toBe('10.1234/shared');
  });

  it('tracks mergedFrom for PMID duplicates', () => {
    const articles: Article[] = [
      {
        title: 'Article 1',
        authors: [author('Author A')],
        pmid: '12345',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Article 1 duplicate',
        authors: [author('Author A')],
        pmid: '12345',
        doi: '10.9999/extra',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(1);

    // The article with more metadata should be kept as primary
    const merged = result.articles[0]!;
    expect(merged.mergedFrom).toHaveLength(2);
  });

  it('tracks multiple duplicates merging into one', () => {
    const articles: Article[] = [
      {
        title: 'Article from ERIC',
        authors: [author('Author A')],
        ericId: 'ED123',
        doi: '10.1234/multi',
        source: 'eric',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Same from PubMed',
        authors: [author('Author A')],
        pmid: '999',
        doi: '10.1234/multi',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Same from Scopus',
        authors: [author('Author A')],
        scopusId: 'S888',
        doi: '10.1234/multi',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(1);
    expect(result.duplicatesRemoved).toBe(2);

    const merged = result.articles[0]!;
    expect(merged.mergedFrom).toHaveLength(3);

    const sources = merged.mergedFrom!.map((m) => m.source);
    expect(sources).toContain('eric');
    expect(sources).toContain('pubmed');
    expect(sources).toContain('scopus');
  });

  it('keeps richer record when merging', () => {
    const articles: Article[] = [
      {
        title: 'Minimal record',
        authors: [author('Author A')],
        doi: '10.1234/test',
        source: 'scopus',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Rich record with abstract',
        authors: [author('Author A'), author('Author B')],
        doi: '10.1234/test',
        pmid: '12345',
        abstract: 'This is the abstract of the article.',
        publicationDate: '2024-01-15',
        journal: 'Journal of Testing',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(1);

    // The richer record should be kept as primary
    const kept = result.articles[0]!;
    expect(kept.abstract).toBe('This is the abstract of the article.');
    expect(kept.pmid).toBe('12345');
    expect(kept.journal).toBe('Journal of Testing');
  });

  it('handles articles without identifiers', () => {
    // Use a valid ProviderName for testing
    const source: ProviderName = 'pubmed';
    const articles: Article[] = [
      {
        title: 'Article without ID',
        authors: [author('Author')],
        source,
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.mergedFrom).toBeUndefined();
  });

  it('preserves all identifier types in mergedFrom', () => {
    const articles: Article[] = [
      {
        title: 'Article from arXiv',
        authors: [author('Author')],
        arxivId: '2401.12345',
        doi: '10.1234/shared',
        source: 'arxiv',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
      {
        title: 'Same from PubMed',
        authors: [author('Author')],
        pmid: '12345',
        doi: '10.1234/shared',
        source: 'pubmed',
        retrievedAt: '2024-01-01T00:00:00Z',
      },
    ];

    const result = deduplicateForReview(articles);
    const merged = result.articles[0]!;

    const arxivSource = merged.mergedFrom!.find((m) => m.source === 'arxiv');
    expect(arxivSource?.arxivId).toBe('2401.12345');
    expect(arxivSource?.doi).toBe('10.1234/shared');

    const pubmedSource = merged.mergedFrom!.find((m) => m.source === 'pubmed');
    expect(pubmedSource?.pmid).toBe('12345');
    expect(pubmedSource?.doi).toBe('10.1234/shared');
  });
});
