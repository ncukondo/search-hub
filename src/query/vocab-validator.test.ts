import { describe, it, expect, vi } from 'vitest';
import {
  extractControlledVocabTerms,
  validateControlledVocab,
  createEricCountValidator,
  createEmtreeCountValidator,
  type CountVocabValidator,
} from './vocab-validator.js';
import type { QueryAST } from './types.js';
import type { Provider, TranslatedQuery } from '../providers/base/types.js';
import { createMockMeSHClient } from './__test-helpers__/mock-mesh-client.js';
import { VocabCache } from './vocab-cache.js';

function makeAST(blocks: QueryAST['blocks']): QueryAST {
  return {
    name: 'test',
    blocks,
    filters: {},
    providers: {},
  };
}

describe('extractControlledVocabTerms', () => {
  it('should extract mesh terms from a single block', () => {
    const ast = makeAST([
      {
        id: 'b1',
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
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
      {
        id: 'b2',
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
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
      {
        id: 'b2',
        field: 'keyword',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([{ term: 'Diabetes Mellitus', vocabulary: 'mesh' }]);
  });

  it('should return empty array when no controlled vocab terms exist', () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: { keywords: ['diabetes'] },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);
    expect(terms).toEqual([]);
  });

  it('should extract eric descriptors from blocks', () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['education'],
          eric: ['Medical Education', 'Higher Education'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Medical Education', vocabulary: 'eric' },
      { term: 'Higher Education', vocabulary: 'eric' },
    ]);
  });

  it('should extract emtree terms from blocks', () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          emtree: ['diabetes mellitus', 'diabetic neuropathy'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'diabetes mellitus', vocabulary: 'emtree' },
      { term: 'diabetic neuropathy', vocabulary: 'emtree' },
    ]);
  });

  it('should extract all vocabulary types from mixed blocks', () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus'],
          eric: ['Medical Education'],
          emtree: ['diabetes mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh' },
      { term: 'Medical Education', vocabulary: 'eric' },
      { term: 'diabetes mellitus', vocabulary: 'emtree' },
    ]);
  });

  it('should deduplicate eric and emtree terms across blocks', () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          eric: ['Medical Education'],
          emtree: ['diabetes mellitus'],
        },
        operator: 'OR',
      },
      {
        id: 'b2',
        field: 'keyword',
        terms: {
          eric: ['Medical Education'],
          emtree: ['diabetes mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const terms = extractControlledVocabTerms(ast);

    expect(terms).toEqual([
      { term: 'Medical Education', vocabulary: 'eric' },
      { term: 'diabetes mellitus', vocabulary: 'emtree' },
    ]);
  });
});

describe('validateControlledVocab', () => {
  it('should validate mesh terms and return results', async () => {
    const ast = makeAST([
      {
        id: 'b1',
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
      ]),
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toEqual([{ term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true }]);
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
        id: 'b1',
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
        id: 'b1',
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
      ]),
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('should catch API errors and put them in errors array', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          mesh: ['Diabetes Mellitus', 'Timeout Term', 'Artificial Intelligence'],
        },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(
      new Map([
        ['Diabetes Mellitus', { found: true }],
        ['Artificial Intelligence', { found: false, suggestions: ['AI'] }],
      ]),
    );
    // Make 'Timeout Term' throw an error
    (client.lookupTerm as ReturnType<typeof import('vitest').vi.fn>).mockImplementation(
      async (term: string) => {
        if (term === 'Timeout Term') {
          throw new Error('Request timed out');
        }
        const results = new Map([
          ['Diabetes Mellitus', { found: true }],
          ['Artificial Intelligence', { found: false, suggestions: ['AI'] }],
        ]);
        const result = results.get(term);
        return result
          ? { term, found: result.found, suggestions: result.suggestions }
          : { term, found: false };
      },
    );

    const result = await validateControlledVocab(ast, client);

    expect(result.valid).toEqual([{ term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true }]);
    expect(result.invalid).toEqual([
      {
        term: 'Artificial Intelligence',
        vocabulary: 'mesh',
        found: false,
        suggestions: ['AI'],
      },
    ]);
    expect(result.errors).toEqual([
      {
        term: 'Timeout Term',
        vocabulary: 'mesh',
        error: 'Request timed out',
      },
    ]);
  });

  it('should handle invalid terms without suggestions', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          keywords: ['xyz'],
          mesh: ['Completely Invalid'],
        },
        operator: 'OR',
      },
    ]);

    const client = createMockMeSHClient(new Map([['Completely Invalid', { found: false }]]));

    const result = await validateControlledVocab(ast, client);

    expect(result.invalid).toEqual([
      {
        term: 'Completely Invalid',
        vocabulary: 'mesh',
        found: false,
      },
    ]);
  });

  it('should validate eric descriptors via count-only search', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          eric: ['Medical Education', 'Medcial Education'],
        },
        operator: 'OR',
      },
    ]);

    const ericValidator: CountVocabValidator = {
      vocabulary: 'eric',
      countTerm: vi.fn(async (term: string) => {
        return term === 'Medical Education' ? 42 : 0;
      }),
    };

    const meshClient = createMockMeSHClient(new Map());
    const result = await validateControlledVocab(ast, meshClient, {
      countValidators: [ericValidator],
    });

    expect(result.valid).toEqual([{ term: 'Medical Education', vocabulary: 'eric', found: true }]);
    expect(result.invalid).toEqual([
      { term: 'Medcial Education', vocabulary: 'eric', found: false },
    ]);
  });

  it('should validate emtree terms via count-only search', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          emtree: ['diabetes mellitus', 'diabetis mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const emtreeValidator: CountVocabValidator = {
      vocabulary: 'emtree',
      countTerm: vi.fn(async (term: string) => {
        return term === 'diabetes mellitus' ? 100 : 0;
      }),
    };

    const meshClient = createMockMeSHClient(new Map());
    const result = await validateControlledVocab(ast, meshClient, {
      countValidators: [emtreeValidator],
    });

    expect(result.valid).toEqual([
      { term: 'diabetes mellitus', vocabulary: 'emtree', found: true },
    ]);
    expect(result.invalid).toEqual([
      { term: 'diabetis mellitus', vocabulary: 'emtree', found: false },
    ]);
  });

  it('should handle count-only search errors gracefully', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          eric: ['Valid Term', 'Error Term'],
        },
        operator: 'OR',
      },
    ]);

    const ericValidator: CountVocabValidator = {
      vocabulary: 'eric',
      countTerm: vi.fn(async (term: string) => {
        if (term === 'Error Term') throw new Error('API timeout');
        return 10;
      }),
    };

    const meshClient = createMockMeSHClient(new Map());
    const result = await validateControlledVocab(ast, meshClient, {
      countValidators: [ericValidator],
    });

    expect(result.valid).toEqual([{ term: 'Valid Term', vocabulary: 'eric', found: true }]);
    expect(result.errors).toEqual([
      { term: 'Error Term', vocabulary: 'eric', error: 'API timeout' },
    ]);
  });

  it('should validate mixed mesh, eric, and emtree terms', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          mesh: ['Diabetes Mellitus'],
          eric: ['Medical Education'],
          emtree: ['diabetes mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const meshClient = createMockMeSHClient(new Map([['Diabetes Mellitus', { found: true }]]));

    const ericValidator: CountVocabValidator = {
      vocabulary: 'eric',
      countTerm: vi.fn(async () => 50),
    };
    const emtreeValidator: CountVocabValidator = {
      vocabulary: 'emtree',
      countTerm: vi.fn(async () => 100),
    };

    const result = await validateControlledVocab(ast, meshClient, {
      countValidators: [ericValidator, emtreeValidator],
    });

    expect(result.valid).toHaveLength(3);
    expect(result.valid).toEqual([
      { term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true },
      { term: 'Medical Education', vocabulary: 'eric', found: true },
      { term: 'diabetes mellitus', vocabulary: 'emtree', found: true },
    ]);
  });

  it('should skip eric/emtree terms when no count validators provided', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          mesh: ['Diabetes Mellitus'],
          eric: ['Medical Education'],
          emtree: ['diabetes mellitus'],
        },
        operator: 'OR',
      },
    ]);

    const meshClient = createMockMeSHClient(new Map([['Diabetes Mellitus', { found: true }]]));

    const result = await validateControlledVocab(ast, meshClient);

    // Only MeSH terms validated, eric/emtree skipped
    expect(result.valid).toEqual([{ term: 'Diabetes Mellitus', vocabulary: 'mesh', found: true }]);
    expect(result.invalid).toEqual([]);
  });
});

describe('createEricCountValidator', () => {
  function createMockProvider(countResults: Map<string, number>): Provider {
    return {
      name: 'eric',
      count: vi.fn(async (query: TranslatedQuery) => {
        // Extract term from subject:"term"
        const match = query.native.match(/subject:"(.+?)"/);
        const term = match ? match[1] : '';
        return countResults.get(term ?? '') ?? 0;
      }),
      search: vi.fn(),
      translateQuery: vi.fn(),
      testConnection: vi.fn(),
    } as unknown as Provider;
  }

  it('should return count from provider', async () => {
    const provider = createMockProvider(new Map([['Medical Education', 42]]));
    const validator = createEricCountValidator(provider);

    const count = await validator.countTerm('Medical Education');
    expect(count).toBe(42);
    expect(provider.count).toHaveBeenCalledWith({
      native: 'subject:"Medical Education"',
      provider: 'eric',
    });
  });

  it('should return 0 for non-existent term', async () => {
    const provider = createMockProvider(new Map());
    const validator = createEricCountValidator(provider);

    const count = await validator.countTerm('Nonexistent Term');
    expect(count).toBe(0);
  });

  it('should use cache when available', async () => {
    const provider = createMockProvider(new Map([['Medical Education', 42]]));
    const cache = new VocabCache({ cachePath: '/tmp/test-cache.json' });
    cache.set('eric', 'Medical Education', { term: 'Medical Education', found: true });

    const validator = createEricCountValidator(provider, { cache });

    const count = await validator.countTerm('Medical Education');
    expect(count).toBe(1); // Returns 1 for found=true from cache
    expect(provider.count).not.toHaveBeenCalled(); // Provider not called
  });

  it('should store result in cache after lookup', async () => {
    const provider = createMockProvider(new Map([['Medical Education', 42]]));
    const cache = new VocabCache({ cachePath: '/tmp/test-cache.json' });
    const validator = createEricCountValidator(provider, { cache });

    await validator.countTerm('Medical Education');

    const cached = cache.get('eric', 'Medical Education');
    expect(cached).toEqual({ term: 'Medical Education', found: true });
  });

  it('should have vocabulary set to eric', () => {
    const provider = createMockProvider(new Map());
    const validator = createEricCountValidator(provider);
    expect(validator.vocabulary).toBe('eric');
  });

  it('should strip double quotes from term in query', async () => {
    const provider = createMockProvider(new Map([['with quotes', 5]]));
    const validator = createEricCountValidator(provider);

    await validator.countTerm('with "quotes"');
    expect(provider.count).toHaveBeenCalledWith({
      native: 'subject:"with quotes"',
      provider: 'eric',
    });
  });
});

describe('createEmtreeCountValidator', () => {
  function createMockProvider(countResults: Map<string, number>): Provider {
    return {
      name: 'scopus',
      count: vi.fn(async (query: TranslatedQuery) => {
        // Extract term from INDEXTERMS("term")
        const match = query.native.match(/INDEXTERMS\("(.+?)"\)/);
        const term = match ? match[1] : '';
        return countResults.get(term ?? '') ?? 0;
      }),
      search: vi.fn(),
      translateQuery: vi.fn(),
      testConnection: vi.fn(),
    } as unknown as Provider;
  }

  it('should return count from provider', async () => {
    const provider = createMockProvider(new Map([['diabetes mellitus', 100]]));
    const validator = createEmtreeCountValidator(provider);

    const count = await validator.countTerm('diabetes mellitus');
    expect(count).toBe(100);
    expect(provider.count).toHaveBeenCalledWith({
      native: 'INDEXTERMS("diabetes mellitus")',
      provider: 'scopus',
    });
  });

  it('should return 0 for non-existent term', async () => {
    const provider = createMockProvider(new Map());
    const validator = createEmtreeCountValidator(provider);

    const count = await validator.countTerm('nonexistent');
    expect(count).toBe(0);
  });

  it('should use cache when available', async () => {
    const provider = createMockProvider(new Map([['diabetes mellitus', 100]]));
    const cache = new VocabCache({ cachePath: '/tmp/test-cache.json' });
    cache.set('emtree', 'diabetes mellitus', { term: 'diabetes mellitus', found: true });

    const validator = createEmtreeCountValidator(provider, { cache });

    const count = await validator.countTerm('diabetes mellitus');
    expect(count).toBe(1); // Returns 1 for found=true from cache
    expect(provider.count).not.toHaveBeenCalled();
  });

  it('should have vocabulary set to emtree', () => {
    const provider = createMockProvider(new Map());
    const validator = createEmtreeCountValidator(provider);
    expect(validator.vocabulary).toBe('emtree');
  });

  it('should strip double quotes from term in query', async () => {
    const provider = createMockProvider(new Map([['with quotes', 10]]));
    const validator = createEmtreeCountValidator(provider);

    await validator.countTerm('with "quotes"');
    expect(provider.count).toHaveBeenCalledWith({
      native: 'INDEXTERMS("with quotes")',
      provider: 'scopus',
    });
  });
});

describe('validateControlledVocab concurrency', () => {
  it('should limit per-group concurrency to 3', async () => {
    // Create 5 ERIC terms to verify max 3 concurrent
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          eric: ['A', 'B', 'C', 'D', 'E'],
        },
        operator: 'OR',
      },
    ]);

    let concurrent = 0;
    let maxConcurrent = 0;

    const ericValidator: CountVocabValidator = {
      vocabulary: 'eric',
      countTerm: vi.fn(async () => {
        concurrent++;
        if (concurrent > maxConcurrent) maxConcurrent = concurrent;
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return 1;
      }),
    };

    const meshClient = createMockMeSHClient(new Map());
    await validateControlledVocab(ast, meshClient, {
      countValidators: [ericValidator],
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(ericValidator.countTerm).toHaveBeenCalledTimes(5);
  });

  it('should run different vocab groups in parallel', async () => {
    const ast = makeAST([
      {
        id: 'b1',
        field: 'title_abstract',
        terms: {
          eric: ['E1'],
          emtree: ['M1'],
        },
        operator: 'OR',
      },
    ]);

    const callOrder: string[] = [];

    const ericValidator: CountVocabValidator = {
      vocabulary: 'eric',
      countTerm: vi.fn(async () => {
        callOrder.push('eric-start');
        await new Promise((r) => setTimeout(r, 20));
        callOrder.push('eric-end');
        return 1;
      }),
    };

    const emtreeValidator: CountVocabValidator = {
      vocabulary: 'emtree',
      countTerm: vi.fn(async () => {
        callOrder.push('emtree-start');
        await new Promise((r) => setTimeout(r, 20));
        callOrder.push('emtree-end');
        return 1;
      }),
    };

    const meshClient = createMockMeSHClient(new Map());
    await validateControlledVocab(ast, meshClient, {
      countValidators: [ericValidator, emtreeValidator],
    });

    // Both should start before either ends (parallel execution)
    const ericStartIdx = callOrder.indexOf('eric-start');
    const emtreeStartIdx = callOrder.indexOf('emtree-start');
    const ericEndIdx = callOrder.indexOf('eric-end');
    const emtreeEndIdx = callOrder.indexOf('emtree-end');

    expect(ericStartIdx).toBeLessThan(ericEndIdx);
    expect(emtreeStartIdx).toBeLessThan(emtreeEndIdx);
    // Both started before either finished
    expect(Math.max(ericStartIdx, emtreeStartIdx)).toBeLessThan(Math.min(ericEndIdx, emtreeEndIdx));
  });
});
