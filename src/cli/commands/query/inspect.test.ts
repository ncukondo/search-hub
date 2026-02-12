import { describe, it, expect } from 'vitest';
import { inspectQuery, formatInspectOutput } from './inspect.js';
import type { QueryAST } from '../../../query/types.js';
import type { ProviderName } from '../../../providers/base/types.js';

const DEFAULT_PROVIDERS: ProviderName[] = ['pubmed', 'eric', 'arxiv', 'scopus'];

describe('inspectQuery', () => {
  it('should show all defaults when no providers section is configured', () => {
    const ast: QueryAST = {
      name: 'test-query',
      blocks: [
        { id: 'population', field: 'title_abstract', terms: { keywords: ['diabetes'] }, operator: 'OR' },
        { id: 'intervention', field: 'title_abstract', terms: { keywords: ['AI'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {},
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);

    expect(result.name).toBe('test-query');
    expect(result.providers).toEqual(DEFAULT_PROVIDERS);
    expect(result.blocks).toHaveLength(2);

    // All blocks should show "default" for all providers
    for (const block of result.blocks) {
      for (const provider of DEFAULT_PROVIDERS) {
        expect(block.status[provider]).toBe('default');
      }
    }

    // No added filters
    expect(result.addedFilters).toEqual([]);
  });

  it('should show "replaced" when provider has replaces for a block', () => {
    const ast: QueryAST = {
      name: 'test-query',
      blocks: [
        { id: 'population', field: 'title_abstract', terms: { keywords: ['diabetes'] }, operator: 'OR' },
        { id: 'intervention', field: 'title_abstract', terms: { keywords: ['AI'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {
        arxiv: {
          replaces: {
            population: { field: 'all', terms: { keywords: ['diabetes mellitus'] }, operator: 'OR' },
          },
        },
      },
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);

    // population block: arxiv should be "replaced", others "default"
    const popBlock = result.blocks.find((b) => b.id === 'population')!;
    expect(popBlock.status['arxiv']).toBe('replaced');
    expect(popBlock.status['pubmed']).toBe('default');
    expect(popBlock.status['eric']).toBe('default');
    expect(popBlock.status['scopus']).toBe('default');

    // intervention block: all default
    const intBlock = result.blocks.find((b) => b.id === 'intervention')!;
    for (const provider of DEFAULT_PROVIDERS) {
      expect(intBlock.status[provider]).toBe('default');
    }
  });

  it('should show added filters per provider', () => {
    const ast: QueryAST = {
      name: 'test-query',
      blocks: [
        { id: 'block-1', field: 'title_abstract', terms: { keywords: ['test'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {
        pubmed: {
          adds: {
            filters: {
              publicationTypes: { exclude: ['Review'] },
            },
          },
        },
        arxiv: {
          adds: {
            filters: {
              categories: ['cs.AI', 'cs.LG'],
            },
          },
        },
        scopus: {
          adds: {
            filters: {
              sourceTypes: ['journal', 'conference proceeding'],
            },
          },
        },
      },
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);

    expect(result.addedFilters.length).toBeGreaterThan(0);

    // Check publicationTypes row
    const pubTypesRow = result.addedFilters.find((f) => f.filterKey === 'publicationTypes');
    expect(pubTypesRow).toBeDefined();
    expect(pubTypesRow!.values['pubmed']).toBeDefined();
    expect(pubTypesRow!.values['eric']).toBeUndefined();

    // Check categories row
    const categoriesRow = result.addedFilters.find((f) => f.filterKey === 'categories');
    expect(categoriesRow).toBeDefined();
    expect(categoriesRow!.values['arxiv']).toBeDefined();
    expect(categoriesRow!.values['pubmed']).toBeUndefined();

    // Check sourceTypes row
    const sourceTypesRow = result.addedFilters.find((f) => f.filterKey === 'sourceTypes');
    expect(sourceTypesRow).toBeDefined();
    expect(sourceTypesRow!.values['scopus']).toBeDefined();
  });

  it('should handle multiple providers with block replacements', () => {
    const ast: QueryAST = {
      name: 'multi-replace',
      blocks: [
        { id: 'pop', field: 'title_abstract', terms: { keywords: ['A'] }, operator: 'OR' },
        { id: 'int', field: 'title_abstract', terms: { keywords: ['B'] }, operator: 'OR' },
        { id: 'out', field: 'title_abstract', terms: { keywords: ['C'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {
        arxiv: {
          replaces: {
            pop: { field: 'all', terms: { keywords: ['A2'] }, operator: 'OR' },
            int: { field: 'all', terms: { keywords: ['B2'] }, operator: 'OR' },
          },
        },
        eric: {
          replaces: {
            out: { field: 'title_abstract', terms: { keywords: ['C2'] }, operator: 'OR' },
          },
        },
      },
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);

    const popBlock = result.blocks.find((b) => b.id === 'pop')!;
    expect(popBlock.status['arxiv']).toBe('replaced');
    expect(popBlock.status['eric']).toBe('default');

    const intBlock = result.blocks.find((b) => b.id === 'int')!;
    expect(intBlock.status['arxiv']).toBe('replaced');
    expect(intBlock.status['eric']).toBe('default');

    const outBlock = result.blocks.find((b) => b.id === 'out')!;
    expect(outBlock.status['arxiv']).toBe('default');
    expect(outBlock.status['eric']).toBe('replaced');
  });

  it('should only include requested providers', () => {
    const ast: QueryAST = {
      name: 'subset-test',
      blocks: [
        { id: 'block-1', field: 'title_abstract', terms: { keywords: ['x'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {},
    };

    const result = inspectQuery(ast, ['pubmed', 'arxiv']);

    expect(result.providers).toEqual(['pubmed', 'arxiv']);
    expect(result.blocks[0]!.status['pubmed']).toBe('default');
    expect(result.blocks[0]!.status['arxiv']).toBe('default');
    expect(result.blocks[0]!.status['eric']).toBeUndefined();
  });
});

describe('formatInspectOutput', () => {
  it('should format all-default query as aligned table', () => {
    const ast: QueryAST = {
      name: 'format-test',
      blocks: [
        { id: 'population', field: 'title_abstract', terms: { keywords: ['diabetes'] }, operator: 'OR' },
        { id: 'intervention', field: 'title_abstract', terms: { keywords: ['AI'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {},
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);
    const output = formatInspectOutput(result);

    expect(output).toContain('Query: format-test');
    expect(output).toContain('population');
    expect(output).toContain('intervention');
    expect(output).toContain('PubMed');
    expect(output).toContain('ERIC');
    expect(output).toContain('arXiv');
    expect(output).toContain('Scopus');
    expect(output).toContain('default');
    // Should NOT contain filter table when there are no added filters
    expect(output).not.toContain('Added Filters');
  });

  it('should format query with replacements and added filters', () => {
    const ast: QueryAST = {
      name: 'full-format-test',
      blocks: [
        { id: 'population', field: 'title_abstract', terms: { keywords: ['diabetes'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {
        arxiv: {
          replaces: {
            population: { field: 'all', terms: { keywords: ['diabetes mellitus'] }, operator: 'OR' },
          },
          adds: {
            filters: {
              categories: ['cs.AI', 'cs.LG'],
            },
          },
        },
      },
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);
    const output = formatInspectOutput(result);

    expect(output).toContain('replaced');
    expect(output).toContain('Added Filters');
    expect(output).toContain('categories');
    expect(output).toContain('cs.AI');
  });

  it('should use em-dash for providers without added filters in a filter row', () => {
    const ast: QueryAST = {
      name: 'dash-test',
      blocks: [
        { id: 'b1', field: 'title_abstract', terms: { keywords: ['x'] }, operator: 'OR' },
      ],
      filters: {},
      providers: {
        pubmed: {
          adds: {
            filters: {
              publicationTypes: { exclude: ['Review'] },
            },
          },
        },
      },
    };

    const result = inspectQuery(ast, DEFAULT_PROVIDERS);
    const output = formatInspectOutput(result);

    // Other providers should show "—" for the filter row
    expect(output).toContain('\u2014');
  });
});
