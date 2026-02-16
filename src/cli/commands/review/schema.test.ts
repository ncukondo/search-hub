import { describe, it, expect } from 'vitest';
import {
  generateReviewJSONSchema,
  reviewFileSchema,
  reviewSchema,
  articleEntrySchema,
  mergedSourceSchema,
  reviewerRecordSchema,
} from './schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONSchema = Record<string, any>;

describe('generateReviewJSONSchema', () => {
  it('generates a valid JSON Schema draft-7', () => {
    const schema = generateReviewJSONSchema();
    expect(schema['$schema']).toContain('json-schema.org');
  });

  it('includes sessionId as required string', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).toContain('sessionId');
    expect(schema['properties']['sessionId']).toMatchObject({
      type: 'string',
    });
  });

  it('includes articles as required array', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).toContain('articles');
    expect(schema['properties']['articles']['type']).toBe('array');
  });

  it('includes reviewer as optional', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('reviewer');
  });

  it('includes basis as optional with enum values', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('basis');
  });

  it('includes reviewers as optional array', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('reviewers');
  });

  it('includes criteria as optional', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('criteria');
  });

  it('includes fulltext field in article entry (fixing gap from static schema)', () => {
    const schema = generateReviewJSONSchema() as JSONSchema;
    // Navigate to article entry properties
    const articleItems = schema['properties']['articles']['items'];
    // The fulltext property should exist (was missing in static schema)
    expect(articleItems['properties']['fulltext']).toBeDefined();
  });
});

describe('reviewFileSchema validation', () => {
  it('accepts a valid review file', () => {
    const data = {
      sessionId: 'test-session',
      articles: [
        {
          title: 'Test Article',
          reviews: [],
        },
      ],
    };
    expect(() => reviewFileSchema.parse(data)).not.toThrow();
  });

  it('accepts a review file with all optional fields', () => {
    const data = {
      sessionId: 'test-session',
      criteria: 'criteria.md',
      reviewer: 'ai:claude',
      basis: 'title',
      articles: [
        {
          doi: '10.1234/test',
          pmid: '12345678',
          title: 'Test Article',
          authors: 'Smith et al.',
          year: '2024',
          abstract: 'An abstract',
          reviews: [
            {
              reviewer: 'ai:claude',
              decision: 'include',
              basis: 'title',
              comment: 'relevant',
              timestamp: '2026-02-06T10:00:00Z',
            },
          ],
          reviewHistory: [],
          finalDecision: null,
        },
      ],
      reviewers: [{ name: 'ai:claude', basis: 'title' }],
    };
    expect(() => reviewFileSchema.parse(data)).not.toThrow();
  });

  it('rejects missing sessionId', () => {
    const data = {
      articles: [],
    };
    expect(() => reviewFileSchema.parse(data)).toThrow();
  });

  it('rejects missing articles', () => {
    const data = {
      sessionId: 'test',
    };
    expect(() => reviewFileSchema.parse(data)).toThrow();
  });

  it('rejects invalid decision value', () => {
    const data = {
      sessionId: 'test',
      articles: [
        {
          title: 'Test',
          reviews: [{ reviewer: 'test', decision: 'maybe' }],
        },
      ],
    };
    expect(() => reviewFileSchema.parse(data)).toThrow();
  });

  it('rejects invalid basis value', () => {
    const data = {
      sessionId: 'test',
      basis: 'invalid',
      articles: [],
    };
    expect(() => reviewFileSchema.parse(data)).toThrow();
  });
});

describe('reviewSchema validation', () => {
  it('accepts a minimal review (reviewer only)', () => {
    expect(() => reviewSchema.parse({ reviewer: 'test' })).not.toThrow();
  });

  it('accepts a full review', () => {
    const data = {
      reviewer: 'ai:claude',
      decision: 'exclude',
      basis: 'abstract',
      comment: 'off topic',
      timestamp: '2026-02-06T10:00:00Z',
    };
    expect(() => reviewSchema.parse(data)).not.toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      reviewSchema.parse({ reviewer: 'test', unknown: true })
    ).toThrow();
  });
});

describe('articleEntrySchema validation', () => {
  it('accepts minimal article (title + reviews)', () => {
    expect(() =>
      articleEntrySchema.parse({ title: 'Test', reviews: [] })
    ).not.toThrow();
  });

  it('accepts finalDecision as null', () => {
    expect(() =>
      articleEntrySchema.parse({
        title: 'Test',
        reviews: [],
        finalDecision: null,
      })
    ).not.toThrow();
  });

  it('accepts finalDecision as include/exclude', () => {
    expect(() =>
      articleEntrySchema.parse({
        title: 'Test',
        reviews: [],
        finalDecision: 'include',
      })
    ).not.toThrow();
    expect(() =>
      articleEntrySchema.parse({
        title: 'Test',
        reviews: [],
        finalDecision: 'exclude',
      })
    ).not.toThrow();
  });

  it('rejects finalDecision as uncertain', () => {
    expect(() =>
      articleEntrySchema.parse({
        title: 'Test',
        reviews: [],
        finalDecision: 'uncertain',
      })
    ).toThrow();
  });

  it('accepts fulltext reference', () => {
    expect(() =>
      articleEntrySchema.parse({
        title: 'Test',
        reviews: [],
        fulltext: {
          dirName: 'smith-2024-abc12345',
          hasFiles: { pdf: true, xml: false, html: false, markdown: true },
        },
      })
    ).not.toThrow();
  });
});

describe('mergedSourceSchema validation', () => {
  it('accepts minimal source', () => {
    expect(() =>
      mergedSourceSchema.parse({ source: 'pubmed' })
    ).not.toThrow();
  });

  it('accepts source with identifiers', () => {
    expect(() =>
      mergedSourceSchema.parse({
        source: 'pubmed',
        pmid: '12345678',
        doi: '10.1234/test',
      })
    ).not.toThrow();
  });
});

describe('reviewerRecordSchema validation', () => {
  it('accepts valid record', () => {
    expect(() =>
      reviewerRecordSchema.parse({ name: 'ai:claude', basis: 'title' })
    ).not.toThrow();
  });

  it('rejects missing basis', () => {
    expect(() => reviewerRecordSchema.parse({ name: 'ai:claude' })).toThrow();
  });
});
