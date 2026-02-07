import { describe, it, expect } from 'vitest';
import {
  basisRank,
  classifyStatus,
  type ArticleEntry,
  type Review,
  type ReviewBasis,
  type ReviewFile,
  type ReviewerRecord,
} from './types.js';

describe('basisRank', () => {
  it('returns 0 for undefined', () => {
    expect(basisRank(undefined)).toBe(0);
  });

  it('title < abstract < fulltext', () => {
    expect(basisRank('title')).toBeLessThan(basisRank('abstract'));
    expect(basisRank('abstract')).toBeLessThan(basisRank('fulltext'));
  });

  it('returns positive numbers for all basis values', () => {
    expect(basisRank('title')).toBeGreaterThan(0);
    expect(basisRank('abstract')).toBeGreaterThan(0);
    expect(basisRank('fulltext')).toBeGreaterThan(0);
  });
});

describe('classifyStatus', () => {
  const baseEntry: Omit<ArticleEntry, 'reviews' | 'finalDecision'> = {
    title: 'Test Article',
    doi: '10.1234/test',
  };

  it('returns "finalized" when finalDecision is set', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'human:tanaka',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
      finalDecision: 'include',
    };
    expect(classifyStatus(entry)).toBe('finalized');
  });

  it('returns "pending" when reviews array is empty', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [],
    };
    expect(classifyStatus(entry)).toBe('pending');
  });

  it('returns "incomplete" when registered reviewer has not reviewed', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('incomplete');
  });

  it('returns "uncertain" when all reviewers reviewed and at least one is uncertain (no include/exclude conflict)', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'uncertain',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'uncertain',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('uncertain');
  });

  it('returns "agreed-include" when all reviewers agree include', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'include',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('agreed-include');
  });

  it('returns "agreed-exclude" when all reviewers agree exclude', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'exclude',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'exclude',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('agreed-exclude');
  });

  it('returns "conflicting" when both include and exclude present', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'exclude',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('conflicting');
  });

  it('uncertain takes priority when both uncertain and a single include exist (not conflicting)', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'uncertain',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('uncertain');
  });

  it('uncertain takes priority when both uncertain and a single exclude exist (not conflicting)', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'exclude',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'ai:gpt-4o',
          decision: 'uncertain',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    const reviewers: ReviewerRecord[] = [
      { name: 'ai:claude', basis: 'title' },
      { name: 'ai:gpt-4o', basis: 'title' },
    ];
    expect(classifyStatus(entry, reviewers)).toBe('uncertain');
  });

  it('empty reviewer registry → skip incomplete check (backward-compatible)', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    // No reviewers passed (backward-compatible)
    expect(classifyStatus(entry)).toBe('agreed-include');
  });

  it('no registeredReviewers parameter → skip incomplete check', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry, undefined)).toBe('agreed-include');
  });

  it('empty registeredReviewers array → skip incomplete check', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'ai:claude',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry, [])).toBe('agreed-include');
  });

  it('finalized takes precedence over conflicting reviews', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'gpt-4o',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'claude-sonnet',
          decision: 'exclude',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
      finalDecision: 'include',
    };
    expect(classifyStatus(entry)).toBe('finalized');
  });

  it('returns "pending" when all reviews lack a decision', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'human:tanaka',
          // no decision
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'human:suzuki',
          // no decision
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('pending');
  });

  it('ignores reviews without decision when classifying', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'gpt-4o',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          reviewer: 'human:tanaka',
          // no decision
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('agreed-include');
  });

  it('single reviewer with include decision and no registry → agreed-include', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'gpt-4o',
          decision: 'include',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('agreed-include');
  });

  it('single reviewer with exclude decision and no registry → agreed-exclude', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'gpt-4o',
          decision: 'exclude',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('agreed-exclude');
  });

  it('single reviewer with uncertain decision and no registry → uncertain', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [
        {
          reviewer: 'gpt-4o',
          decision: 'uncertain',
          timestamp: '2024-01-15T10:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('uncertain');
  });
});

describe('ReviewerRecord and ReviewFile.reviewers', () => {
  it('ReviewerRecord has name and basis fields', () => {
    const record: ReviewerRecord = {
      name: 'alice',
      basis: 'title',
    };
    expect(record.name).toBe('alice');
    expect(record.basis).toBe('title');
  });

  it('ReviewFile accepts a reviewers array', () => {
    const file: ReviewFile = {
      sessionId: 'test-session',
      articles: [],
      reviewers: [
        { name: 'alice', basis: 'title' },
        { name: 'bob', basis: 'abstract' },
      ],
    };
    expect(file.reviewers).toHaveLength(2);
    expect(file.reviewers![0]).toEqual({ name: 'alice', basis: 'title' });
  });

  it('ReviewFile works without reviewers (optional)', () => {
    const file: ReviewFile = {
      sessionId: 'test-session',
      articles: [],
    };
    expect(file.reviewers).toBeUndefined();
  });
});

describe('Review type with basis field', () => {
  it('accepts review with basis field', () => {
    const review: Review = {
      reviewer: 'ai:claude',
      decision: 'include',
      basis: 'title',
      timestamp: '2024-01-15T10:00:00Z',
    };
    expect(review.basis).toBe('title');
  });

  it('accepts all valid basis values', () => {
    const bases: ReviewBasis[] = ['title', 'abstract', 'fulltext'];
    bases.forEach((basis) => {
      const review: Review = {
        reviewer: 'ai:claude',
        decision: 'include',
        basis,
      };
      expect(review.basis).toBe(basis);
    });
  });

  it('allows review without basis (optional)', () => {
    const review: Review = {
      reviewer: 'ai:claude',
      decision: 'include',
    };
    expect(review.basis).toBeUndefined();
  });
});
