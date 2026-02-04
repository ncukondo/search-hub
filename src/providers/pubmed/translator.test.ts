/**
 * Tests for PubMed query translator.
 */

import { describe, it, expect } from 'vitest';
import type { QueryAST, QueryBlock, Filters } from '../../query/types';
import { translateQuery } from './translator';

/**
 * Helper to create a minimal QueryAST for testing.
 */
function createQueryAST(
  blocks: QueryBlock[],
  filters: Filters = {},
  overrides: QueryAST['overrides'] = {}
): QueryAST {
  return {
    name: 'test-query',
    blocks,
    filters,
    overrides,
  };
}

describe('PubMed Query Translator', () => {
  describe('Field Mapping', () => {
    it('should translate title field to [ti]', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[ti])');
      expect(result.provider).toBe('pubmed');
    });

    it('should translate abstract field to [ab]', () => {
      const ast = createQueryAST([
        {
          field: 'abstract',
          terms: { keywords: ['machine learning'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("machine learning"[ab])');
    });

    it('should translate title_abstract field to [tiab]', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['AI'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(AI[tiab])');
    });

    it('should translate author field to [au]', () => {
      const ast = createQueryAST([
        {
          field: 'author',
          terms: { keywords: ['Smith J'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("Smith J"[au])');
    });

    it('should translate keyword field to [mh] for MeSH', () => {
      const ast = createQueryAST([
        {
          field: 'keyword',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[mh])');
    });

    it('should not add qualifier for all field', () => {
      const ast = createQueryAST([
        {
          field: 'all',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[all])');
    });
  });

  describe('MeSH Term Handling', () => {
    it('should translate MeSH terms with [mh] qualifier', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: {
            keywords: [],
            mesh: ['Diabetes Mellitus, Type 2'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("Diabetes Mellitus, Type 2"[mh])');
    });

    it('should combine keywords and MeSH terms with OR', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: {
            keywords: ['diabetes', 'T2DM'],
            mesh: ['Diabetes Mellitus, Type 2'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe(
        '(diabetes[tiab] OR T2DM[tiab] OR "Diabetes Mellitus, Type 2"[mh])'
      );
    });
  });

  describe('Boolean Operators', () => {
    it('should combine terms with OR operator', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['diabetes', 'hyperglycemia'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[tiab] OR hyperglycemia[tiab])');
    });

    it('should combine terms with AND operator', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['diabetes', 'treatment'] },
          operator: 'AND',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[tiab] AND treatment[tiab])');
    });

    it('should AND multiple query blocks together', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
        {
          field: 'title_abstract',
          terms: { keywords: ['AI', 'machine learning'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe(
        '(diabetes[tiab]) AND (AI[tiab] OR "machine learning"[tiab])'
      );
    });
  });

  describe('Phrase Handling', () => {
    it('should quote multi-word terms', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: { keywords: ['type 2 diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("type 2 diabetes"[ti])');
    });

    it('should not quote single-word terms', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('(diabetes[ti])');
    });

    it('should preserve existing quotes in terms', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: { keywords: ['"exact phrase"'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("exact phrase"[ti])');
    });
  });

  describe('Date Filter Translation', () => {
    it('should translate year_from filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        { yearFrom: 2020 }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('2020:3000[dp]');
    });

    it('should translate year_to filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        { yearTo: 2024 }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('1900:2024[dp]');
    });

    it('should translate year range filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        { yearFrom: 2020, yearTo: 2024 }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('2020:2024[dp]');
    });
  });

  describe('Language Filter Translation', () => {
    it('should translate single language filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        { languages: ['en'] }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('english[la]');
    });

    it('should translate multiple language filters with OR', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        { languages: ['en', 'ja'] }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('(english[la] OR japanese[la])');
    });
  });

  describe('Publication Type Filter Translation', () => {
    it('should translate exclude publication type filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        {
          publicationTypes: {
            exclude: ['Review', 'Meta-Analysis'],
          },
        }
      );

      const result = translateQuery(ast);
      // Should use single NOT with grouped OR, not AND NOT
      expect(result.native).toContain('NOT (review[pt] OR meta-analysis[pt])');
      expect(result.native).not.toContain('AND NOT');
    });

    it('should translate single exclude publication type filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        {
          publicationTypes: {
            exclude: ['Comment'],
          },
        }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('NOT comment[pt]');
      expect(result.native).not.toContain('AND NOT');
    });

    it('should translate combined include and exclude publication type filters', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        {
          publicationTypes: {
            include: ['Journal Article'],
            exclude: ['Review', 'Comment'],
          },
        }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('"journal article"[pt]');
      expect(result.native).toContain('NOT (review[pt] OR comment[pt])');
      expect(result.native).not.toContain('AND NOT');
    });

    it('should translate include publication type filter', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        {
          publicationTypes: {
            include: ['Journal Article', 'Clinical Trial'],
          },
        }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain(
        '("journal article"[pt] OR "clinical trial"[pt])'
      );
    });
  });

  describe('Provider Overrides', () => {
    it('should apply PubMed-specific filter overrides', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        {
          yearFrom: 2020,
        },
        {
          pubmed: {
            filters: {
              publicationTypes: {
                exclude: ['Comment', 'Letter'],
              },
            },
          },
        }
      );

      const result = translateQuery(ast);
      expect(result.native).toContain('NOT (comment[pt] OR letter[pt])');
      expect(result.native).not.toContain('AND NOT');
    });
  });

  describe('TranslatedQuery Object', () => {
    it('should return a complete TranslatedQuery object', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: { keywords: ['diabetes'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);

      expect(result).toHaveProperty('native');
      expect(result).toHaveProperty('originalAst');
      expect(result).toHaveProperty('provider');
      expect(result.originalAst).toEqual(ast);
      expect(result.provider).toBe('pubmed');
    });
  });

  describe('Exclude Term Translation', () => {
    it('should translate single exclude term with NOT', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: {
            keywords: ['EPA', 'entrustable professional activities'],
            exclude: ['environmental protection'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toContain('EPA[tiab] OR "entrustable professional activities"[tiab]');
      expect(result.native).toContain('NOT "environmental protection"[tiab]');
    });

    it('should translate multiple exclude terms with OR in NOT clause', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: {
            keywords: ['EPA'],
            exclude: ['environmental protection', 'pollution', 'agency'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toContain('NOT ("environmental protection"[tiab] OR pollution[tiab] OR agency[tiab])');
    });

    it('should translate exclude terms with same field qualifier as keywords', () => {
      const ast = createQueryAST([
        {
          field: 'title',
          terms: {
            keywords: ['diabetes'],
            exclude: ['animal model'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toContain('diabetes[ti]');
      expect(result.native).toContain('NOT "animal model"[ti]');
    });

    it('should combine exclude with mesh terms', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: {
            keywords: ['diabetes'],
            mesh: ['Diabetes Mellitus'],
            exclude: ['mice', 'rats'],
          },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toContain('diabetes[tiab]');
      expect(result.native).toContain('"Diabetes Mellitus"[mh]');
      expect(result.native).toContain('NOT (mice[tiab] OR rats[tiab])');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty keyword list', () => {
      const ast = createQueryAST([
        {
          field: 'title_abstract',
          terms: { keywords: [], mesh: ['Diabetes Mellitus'] },
          operator: 'OR',
        },
      ]);

      const result = translateQuery(ast);
      expect(result.native).toBe('("Diabetes Mellitus"[mh])');
    });

    it('should handle exclude-only query without leading space', () => {
      const ast = createQueryAST(
        [], // no query blocks
        { publicationTypes: { exclude: ['Review'] } }
      );
      const result = translateQuery(ast);
      expect(result.native).toBe('NOT review[pt]');
      expect(result.native).not.toMatch(/^\s/); // no leading whitespace
    });

    it('should handle complex combined query', () => {
      const ast = createQueryAST(
        [
          {
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'type 2 diabetes'],
              mesh: ['Diabetes Mellitus, Type 2'],
            },
            operator: 'OR',
          },
          {
            field: 'title_abstract',
            terms: { keywords: ['artificial intelligence', 'machine learning'] },
            operator: 'OR',
          },
        ],
        {
          yearFrom: 2020,
          yearTo: 2024,
          languages: ['en'],
          publicationTypes: {
            exclude: ['Review'],
          },
        }
      );

      const result = translateQuery(ast);

      // Should contain both query blocks
      expect(result.native).toContain('diabetes[tiab]');
      expect(result.native).toContain('"Diabetes Mellitus, Type 2"[mh]');
      expect(result.native).toContain('"artificial intelligence"[tiab]');

      // Should contain filters
      expect(result.native).toContain('2020:2024[dp]');
      expect(result.native).toContain('english[la]');
      expect(result.native).toContain('NOT review[pt]');
      // Should not use AND NOT
      expect(result.native).not.toContain('AND NOT');
    });
  });
});
