import { describe, it, expect } from 'vitest';
import { translateQuery, translateFieldPrefix, translateTerms } from './translator.js';
import type { QueryAST, QueryBlock, TermBlock, Filters } from '../../query/types.js';

/**
 * Helper to create a minimal QueryAST for testing
 */
function createQueryAST(blocks: QueryBlock[], filters: Filters = {}, overrides = {}): QueryAST {
  return {
    name: 'test-query',
    blocks,
    filters,
    overrides,
  };
}

function createBlock(
  field: QueryBlock['field'],
  terms: TermBlock,
  operator: QueryBlock['operator'] = 'OR'
): QueryBlock {
  return { field, terms, operator };
}

describe('translateFieldPrefix', () => {
  it('should map title to ti:', () => {
    expect(translateFieldPrefix('title')).toBe('ti:');
  });

  it('should map abstract to abs:', () => {
    expect(translateFieldPrefix('abstract')).toBe('abs:');
  });

  it('should map author to au:', () => {
    expect(translateFieldPrefix('author')).toBe('au:');
  });

  it('should map all to all:', () => {
    expect(translateFieldPrefix('all')).toBe('all:');
  });

  it('should return null for title_abstract (requires expansion)', () => {
    expect(translateFieldPrefix('title_abstract')).toBeNull();
  });

  it('should return null for keyword (not supported by arXiv)', () => {
    expect(translateFieldPrefix('keyword')).toBeNull();
  });
});

describe('translateTerms', () => {
  it('should translate single keyword', () => {
    const result = translateTerms('ti:', ['diabetes'], 'OR');
    expect(result).toBe('ti:diabetes');
  });

  it('should translate multiple keywords with OR', () => {
    const result = translateTerms('ti:', ['diabetes', 'insulin'], 'OR');
    expect(result).toBe('(ti:diabetes OR ti:insulin)');
  });

  it('should translate multiple keywords with AND', () => {
    const result = translateTerms('ti:', ['diabetes', 'insulin'], 'AND');
    expect(result).toBe('(ti:diabetes AND ti:insulin)');
  });

  it('should wrap phrases in quotes', () => {
    const result = translateTerms('ti:', ['machine learning'], 'OR');
    expect(result).toBe('ti:"machine learning"');
  });

  it('should handle mixed phrases and single words', () => {
    const result = translateTerms('ti:', ['diabetes', 'machine learning'], 'OR');
    expect(result).toBe('(ti:diabetes OR ti:"machine learning")');
  });

  it('should handle empty keywords', () => {
    const result = translateTerms('ti:', [], 'OR');
    expect(result).toBe('');
  });
});

describe('translateQuery', () => {
  describe('field mappings', () => {
    it('should translate title field', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['diabetes'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('ti:diabetes');
      expect(result.provider).toBe('arxiv');
    });

    it('should translate abstract field', () => {
      const ast = createQueryAST([createBlock('abstract', { keywords: ['machine learning'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('abs:"machine learning"');
    });

    it('should translate author field', () => {
      const ast = createQueryAST([createBlock('author', { keywords: ['Smith'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('au:Smith');
    });

    it('should translate all field', () => {
      const ast = createQueryAST([createBlock('all', { keywords: ['quantum'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('all:quantum');
    });
  });

  describe('title_abstract expansion', () => {
    it('should expand title_abstract to (ti: OR abs:)', () => {
      const ast = createQueryAST([createBlock('title_abstract', { keywords: ['diabetes'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('(ti:diabetes OR abs:diabetes)');
    });

    it('should expand title_abstract with multiple terms', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', { keywords: ['diabetes', 'insulin'] }),
      ]);
      const result = translateQuery(ast);
      // Each keyword expanded: (ti:diabetes OR abs:diabetes) OR (ti:insulin OR abs:insulin)
      expect(result.native).toBe(
        '((ti:diabetes OR abs:diabetes) OR (ti:insulin OR abs:insulin))'
      );
    });

    it('should expand title_abstract with AND operator', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', { keywords: ['diabetes', 'insulin'] }, 'AND'),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe(
        '((ti:diabetes OR abs:diabetes) AND (ti:insulin OR abs:insulin))'
      );
    });
  });

  describe('boolean operators', () => {
    it('should combine multiple blocks with AND', () => {
      const ast = createQueryAST([
        createBlock('title', { keywords: ['diabetes'] }),
        createBlock('title', { keywords: ['AI'] }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('(ti:diabetes) AND (ti:AI)');
    });

    it('should use ANDNOT for negation (when implemented via filters)', () => {
      // Note: ANDNOT is arXiv-specific, used instead of NOT
      const ast = createQueryAST([createBlock('title', { keywords: ['diabetes'] })]);
      const result = translateQuery(ast);
      expect(result.native).not.toContain(' NOT ');
    });
  });

  describe('phrase handling', () => {
    it('should quote multi-word terms', () => {
      const ast = createQueryAST([
        createBlock('title', { keywords: ['machine learning', 'deep learning'] }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('(ti:"machine learning" OR ti:"deep learning")');
    });

    it('should not quote single-word terms', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['diabetes'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('ti:diabetes');
    });
  });

  describe('category filter', () => {
    it('should translate arxiv categories from overrides', () => {
      const ast = createQueryAST(
        [createBlock('title', { keywords: ['quantum'] })],
        {},
        { arxiv: { categories: ['cs.AI'] } }
      );
      const result = translateQuery(ast);
      expect(result.native).toContain('cat:cs.AI');
    });

    it('should combine multiple categories with OR', () => {
      const ast = createQueryAST(
        [createBlock('title', { keywords: ['quantum'] })],
        {},
        { arxiv: { categories: ['cs.AI', 'cs.LG'] } }
      );
      const result = translateQuery(ast);
      expect(result.native).toContain('(cat:cs.AI OR cat:cs.LG)');
    });

    it('should AND categories with main query', () => {
      const ast = createQueryAST(
        [createBlock('title', { keywords: ['quantum'] })],
        {},
        { arxiv: { categories: ['cs.AI'] } }
      );
      const result = translateQuery(ast);
      expect(result.native).toBe('ti:quantum AND (cat:cs.AI)');
    });
  });

  describe('date filter', () => {
    it('should translate year range to submittedDate', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['quantum'] })], {
        yearFrom: 2020,
        yearTo: 2024,
      });
      const result = translateQuery(ast);
      expect(result.native).toContain('submittedDate:[202001010000 TO 202412312359]');
    });

    it('should handle yearFrom only', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['quantum'] })], {
        yearFrom: 2020,
      });
      const result = translateQuery(ast);
      // End year is dynamically set to current year + 1
      const expectedEndYear = new Date().getFullYear() + 1;
      expect(result.native).toContain(`submittedDate:[202001010000 TO ${expectedEndYear}12312359]`);
    });

    it('should handle yearTo only', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['quantum'] })], {
        yearTo: 2024,
      });
      const result = translateQuery(ast);
      // Start year defaults to 1991 (arXiv founding year)
      expect(result.native).toContain('submittedDate:[199101010000 TO 202412312359]');
    });

    it('should AND date filter with main query', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['quantum'] })], {
        yearFrom: 2020,
        yearTo: 2024,
      });
      const result = translateQuery(ast);
      expect(result.native).toBe(
        'ti:quantum AND (submittedDate:[202001010000 TO 202412312359])'
      );
    });
  });

  describe('keywords-undefined blocks', () => {
    it('should produce empty query for mesh-only block (arXiv ignores mesh)', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', { mesh: ['Artificial Intelligence'] }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('');
    });

    it('should still work when keywords is undefined but has no arXiv-relevant terms', () => {
      const ast = createQueryAST([
        createBlock('title', { mesh: ['Diabetes Mellitus'] }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('');
    });
  });

  describe('keyword field (unsupported)', () => {
    it('should skip keyword field (not supported by arXiv)', () => {
      const ast = createQueryAST([createBlock('keyword', { keywords: ['diabetes'] })]);
      const result = translateQuery(ast);
      expect(result.native).toBe('');
    });
  });

  describe('MeSH and Emtree terms (unsupported)', () => {
    it('should ignore mesh terms', () => {
      const ast = createQueryAST([
        createBlock('title', { keywords: ['diabetes'], mesh: ['Diabetes Mellitus'] }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('ti:diabetes');
      expect(result.native).not.toContain('Diabetes Mellitus');
    });

    it('should ignore emtree terms', () => {
      const ast = createQueryAST([
        createBlock('title', {
          keywords: ['diabetes'],
          emtree: ['non insulin dependent diabetes mellitus'],
        }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toBe('ti:diabetes');
    });
  });

  describe('originalAst reference', () => {
    it('should include original AST in result', () => {
      const ast = createQueryAST([createBlock('title', { keywords: ['test'] })]);
      const result = translateQuery(ast);
      expect(result.originalAst).toBe(ast);
    });
  });

  describe('exclude term translation', () => {
    it('should translate single exclude term with ANDNOT', () => {
      const ast = createQueryAST([
        createBlock('title', {
          keywords: ['EPA', 'entrustable professional activities'],
          exclude: ['environmental protection'],
        }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toContain('ti:EPA OR ti:"entrustable professional activities"');
      expect(result.native).toContain('ANDNOT ti:"environmental protection"');
    });

    it('should translate multiple exclude terms with OR in ANDNOT clause', () => {
      const ast = createQueryAST([
        createBlock('title', {
          keywords: ['EPA'],
          exclude: ['pollution', 'agency'],
        }),
      ]);
      const result = translateQuery(ast);
      expect(result.native).toContain('ANDNOT (ti:pollution OR ti:agency)');
    });

    it('should translate exclude terms with title_abstract field', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', {
          keywords: ['diabetes'],
          exclude: ['animal'],
        }),
      ]);
      const result = translateQuery(ast);
      // title_abstract expands to ti and abs
      expect(result.native).toContain('ti:diabetes OR abs:diabetes');
      expect(result.native).toContain('ANDNOT ((ti:animal OR abs:animal))');
    });

    it('should combine exclude with date filters', () => {
      const ast = createQueryAST(
        [
          createBlock('title', {
            keywords: ['quantum'],
            exclude: ['classical'],
          }),
        ],
        { yearFrom: 2020, yearTo: 2024 }
      );
      const result = translateQuery(ast);
      expect(result.native).toContain('ti:quantum');
      expect(result.native).toContain('ANDNOT ti:classical');
      expect(result.native).toContain('submittedDate:');
    });

    it('should combine exclude with category filters', () => {
      const ast = createQueryAST(
        [
          createBlock('title', {
            keywords: ['machine learning'],
            exclude: ['survey'],
          }),
        ],
        {},
        { arxiv: { categories: ['cs.AI'] } }
      );
      const result = translateQuery(ast);
      expect(result.native).toContain('ti:"machine learning"');
      expect(result.native).toContain('ANDNOT ti:survey');
      expect(result.native).toContain('cat:cs.AI');
    });
  });

  describe('Unsupported Vocabulary Warnings', () => {
    it('should warn (skipped) when block contains only mesh terms', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { mesh: ['Artificial Intelligence'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.warnings).toContainEqual(
        'arXiv: block 1 skipped (contains only MeSH terms, not supported)'
      );
    });

    it('should warn (ignored) when block contains keywords + mesh', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['diabetes'], mesh: ['Diabetes Mellitus'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.warnings).toContainEqual(
        'arXiv: MeSH terms in block 1 ignored (not supported) — keywords still searched'
      );
    });

    it('should not include warnings for keywords-only blocks', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.warnings).toBeUndefined();
    });
  });
});
