import { describe, it, expect } from 'vitest';
import { resolveForProvider } from './resolver.js';
import type { QueryAST } from './types.js';

function makeAST(overrides?: Partial<QueryAST>): QueryAST {
  return {
    name: 'test_query',
    blocks: [
      {
        id: 'population',
        field: 'title_abstract',
        terms: { keywords: ['diabetes', 'type 2 diabetes'] },
        operator: 'OR',
      },
      {
        id: 'intervention',
        field: 'title_abstract',
        terms: { keywords: ['AI', 'machine learning'] },
        operator: 'OR',
      },
    ],
    filters: {
      yearFrom: 2020,
      yearTo: 2024,
      languages: ['en'],
    },
    providers: {},
    ...overrides,
  };
}

describe('resolveForProvider', () => {
  it('should return blocks and filters unchanged when no providers section', () => {
    const ast = makeAST();
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.name).toBe('test_query');
    expect(resolved.blocks).toEqual(ast.blocks);
    expect(resolved.filters).toEqual(ast.filters);
    expect('providers' in resolved).toBe(false);
  });

  it('should return default as-is when provider not in providers section', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          adds: { filters: { categories: ['cs.AI'] } },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.blocks).toEqual(ast.blocks);
    expect(resolved.filters).toEqual(ast.filters);
  });

  it('should replace one block via replaces', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          replaces: {
            intervention: {
              field: 'all',
              terms: { keywords: ['deep learning', 'neural network'] },
              operator: 'OR',
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'arxiv');
    expect(resolved.blocks).toHaveLength(2);
    // population unchanged
    expect(resolved.blocks[0]!.id).toBe('population');
    expect(resolved.blocks[0]!.terms.keywords).toEqual(['diabetes', 'type 2 diabetes']);
    // intervention replaced
    expect(resolved.blocks[1]!.id).toBe('intervention');
    expect(resolved.blocks[1]!.field).toBe('all');
    expect(resolved.blocks[1]!.terms.keywords).toEqual(['deep learning', 'neural network']);
  });

  it('should replace multiple blocks', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          replaces: {
            population: {
              field: 'all',
              terms: { keywords: ['arxiv-diabetes'] },
              operator: 'OR',
            },
            intervention: {
              field: 'all',
              terms: { keywords: ['arxiv-AI'] },
              operator: 'OR',
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'arxiv');
    expect(resolved.blocks[0]!.terms.keywords).toEqual(['arxiv-diabetes']);
    expect(resolved.blocks[1]!.terms.keywords).toEqual(['arxiv-AI']);
  });

  it('should deep-merge adds.filters with default filters (scalars replace)', () => {
    const ast = makeAST({
      providers: {
        pubmed: {
          adds: {
            filters: {
              yearFrom: 2022,
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.filters.yearFrom).toBe(2022);
    expect(resolved.filters.yearTo).toBe(2024);
    expect(resolved.filters.languages).toEqual(['en']);
  });

  it('should deep-merge adds.filters with default filters (arrays replace)', () => {
    const ast = makeAST({
      providers: {
        pubmed: {
          adds: {
            filters: {
              languages: ['en', 'ja'],
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.filters.languages).toEqual(['en', 'ja']);
  });

  it('should deep-merge adds.filters with objects (publicationTypes deep-merge)', () => {
    const ast = makeAST({
      filters: {
        yearFrom: 2020,
        publicationTypes: {
          include: ['Journal Article'],
        },
      },
      providers: {
        pubmed: {
          adds: {
            filters: {
              publicationTypes: {
                exclude: ['Review', 'Meta-Analysis'],
              },
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.filters.publicationTypes?.include).toEqual(['Journal Article']);
    expect(resolved.filters.publicationTypes?.exclude).toEqual(['Review', 'Meta-Analysis']);
  });

  it('should set filters from adds when no default filters exist', () => {
    const ast = makeAST({
      filters: {},
      providers: {
        arxiv: {
          adds: {
            filters: {
              categories: ['cs.AI', 'cs.LG'],
              yearFrom: 2022,
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'arxiv');
    expect(resolved.filters.categories).toEqual(['cs.AI', 'cs.LG']);
    expect(resolved.filters.yearFrom).toBe(2022);
  });

  it('should handle both replaces and adds together', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          replaces: {
            intervention: {
              field: 'all',
              terms: { keywords: ['deep learning'] },
              operator: 'OR',
            },
          },
          adds: {
            filters: {
              categories: ['cs.AI'],
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'arxiv');
    expect(resolved.blocks[1]!.terms.keywords).toEqual(['deep learning']);
    expect(resolved.filters.categories).toEqual(['cs.AI']);
    expect(resolved.filters.yearFrom).toBe(2020);
  });

  it('should not mutate the original AST', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          replaces: {
            intervention: {
              field: 'all',
              terms: { keywords: ['deep learning'] },
              operator: 'OR',
            },
          },
          adds: {
            filters: { categories: ['cs.AI'] },
          },
        },
      },
    });
    const originalBlocks = JSON.parse(JSON.stringify(ast.blocks));
    const originalFilters = JSON.parse(JSON.stringify(ast.filters));
    resolveForProvider(ast, 'arxiv');
    expect(ast.blocks).toEqual(originalBlocks);
    expect(ast.filters).toEqual(originalFilters);
  });

  it('should produce deeply independent copies (no shared references)', () => {
    const ast = makeAST({
      providers: {
        pubmed: {
          replaces: {
            population: {
              field: 'title_abstract',
              terms: { keywords: ['modified'] },
              operator: 'OR',
            },
          },
        },
      },
    });
    const resolved = resolveForProvider(ast, 'pubmed');
    // Mutating resolved block's terms should not affect the input AST providers section
    resolved.blocks[0]!.terms.keywords!.push('extra-term');
    expect(ast.providers!.pubmed!.replaces!['population']!.terms.keywords).toEqual(['modified']);
    // Mutating non-replaced block's terms should not affect input
    resolved.blocks[1]!.terms.keywords!.push('extra-term');
    expect(ast.blocks[1]!.terms.keywords).toEqual(['AI', 'machine learning']);
  });

  it('should preserve name and description', () => {
    const ast = makeAST({ description: 'Test description' });
    const resolved = resolveForProvider(ast, 'pubmed');
    expect(resolved.name).toBe('test_query');
    expect(resolved.description).toBe('Test description');
  });

  it('should throw for replaces referencing non-existent id', () => {
    const ast = makeAST({
      providers: {
        arxiv: {
          replaces: {
            nonexistent: {
              field: 'all',
              terms: { keywords: ['test'] },
              operator: 'OR',
            },
          },
        },
      },
    });
    expect(() => resolveForProvider(ast, 'arxiv')).toThrow(/nonexistent/);
  });

  describe('omits', () => {
    function makeFourBlockAST(providers: QueryAST['providers']): QueryAST {
      const base = makeAST();
      return makeAST({
        blocks: [
          ...base.blocks,
          {
            id: 'setting',
            field: 'title_abstract',
            terms: { keywords: ['hospital'] },
            operator: 'OR',
          },
          {
            id: 'outcome',
            field: 'title_abstract',
            terms: { keywords: ['mortality'] },
            operator: 'OR',
          },
        ],
        providers,
      });
    }

    it('should drop omitted blocks for that provider only', () => {
      const ast = makeFourBlockAST({ arxiv: { omits: ['setting'] } });
      expect(resolveForProvider(ast, 'arxiv').blocks.map((b) => b.id)).toEqual([
        'population',
        'intervention',
        'outcome',
      ]);
      expect(resolveForProvider(ast, 'pubmed').blocks.map((b) => b.id)).toEqual([
        'population',
        'intervention',
        'setting',
        'outcome',
      ]);
    });

    it('should preserve block order when omitting multiple blocks', () => {
      const ast = makeFourBlockAST({ arxiv: { omits: ['outcome', 'population'] } });
      expect(resolveForProvider(ast, 'arxiv').blocks.map((b) => b.id)).toEqual([
        'intervention',
        'setting',
      ]);
    });

    it('should combine with replaces on other blocks and adds.filters', () => {
      const ast = makeFourBlockAST({
        arxiv: {
          omits: ['setting'],
          replaces: {
            intervention: { field: 'all', terms: { keywords: ['deep learning'] }, operator: 'OR' },
          },
          adds: { filters: { categories: ['cs.AI'] } },
        },
      });
      const resolved = resolveForProvider(ast, 'arxiv');
      expect(resolved.blocks.map((b) => b.id)).toEqual(['population', 'intervention', 'outcome']);
      expect(resolved.blocks[1]!.terms.keywords).toEqual(['deep learning']);
      expect(resolved.filters.categories).toEqual(['cs.AI']);
    });

    it('should not mutate the input AST', () => {
      const ast = makeFourBlockAST({ arxiv: { omits: ['setting'] } });
      resolveForProvider(ast, 'arxiv');
      expect(ast.blocks).toHaveLength(4);
    });

    it('should throw for omits referencing non-existent id', () => {
      const ast = makeFourBlockAST({ arxiv: { omits: ['nonexistent'] } });
      expect(() => resolveForProvider(ast, 'arxiv')).toThrow(/arxiv.*nonexistent/);
    });

    it('should throw when a block is in both replaces and omits', () => {
      const ast = makeFourBlockAST({
        arxiv: {
          omits: ['setting'],
          replaces: {
            setting: { field: 'all', terms: { keywords: ['clinic'] }, operator: 'OR' },
          },
        },
      });
      expect(() => resolveForProvider(ast, 'arxiv')).toThrow(/setting.*both replaces and omits/);
    });

    it('should throw when all blocks are omitted', () => {
      const ast = makeFourBlockAST({
        arxiv: { omits: ['population', 'intervention', 'setting', 'outcome'] },
      });
      expect(() => resolveForProvider(ast, 'arxiv')).toThrow(/removes all blocks/);
    });

    it('should throw for duplicate ids in omits', () => {
      const ast = makeFourBlockAST({ arxiv: { omits: ['setting', 'setting'] } });
      expect(() => resolveForProvider(ast, 'arxiv')).toThrow(/duplicate block id "setting"/);
    });
  });
});
