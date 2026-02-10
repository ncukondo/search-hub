import { describe, it, expect } from 'vitest';
import {
  extractControlledVocabTerms,
  validateControlledVocab,
} from './vocab-validator.js';
import type { QueryAST } from './types.js';
import { createMockMeSHClient } from './__test-helpers__/mock-mesh-client.js';

function makeAST(blocks: QueryAST['blocks']): QueryAST {
  return {
    name: 'test',
    blocks,
    filters: {},
    overrides: {},
  };
}

describe('extractControlledVocabTerms', () => {
  it('should extract mesh terms from a single block', () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus', 'Diabetes Mellitus, Type 2'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh' },
      { term: 'Diabetes Mellitus, Type 2', vocabulary: 'mesh' },
    ]);
  });

  it('should extract mesh terms from multiple blocks', () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
      {
        field: 'title_abstract',
        terms: {
          keywords: ['AI'],
          mesh: ['Artificial Intelligence'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh' },
      { term: 'Artificial Intelligence', vocabulary: 'mesh' },
    ]);
  });

  it('should deduplicate terms across blocks', () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
      {
        field: 'keyword',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh' },
    ]);
  });

  it('should return empty array when no controlled vocab terms exist', () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);
    expect(terms).toEqual([]);
  });
});

describe('validateControlledVocab', () => {
  it('should validate mesh terms and return results', async () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus', 'Not A Real Term'],
        },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(
      new Map([
        ['Diabetes Mellitus', { found: true }],
        ['Not A Real Term', { found: false, suggestions: ['Diabetes'] }],
      ])
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true },
    ]);
    expect(result.invalid).toEqual([
      {
        term: 'Not A Real Term',
        vocabulary: 'mesh',
        found: false,
        suggestions: ['Diabetes'],
      },
    ]);
  });

  it('should return empty results when no controlled vocab terms exist', async () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(new Map());

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('should handle all valid terms', async () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['AI'],
          mesh: ['Artificial Intelligence', 'Machine Learning'],
        },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(
      new Map([
        ['Artificial Intelligence', { found: true }],
        ['Machine Learning', { found: true }],
      ])
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('should handle invalid terms without suggestions', async () => {
    const ast = makeAST([
      {
        field: 'title_abstract',
        terms: {
          keywords: ['xyz'],
          mesh: ['Completely Invalid'],
        },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(
      new Map([['Completely Invalid', { found: false }]])
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.invalid).toEqual([
      {
        term: 'Completely Invalid',
        vocabulary: 'mesh',
        found: false,
      },
    ]);
  });
});
