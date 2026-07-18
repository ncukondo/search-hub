/**
 * Scopus Query Translator Tests
 */
import { describe, it, expect } from 'vitest';
import { translateQuery } from './translator';
import type { ResolvedAST } from '../../query/types';

describe('Scopus Query Translator', () => {
  describe('Field Mappings', () => {
    it('should translate title field to TITLE()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(diabetes)');
    });

    it('should translate abstract field to ABS()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'abstract',
            terms: { keywords: ['machine learning'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('ABS("machine learning")');
    });

    it('should translate title_abstract field to TITLE-ABS-KEY()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { keywords: ['AI'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE-ABS-KEY(AI)');
    });

    it('should translate author field to AUTH()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'author',
            terms: { keywords: ['Smith'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('AUTH(Smith)');
    });

    it('should translate keyword field to KEY()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'keyword',
            terms: { keywords: ['neural networks'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('KEY("neural networks")');
    });

    it('should translate all field to ALL()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'all',
            terms: { keywords: ['healthcare'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('ALL(healthcare)');
    });
  });

  describe('Boolean Operators', () => {
    it('should combine terms with OR within a block', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['diabetes', 'T2DM'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(diabetes OR T2DM)');
    });

    it('should combine terms with AND within a block', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['machine', 'learning'] },
            operator: 'AND',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(machine AND learning)');
    });

    it('should AND multiple blocks together', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'population',
            field: 'title',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
          {
            id: 'intervention',
            field: 'title',
            terms: { keywords: ['AI'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(diabetes) AND TITLE(AI)');
    });
  });

  describe('Phrase Handling', () => {
    it('should quote phrases with spaces', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['machine learning', 'deep learning'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE("machine learning" OR "deep learning")');
    });

    it('should preserve already quoted terms', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['"artificial intelligence"'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE("artificial intelligence")');
    });
  });

  describe('Year Filters', () => {
    it('should translate year_from filter', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: { yearFrom: 2020 },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND PUBYEAR > 2019');
    });

    it('should translate year_to filter', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: { yearTo: 2024 },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND PUBYEAR < 2025');
    });

    it('should translate both year filters', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: { yearFrom: 2020, yearTo: 2024 },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND PUBYEAR > 2019 AND PUBYEAR < 2025');
    });
  });

  describe('Language Filter', () => {
    it('should translate single language filter', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: { languages: ['en'] },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND LANGUAGE(english)');
    });

    it('should translate multiple languages with OR', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: { languages: ['en', 'de'] },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND LANGUAGE(english OR german)');
    });
  });

  describe('Source Type Filter', () => {
    it('should translate source_types from resolved filters', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: {
          sourceTypes: ['journal', 'conference'],
        },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND SRCTYPE(j OR p)');
    });

    it('should translate single source type', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: {
          sourceTypes: ['journal'],
        },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(test) AND SRCTYPE(j)');
    });
  });

  describe('TranslatedQuery Result', () => {
    it('should return correct provider name', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { keywords: ['test'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.provider).toBe('scopus');
    });
  });

  describe('Exclude Term Translation', () => {
    it('should translate single exclude term with AND NOT', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: {
              keywords: ['EPA', 'entrustable professional activities'],
              exclude: ['environmental protection'],
            },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe(
        'TITLE-ABS-KEY(EPA OR "entrustable professional activities") AND NOT TITLE-ABS-KEY("environmental protection")',
      );
    });

    it('should translate multiple exclude terms with OR in AND NOT clause', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: {
              keywords: ['EPA'],
              exclude: ['environmental protection', 'pollution', 'agency'],
            },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe(
        'TITLE-ABS-KEY(EPA) AND NOT TITLE-ABS-KEY("environmental protection" OR pollution OR agency)',
      );
    });

    it('should translate exclude terms with same field as keywords', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: {
              keywords: ['diabetes'],
              exclude: ['animal model'],
            },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE(diabetes) AND NOT TITLE("animal model")');
    });

    it('should combine exclude with filters', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes'],
              exclude: ['mice', 'rats'],
            },
            operator: 'OR',
          },
        ],
        filters: { yearFrom: 2020, languages: ['en'] },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe(
        'TITLE-ABS-KEY(diabetes) AND NOT TITLE-ABS-KEY(mice OR rats) AND PUBYEAR > 2019 AND LANGUAGE(english)',
      );
    });
  });

  describe('Emtree Term Support', () => {
    it('should translate emtree-only block using INDEXTERMS()', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { emtree: ['Artificial Intelligence'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('INDEXTERMS("Artificial Intelligence")');
    });

    it('should translate multiple emtree terms with OR', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { emtree: ['Diabetes Mellitus', 'Insulin Resistance'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('INDEXTERMS("Diabetes Mellitus" OR "Insulin Resistance")');
    });

    it('should combine keywords and emtree terms with block operator', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: {
              keywords: ['diabetes', 'T2DM'],
              emtree: ['Diabetes Mellitus'],
            },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe(
        'TITLE-ABS-KEY(diabetes OR T2DM) OR INDEXTERMS("Diabetes Mellitus")',
      );
    });

    it('should use INDEXTERMS regardless of block field setting', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title',
            terms: { emtree: ['Neoplasm'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('INDEXTERMS(Neoplasm)');
    });
  });

  describe('Keywords-undefined blocks', () => {
    it('should produce empty native query for mesh-only block (unsupported vocab)', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { mesh: ['Artificial Intelligence'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      // Scopus doesn't use mesh, so the block produces no output
      expect(result.native).toBe('');
    });

    it('should skip unsupported-vocab-only block when combined with keywords block', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { mesh: ['Artificial Intelligence'] },
            operator: 'OR',
          },
          {
            id: 'intervention',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.native).toBe('TITLE-ABS-KEY(diabetes)');
    });
  });

  describe('Unsupported Vocabulary Warnings', () => {
    it('should warn when block contains mesh terms', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'], mesh: ['Diabetes Mellitus'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.warnings).toContainEqual(
        'Scopus: MeSH terms in block 1 ignored (not supported) — keywords still searched',
      );
    });

    it('should not warn when block contains emtree terms (supported)', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { emtree: ['Diabetes Mellitus'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.warnings ?? []).toHaveLength(0);
    });

    it('should not include warnings field when no unsupported vocab', () => {
      const ast: ResolvedAST = {
        name: 'test',
        blocks: [
          {
            id: 'block1',
            field: 'title_abstract',
            terms: { keywords: ['diabetes'] },
            operator: 'OR',
          },
        ],
        filters: {},
      };

      const result = translateQuery(ast);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('Complex Queries', () => {
    it('should handle complex multi-block query', () => {
      const ast: ResolvedAST = {
        name: 'diabetes_ai',
        description: 'AI in diabetes research',
        blocks: [
          {
            id: 'population',
            field: 'title_abstract',
            terms: { keywords: ['diabetes', 'T2DM', 'type 2 diabetes'] },
            operator: 'OR',
          },
          {
            id: 'intervention',
            field: 'title_abstract',
            terms: { keywords: ['machine learning', 'artificial intelligence'] },
            operator: 'OR',
          },
        ],
        filters: {
          yearFrom: 2020,
          yearTo: 2024,
          languages: ['en'],
          sourceTypes: ['journal'],
        },
      };

      const result = translateQuery(ast);
      expect(result.native).toBe(
        'TITLE-ABS-KEY(diabetes OR T2DM OR "type 2 diabetes") AND ' +
          'TITLE-ABS-KEY("machine learning" OR "artificial intelligence") AND ' +
          'PUBYEAR > 2019 AND PUBYEAR < 2025 AND LANGUAGE(english) AND SRCTYPE(j)',
      );
    });
  });
});
