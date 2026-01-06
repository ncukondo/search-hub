import { describe, it, expect } from 'vitest';
import { parseAtomFeed, extractArxivId } from './parser.js';

/**
 * Sample Atom XML response from arXiv API
 */
const SAMPLE_ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <link href="http://arxiv.org/api/query?search_query=ti:quantum&amp;start=0&amp;max_results=10" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query: search_query=ti:quantum&amp;start=0&amp;max_results=10</title>
  <id>http://arxiv.org/api/query</id>
  <updated>2024-01-15T00:00:00-05:00</updated>
  <opensearch:totalResults>12345</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>10</opensearch:itemsPerPage>
  <entry>
    <id>http://arxiv.org/abs/2401.12345v1</id>
    <updated>2024-01-15T00:00:00Z</updated>
    <published>2024-01-15T00:00:00Z</published>
    <title>Quantum Machine Learning for Diabetes Prediction</title>
    <summary>This paper presents a novel approach to diabetes prediction using quantum computing and machine learning techniques. We demonstrate improved accuracy over classical methods.</summary>
    <author>
      <name>John Smith</name>
    </author>
    <author>
      <name>Jane Doe</name>
    </author>
    <arxiv:doi>10.1234/example.2024.001</arxiv:doi>
    <link href="http://arxiv.org/abs/2401.12345v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2401.12345v1" rel="related" type="application/pdf"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <category term="q-bio.QM" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2312.54321v2</id>
    <updated>2024-01-10T00:00:00Z</updated>
    <published>2023-12-20T00:00:00Z</published>
    <title>Deep Learning in Quantum Physics</title>
    <summary>An exploration of deep learning applications in quantum physics simulations.</summary>
    <author>
      <name>Alice Johnson</name>
    </author>
    <link href="http://arxiv.org/abs/2312.54321v2" rel="alternate" type="text/html"/>
    <arxiv:primary_category xmlns:arxiv="http://arxiv.org/schemas/atom" term="physics.comp-ph" scheme="http://arxiv.org/schemas/atom"/>
    <category term="physics.comp-ph" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

const EMPTY_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
      xmlns:arxiv="http://arxiv.org/schemas/atom">
  <opensearch:totalResults>0</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>10</opensearch:itemsPerPage>
</feed>`;

describe('parseAtomFeed', () => {
  it('should parse Atom feed response', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result).toBeDefined();
  });

  it('should extract opensearch:totalResults', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.totalResults).toBe(12345);
  });

  it('should extract startIndex', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.startIndex).toBe(0);
  });

  it('should extract itemsPerPage', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.itemsPerPage).toBe(10);
  });

  it('should extract entry elements', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries).toHaveLength(2);
  });

  it('should handle empty feed with no entries', () => {
    const result = parseAtomFeed(EMPTY_FEED);
    expect(result.totalResults).toBe(0);
    expect(result.entries).toHaveLength(0);
  });
});

describe('parseEntry', () => {
  it('should extract paper title', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.title).toBe('Quantum Machine Learning for Diabetes Prediction');
  });

  it('should extract paper abstract (summary)', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.abstract).toContain('novel approach to diabetes prediction');
  });

  it('should extract DOI from arxiv:doi element', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.doi).toBe('10.1234/example.2024.001');
  });

  it('should handle missing DOI', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    // Second entry has no DOI
    expect(result.entries[1]?.doi).toBeUndefined();
  });

  it('should extract primary category', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.primaryCategory).toBe('cs.AI');
  });

  it('should extract all categories', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.categories).toContain('cs.AI');
    expect(result.entries[0]?.categories).toContain('cs.LG');
    expect(result.entries[0]?.categories).toContain('q-bio.QM');
  });

  it('should extract multiple authors', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.authors).toHaveLength(2);
    expect(result.entries[0]?.authors[0]?.family).toBe('Smith');
    expect(result.entries[0]?.authors[0]?.given).toBe('John');
    expect(result.entries[0]?.authors[1]?.family).toBe('Doe');
    expect(result.entries[0]?.authors[1]?.given).toBe('Jane');
  });

  it('should handle single author', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[1]?.authors).toHaveLength(1);
    expect(result.entries[1]?.authors[0]?.family).toBe('Johnson');
    expect(result.entries[1]?.authors[0]?.given).toBe('Alice');
  });

  it('should extract publication date from published element', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.publicationDate).toBe('2024-01-15');
  });

  it('should set source to arxiv', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.source).toBe('arxiv');
  });

  it('should set retrievedAt to current time', () => {
    const before = new Date().toISOString();
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    const after = new Date().toISOString();
    const retrievedAt = result.entries[0]?.retrievedAt;
    expect(retrievedAt).toBeDefined();
    expect(retrievedAt! >= before).toBe(true);
    expect(retrievedAt! <= after).toBe(true);
  });
});

describe('extractArxivId', () => {
  it('should extract arXiv ID from URL without version', () => {
    expect(extractArxivId('http://arxiv.org/abs/2401.12345v1')).toBe('2401.12345');
  });

  it('should extract arXiv ID from URL with version 2', () => {
    expect(extractArxivId('http://arxiv.org/abs/2312.54321v2')).toBe('2312.54321');
  });

  it('should handle old-style arXiv IDs', () => {
    expect(extractArxivId('http://arxiv.org/abs/hep-th/9901001v1')).toBe('hep-th/9901001');
  });

  it('should handle URL without version suffix', () => {
    expect(extractArxivId('http://arxiv.org/abs/2401.12345')).toBe('2401.12345');
  });

  it('should extract arxivId correctly in parsed entries', () => {
    const result = parseAtomFeed(SAMPLE_ATOM_FEED);
    expect(result.entries[0]?.arxivId).toBe('2401.12345');
    expect(result.entries[1]?.arxivId).toBe('2312.54321');
  });
});
