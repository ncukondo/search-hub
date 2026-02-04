/**
 * Tests for ERIC query translator.
 */

import { describe, it, expect } from 'vitest';
import { translateQuery, translateQueryAST } from './translator';
import type { QueryAST, QueryBlock, Filters } from '../../query/types';

// Helper to create a minimal QueryAST
function createQueryAST(
  blocks: QueryBlock[],
  filters: Partial<Filters> = {}
): QueryAST {
  return {
    name: 'test-query',
    blocks,
    filters: {
      ...filters,
    },
    overrides: {},
  };
}

// Helper to create a QueryBlock
function createBlock(
  field: QueryBlock['field'],
  keywords: string[],
  operator: QueryBlock['operator'] = 'OR'
): QueryBlock {
  return {
    field,
    terms: { keywords },
    operator,
  };
}

describe('ERIC Query Translator', () => {
  describe('Field Mapping', () => {
    it('should map title field to title:', () => {
      const ast = createQueryAST([createBlock('title', ['education'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('title:education');
    });

    it('should map abstract field to description:', () => {
      // ERIC uses 'description' field for abstracts
      const ast = createQueryAST([createBlock('abstract', ['learning'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('description:learning');
    });

    it('should map author field to author:', () => {
      const ast = createQueryAST([createBlock('author', ['Smith'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('author:Smith');
    });

    it('should map keyword field to subject:', () => {
      // ERIC uses "subject:" for descriptors (controlled vocabulary)
      const ast = createQueryAST([createBlock('keyword', ['special education'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('subject:"special education"');
    });

    it('should map all field to no prefix', () => {
      const ast = createQueryAST([createBlock('all', ['technology'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('technology');
    });

    it('should expand title_abstract to title OR description', () => {
      // ERIC uses 'description' field for abstracts
      const ast = createQueryAST([createBlock('title_abstract', ['diabetes'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('(title:diabetes OR description:diabetes)');
    });
  });

  describe('Boolean Operators', () => {
    it('should join terms with OR when operator is OR', () => {
      const ast = createQueryAST([createBlock('title', ['education', 'learning'], 'OR')]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('(title:education OR title:learning)');
    });

    it('should join terms with AND when operator is AND', () => {
      const ast = createQueryAST([createBlock('title', ['online', 'learning'], 'AND')]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('(title:online AND title:learning)');
    });

    it('should join multiple blocks with AND', () => {
      const ast = createQueryAST([
        createBlock('title', ['education']),
        createBlock('author', ['Smith']),
      ]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('title:education AND author:Smith');
    });
  });

  describe('Phrase Handling', () => {
    it('should quote multi-word phrases', () => {
      const ast = createQueryAST([createBlock('title', ['special education'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('title:"special education"');
    });

    it('should not quote single words', () => {
      const ast = createQueryAST([createBlock('title', ['technology'])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('title:technology');
    });

    it('should handle mixed single words and phrases', () => {
      const ast = createQueryAST([
        createBlock('title', ['technology', 'higher education'], 'OR'),
      ]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('(title:technology OR title:"higher education")');
    });
  });

  describe('Date Filter Translation', () => {
    it('should translate year_from filter', () => {
      const ast = createQueryAST([createBlock('title', ['education'])], {
        yearFrom: 2020,
      });
      const result = translateQueryAST(ast);
      expect(result.native).toContain('publicationdateyear:[2020 TO *]');
    });

    it('should translate year_to filter', () => {
      const ast = createQueryAST([createBlock('title', ['education'])], {
        yearTo: 2024,
      });
      const result = translateQueryAST(ast);
      expect(result.native).toContain('publicationdateyear:[* TO 2024]');
    });

    it('should translate both year filters', () => {
      const ast = createQueryAST([createBlock('title', ['education'])], {
        yearFrom: 2020,
        yearTo: 2024,
      });
      const result = translateQueryAST(ast);
      expect(result.native).toContain('publicationdateyear:[2020 TO 2024]');
    });
  });

  describe('title_abstract Field Expansion', () => {
    it('should expand title_abstract with OR for multiple terms', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', ['diabetes', 'education'], 'OR'),
      ]);
      const result = translateQueryAST(ast);
      // Should be: ((title:diabetes OR description:diabetes) OR (title:education OR description:education))
      expect(result.native).toContain('title:diabetes');
      expect(result.native).toContain('description:diabetes');
      expect(result.native).toContain('title:education');
      expect(result.native).toContain('description:education');
    });

    it('should expand title_abstract with AND for multiple terms', () => {
      const ast = createQueryAST([
        createBlock('title_abstract', ['diabetes', 'prevention'], 'AND'),
      ]);
      const result = translateQueryAST(ast);
      // Each term expanded to (title:X OR description:X), joined by AND
      expect(result.native).toContain('AND');
    });
  });

  describe('TranslatedQuery Structure', () => {
    it('should return TranslatedQuery with correct provider', () => {
      const ast = createQueryAST([createBlock('title', ['test'])]);
      const result = translateQueryAST(ast);
      expect(result.provider).toBe('eric');
    });

    it('should include original AST reference', () => {
      const ast = createQueryAST([createBlock('title', ['test'])]);
      const result = translateQueryAST(ast);
      expect(result.originalAst).toBe(ast);
    });
  });

  describe('translateQuery (QueryAST wrapper)', () => {
    it('should handle QueryAST input', () => {
      const ast = createQueryAST([createBlock('title', ['education'])]);
      const result = translateQuery(ast);
      expect(result.native).toBe('title:education');
      expect(result.provider).toBe('eric');
    });
  });

  describe('Exclude Term Translation', () => {
    it('should translate single exclude term with NOT', () => {
      const block: QueryBlock = {
        field: 'title',
        terms: {
          keywords: ['EPA', 'entrustable professional activities'],
          exclude: ['environmental protection'],
        },
        operator: 'OR',
      };
      const ast = createQueryAST([block]);
      const result = translateQueryAST(ast);
      expect(result.native).toContain('title:EPA');
      expect(result.native).toContain('NOT title:"environmental protection"');
    });

    it('should translate multiple exclude terms with OR in NOT clause', () => {
      const block: QueryBlock = {
        field: 'title',
        terms: {
          keywords: ['EPA'],
          exclude: ['pollution', 'agency'],
        },
        operator: 'OR',
      };
      const ast = createQueryAST([block]);
      const result = translateQueryAST(ast);
      expect(result.native).toContain('title:EPA');
      expect(result.native).toContain('NOT (title:pollution OR title:agency)');
    });

    it('should translate exclude terms with title_abstract field', () => {
      const block: QueryBlock = {
        field: 'title_abstract',
        terms: {
          keywords: ['diabetes'],
          exclude: ['animal', 'mice'],
        },
        operator: 'OR',
      };
      const ast = createQueryAST([block]);
      const result = translateQueryAST(ast);
      // title_abstract expands to title and description
      expect(result.native).toContain('title:diabetes');
      expect(result.native).toContain('description:diabetes');
      expect(result.native).toContain('NOT ((title:animal OR description:animal) OR (title:mice OR description:mice))');
    });

    it('should combine exclude with date filters', () => {
      const block: QueryBlock = {
        field: 'title',
        terms: {
          keywords: ['education'],
          exclude: ['online'],
        },
        operator: 'OR',
      };
      const ast = createQueryAST([block], { yearFrom: 2020 });
      const result = translateQueryAST(ast);
      expect(result.native).toContain('title:education');
      expect(result.native).toContain('NOT title:online');
      expect(result.native).toContain('publicationdateyear:[2020 TO *]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty keywords array', () => {
      const ast = createQueryAST([createBlock('title', [])]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('');
    });

    it('should handle empty blocks array', () => {
      const ast = createQueryAST([]);
      const result = translateQueryAST(ast);
      expect(result.native).toBe('');
    });

    it('should escape special characters in terms', () => {
      const ast = createQueryAST([createBlock('title', ['test (example)'])]);
      const result = translateQueryAST(ast);
      // Phrases with special chars should be quoted
      expect(result.native).toContain('"');
    });
  });
});
