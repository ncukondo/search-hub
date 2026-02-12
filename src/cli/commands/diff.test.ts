import { describe, it, expect } from 'vitest';
import { computeDiff, formatDiff, formatDiffJson, computeQueryDiff, formatQueryDiff, type DiffResult, type QueryDiff } from './diff.js';
import type { Article } from '../../providers/base/types.js';
import type { QueryAST, QueryBlock } from '../../query/types.js';

const makeArticle = (overrides: Partial<Article> & Pick<Article, 'title' | 'source'>): Article => ({
  authors: [{ family: 'Test', given: 'Author' }],
  retrievedAt: '2024-01-15T10:00:00Z',
  ...overrides,
});

describe('computeDiff', () => {
  it('should identify added articles (in session2 but not session1)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.doi).toBe('10.1234/a2');
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(1);
  });

  it('should identify removed articles (in session1 but not session2)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.doi).toBe('10.1234/a2');
    expect(result.common).toHaveLength(1);
  });

  it('should identify common articles', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'eric' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'eric' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should match by DOI (case-insensitive)', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/ABC', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/abc', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should match by PMID', () => {
    const session1: Article[] = [
      makeArticle({ pmid: '12345678', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ pmid: '12345678', title: 'Article A v2', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by arXiv ID', () => {
    const session1: Article[] = [
      makeArticle({ arxivId: '2401.12345', title: 'Article A', source: 'arxiv' }),
    ];
    const session2: Article[] = [
      makeArticle({ arxivId: '2401.12345', title: 'Article A', source: 'arxiv' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by Scopus ID', () => {
    const session1: Article[] = [
      makeArticle({ scopusId: 'SCOPUS-001', title: 'Article A', source: 'scopus' }),
    ];
    const session2: Article[] = [
      makeArticle({ scopusId: 'SCOPUS-001', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match by ERIC ID', () => {
    const session1: Article[] = [
      makeArticle({ ericId: 'ED123456', title: 'Article A', source: 'eric' }),
    ];
    const session2: Article[] = [
      makeArticle({ ericId: 'ED123456', title: 'Article A', source: 'eric' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should match if articles share any identifier', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', pmid: '11111', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ pmid: '11111', title: 'Article A', source: 'scopus' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(1);
  });

  it('should handle empty session1', () => {
    const session1: Article[] = [];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(0);
  });

  it('should handle empty session2', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [];

    const result = computeDiff(session1, session2);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(1);
    expect(result.common).toHaveLength(0);
  });

  it('should handle both sessions empty', () => {
    const result = computeDiff([], []);

    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.common).toHaveLength(0);
  });

  it('should handle full overlap', () => {
    const articles: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(articles, articles);

    expect(result.common).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('should handle no overlap', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.common).toHaveLength(0);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
  });

  it('should handle articles without identifiers', () => {
    const session1: Article[] = [
      makeArticle({ title: 'No ID Article', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ title: 'No ID Article', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    // Articles without IDs cannot be matched, so they appear as removed + added
    expect(result.removed).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.common).toHaveLength(0);
  });

  it('should return correct session1Count and session2Count', () => {
    const session1: Article[] = [
      makeArticle({ doi: '10.1234/a1', title: 'Article A', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a3', title: 'Article C', source: 'pubmed' }),
    ];
    const session2: Article[] = [
      makeArticle({ doi: '10.1234/a2', title: 'Article B', source: 'pubmed' }),
      makeArticle({ doi: '10.1234/a4', title: 'Article D', source: 'pubmed' }),
    ];

    const result = computeDiff(session1, session2);

    expect(result.session1Count).toBe(3);
    expect(result.session2Count).toBe(2);
    expect(result.common).toHaveLength(1);
    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(2);
  });
});

// Sample diff result for formatting tests
const sampleDiff: DiffResult = {
  session1Count: 5,
  session2Count: 4,
  added: [
    makeArticle({ doi: '10.1234/new1', title: 'Newly Added Article', source: 'pubmed', publicationDate: '2026-01-15' }),
    makeArticle({ doi: '10.1234/new2', title: 'Another New Article', source: 'eric', publicationDate: '2025-06-01' }),
  ],
  removed: [
    makeArticle({ doi: '10.1234/old1', title: 'Removed Article One', source: 'pubmed', publicationDate: '2024-03-20' }),
    makeArticle({ doi: '10.1234/old2', title: 'Removed Article Two', source: 'arxiv', publicationDate: '2023-11-05' }),
    makeArticle({ doi: '10.1234/old3', title: 'Removed Article Three', source: 'scopus' }),
  ],
  common: [
    makeArticle({ doi: '10.1234/c1', title: 'Common Article One', source: 'pubmed', publicationDate: '2024-06-01' }),
    makeArticle({ doi: '10.1234/c2', title: 'Common Article Two', source: 'eric', publicationDate: '2025-01-10' }),
  ],
};

describe('formatDiff', () => {
  it('should include header with session IDs', () => {
    const output = formatDiff(sampleDiff, 'session-v1', 'session-v2');

    expect(output).toContain('session-v1');
    expect(output).toContain('session-v2');
  });

  it('should show article counts in summary', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('5 articles');
    expect(output).toContain('4 articles');
    expect(output).toContain('Common:');
    expect(output).toContain('Added:');
    expect(output).toContain('Removed:');
  });

  it('should list added articles with + prefix', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('+ ');
    expect(output).toContain('Newly Added Article');
    expect(output).toContain('Another New Article');
  });

  it('should list removed articles with - prefix', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('- ');
    expect(output).toContain('Removed Article One');
  });

  it('should include year when available', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('[2026]');
    expect(output).toContain('[2025]');
  });

  it('should handle empty diff', () => {
    const emptyDiff: DiffResult = {
      session1Count: 0,
      session2Count: 0,
      added: [],
      removed: [],
      common: [],
    };

    const output = formatDiff(emptyDiff, 'v1', 'v2');

    expect(output).toContain('0 articles');
  });

  it('should handle no added articles', () => {
    const diff: DiffResult = {
      ...sampleDiff,
      added: [],
      session2Count: 2,
    };

    const output = formatDiff(diff, 'v1', 'v2');

    expect(output).not.toMatch(/Added \(\+\d+\):/);
  });

  it('should handle no removed articles', () => {
    const diff: DiffResult = {
      ...sampleDiff,
      removed: [],
      session1Count: 2,
    };

    const output = formatDiff(diff, 'v1', 'v2');

    expect(output).not.toMatch(/Removed \(-\d+\):/);
  });
});

describe('formatDiff with --show filter', () => {
  it('should show only added articles when show=added', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'added');

    expect(output).toContain('Newly Added Article');
    expect(output).not.toContain('Removed Article One');
    expect(output).not.toContain('Common Article One');
  });

  it('should show only removed articles when show=removed', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'removed');

    expect(output).toContain('Removed Article One');
    expect(output).not.toContain('Newly Added Article');
    expect(output).not.toContain('Common Article One');
  });

  it('should show only common articles when show=common', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', 'common');

    expect(output).toContain('Common Article One');
    expect(output).not.toContain('Newly Added Article');
    expect(output).not.toContain('Removed Article One');
  });

  it('should show all sections when no filter', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).toContain('Newly Added Article');
    expect(output).toContain('Removed Article One');
    // Common articles appear in the summary count
    expect(output).toContain('2 articles');
  });
});

describe('formatDiffJson', () => {
  it('should return valid JSON', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed).toBeDefined();
  });

  it('should include session IDs', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.session1).toBe('v1');
    expect(parsed.session2).toBe('v2');
  });

  it('should include summary counts', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.summary.session1Count).toBe(5);
    expect(parsed.summary.session2Count).toBe(4);
    expect(parsed.summary.commonCount).toBe(2);
    expect(parsed.summary.addedCount).toBe(2);
    expect(parsed.summary.removedCount).toBe(3);
  });

  it('should include article arrays', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.added).toHaveLength(2);
    expect(parsed.removed).toHaveLength(3);
    expect(parsed.common).toHaveLength(2);
  });

  it('should respect show filter', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2', 'added');
    const parsed = JSON.parse(output);

    expect(parsed.added).toHaveLength(2);
    expect(parsed.removed).toBeUndefined();
    expect(parsed.common).toBeUndefined();
  });
});

// Helper to create minimal QueryAST
const createQueryAST = (overrides: Partial<QueryAST> & { blocks?: QueryBlock[] } = {}): QueryAST => ({
  name: 'test-query',
  blocks: [],
  filters: {},
  providers: {},
  ...overrides,
});

// Helper to create QueryBlock
const createBlock = (
  field: QueryBlock['field'],
  keywords: string[],
  options: { id?: string; mesh?: string[]; emtree?: string[]; exclude?: string[] } = {}
): QueryBlock => ({
  id: options.id ?? 'block-1',
  field,
  terms: {
    keywords,
    ...(options.mesh && { mesh: options.mesh }),
    ...(options.emtree && { emtree: options.emtree }),
    ...(options.exclude && { exclude: options.exclude }),
  },
  operator: 'OR',
});

describe('computeQueryDiff', () => {
  it('should detect added keywords in a block', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI'])],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI', 'machine learning'])],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.added).toContain('machine learning');
    expect(result.blocks[0]!.removed).toHaveLength(0);
  });

  it('should detect removed keywords in a block', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI', 'deep learning'])],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI'])],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.removed).toContain('deep learning');
    expect(result.blocks[0]!.added).toHaveLength(0);
  });

  it('should detect no changes in a block', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI'])],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes', 'AI'])],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.added).toHaveLength(0);
    expect(result.blocks[0]!.removed).toHaveLength(0);
    expect(result.blocks[0]!.hasChanges).toBe(false);
  });

  it('should detect MeSH term changes', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'], { mesh: ['Diabetes Mellitus'] })],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'], { mesh: ['Diabetes Mellitus', 'Insulin'] })],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.meshAdded).toContain('Insulin');
    expect(result.blocks[0]!.meshRemoved).toHaveLength(0);
  });

  it('should detect Emtree term changes', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'], { emtree: ['diabetes mellitus'] })],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'], { emtree: [] })],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.emtreeRemoved).toContain('diabetes mellitus');
  });

  it('should handle different number of blocks (added block)', () => {
    const query1 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'])],
    });
    const query2 = createQueryAST({
      blocks: [
        createBlock('title_abstract', ['diabetes']),
        createBlock('title_abstract', ['AI', 'machine learning']),
      ],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1]!.isNew).toBe(true);
    expect(result.blocks[1]!.added).toContain('AI');
    expect(result.blocks[1]!.added).toContain('machine learning');
  });

  it('should handle different number of blocks (removed block)', () => {
    const query1 = createQueryAST({
      blocks: [
        createBlock('title_abstract', ['diabetes']),
        createBlock('title_abstract', ['AI', 'machine learning']),
      ],
    });
    const query2 = createQueryAST({
      blocks: [createBlock('title_abstract', ['diabetes'])],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1]!.isRemoved).toBe(true);
    expect(result.blocks[1]!.removed).toContain('AI');
    expect(result.blocks[1]!.removed).toContain('machine learning');
  });

  it('should detect year filter changes', () => {
    const query1 = createQueryAST({
      blocks: [],
      filters: { yearFrom: 2020, yearTo: 2024 },
    });
    const query2 = createQueryAST({
      blocks: [],
      filters: { yearFrom: 2021, yearTo: 2024 },
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.filters.yearFromChanged).toBe(true);
    expect(result.filters.oldYearFrom).toBe(2020);
    expect(result.filters.newYearFrom).toBe(2021);
    expect(result.filters.yearToChanged).toBe(false);
  });

  it('should detect language filter changes', () => {
    const query1 = createQueryAST({
      blocks: [],
      filters: { languages: ['en'] },
    });
    const query2 = createQueryAST({
      blocks: [],
      filters: { languages: ['en', 'ja'] },
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.filters.languagesAdded).toContain('ja');
    expect(result.filters.languagesRemoved).toHaveLength(0);
  });

  it('should handle multiple blocks with mixed changes', () => {
    const query1 = createQueryAST({
      blocks: [
        createBlock('title_abstract', ['term1', 'term2']),
        createBlock('title_abstract', ['AI']),
        createBlock('keyword', ['keyword1']),
      ],
    });
    const query2 = createQueryAST({
      blocks: [
        createBlock('title_abstract', ['term1', 'term2']), // no change
        createBlock('title_abstract', ['AI', 'ML']), // added 'ML'
        createBlock('keyword', ['keyword2']), // replaced keyword1 with keyword2
      ],
    });

    const result = computeQueryDiff(query1, query2);

    expect(result.blocks).toHaveLength(3);
    expect(result.blocks[0]!.hasChanges).toBe(false);
    expect(result.blocks[1]!.added).toContain('ML');
    expect(result.blocks[2]!.added).toContain('keyword2');
    expect(result.blocks[2]!.removed).toContain('keyword1');
  });
});

describe('formatQueryDiff', () => {
  it('should format block with no changes', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: [],
          removed: [],
          hasChanges: false,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('Block 1');
    expect(output).toContain('no changes');
  });

  it('should format added keywords with + prefix', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: ['OSCE', 'clinical examination'],
          removed: [],
          hasChanges: true,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('+ OSCE');
    expect(output).toContain('+ clinical examination');
  });

  it('should format removed keywords with - prefix', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: [],
          removed: ['old term'],
          hasChanges: true,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('- old term');
  });

  it('should format MeSH changes', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: [],
          removed: [],
          meshAdded: ['Insulin'],
          meshRemoved: [],
          hasChanges: true,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('+ [MeSH] Insulin');
  });

  it('should format year filter changes', () => {
    const queryDiff: QueryDiff = {
      blocks: [],
      filters: {
        yearFromChanged: true,
        oldYearFrom: 2020,
        newYearFrom: 2021,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('Filters');
    expect(output).toContain('yearFrom');
    expect(output).toContain('2020');
    expect(output).toContain('2021');
  });

  it('should format language filter changes', () => {
    const queryDiff: QueryDiff = {
      blocks: [],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: ['ja'],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('languages');
    expect(output).toContain('+ ja');
  });

  it('should format new block', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: ['new term'],
          removed: [],
          hasChanges: true,
          isNew: true,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('(new block)');
  });

  it('should format removed block', () => {
    const queryDiff: QueryDiff = {
      blocks: [
        {
          index: 0,
          field: 'title_abstract',
          added: [],
          removed: ['removed term'],
          hasChanges: true,
          isRemoved: true,
        },
      ],
      filters: {
        yearFromChanged: false,
        yearToChanged: false,
        languagesAdded: [],
        languagesRemoved: [],
      },
    };

    const output = formatQueryDiff(queryDiff);

    expect(output).toContain('(removed block)');
  });
});

describe('formatDiffWithQuery', () => {
  const sampleDiff: DiffResult = {
    session1Count: 5,
    session2Count: 4,
    added: [],
    removed: [],
    common: [],
  };

  const sampleQueryDiff: QueryDiff = {
    blocks: [
      {
        index: 0,
        field: 'title_abstract',
        added: ['new term'],
        removed: [],
        hasChanges: true,
      },
    ],
    filters: {
      yearFromChanged: false,
      yearToChanged: false,
      languagesAdded: [],
      languagesRemoved: [],
    },
  };

  it('should include Query changes section when queryDiff provided', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', undefined, { queryDiff: sampleQueryDiff });

    expect(output).toContain('Query changes:');
    expect(output).toContain('+ new term');
    expect(output).toContain('Result changes:');
  });

  it('should not include Query changes section when queryDiff not provided', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2');

    expect(output).not.toContain('Query changes:');
    expect(output).not.toContain('Result changes:');
  });

  it('should respect noQueryDiff option', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', undefined, {
      queryDiff: sampleQueryDiff,
      noQueryDiff: true,
    });

    expect(output).not.toContain('Query changes:');
  });

  it('should show "(query data not available)" when queries are missing', () => {
    const output = formatDiff(sampleDiff, 'v1', 'v2', undefined, {
      queryDiff: undefined,
      showQueryDiffPlaceholder: true,
    });

    expect(output).toContain('Query changes: (query data not available)');
  });
});

describe('formatDiffJson with queryDiff', () => {
  const sampleDiff: DiffResult = {
    session1Count: 5,
    session2Count: 4,
    added: [],
    removed: [],
    common: [],
  };

  const sampleQueryDiff: QueryDiff = {
    blocks: [
      {
        index: 0,
        field: 'title_abstract',
        added: ['new term'],
        removed: [],
        hasChanges: true,
      },
    ],
    filters: {
      yearFromChanged: false,
      yearToChanged: false,
      languagesAdded: [],
      languagesRemoved: [],
    },
  };

  it('should include queryDiff in JSON output when provided', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2', undefined, { queryDiff: sampleQueryDiff });
    const parsed = JSON.parse(output);

    expect(parsed.queryDiff).toBeDefined();
    expect(parsed.queryDiff.blocks).toHaveLength(1);
    expect(parsed.queryDiff.blocks[0].added).toContain('new term');
  });

  it('should not include queryDiff in JSON output when not provided', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2');
    const parsed = JSON.parse(output);

    expect(parsed.queryDiff).toBeUndefined();
  });

  it('should respect noQueryDiff option in JSON output', () => {
    const output = formatDiffJson(sampleDiff, 'v1', 'v2', undefined, {
      queryDiff: sampleQueryDiff,
      noQueryDiff: true,
    });
    const parsed = JSON.parse(output);

    expect(parsed.queryDiff).toBeUndefined();
  });
});
