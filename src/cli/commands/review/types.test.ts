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

  describe('basis priority', () => {
    it('same reviewer: title uncertain + abstract include → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:claude', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('same reviewer: title uncertain + abstract exclude → agreed-exclude', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:claude', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-exclude');
    });

    it('same reviewer: title uncertain + fulltext include → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:claude', decision: 'include', basis: 'fulltext' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('different reviewers: A title uncertain + B abstract include → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('different reviewers: A title uncertain + B abstract exclude → agreed-exclude', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-exclude');
    });

    it('two reviewers: both abstract include with earlier title uncertain → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:claude', decision: 'include', basis: 'abstract' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('A abstract include + B abstract exclude → conflicting (unchanged)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'abstract' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('conflicting');
    });

    it('A title include + B abstract exclude → agreed-exclude (higher basis overrides all lower)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-exclude');
    });

    it('all reviews uncertain (no higher-basis definitive) → uncertain (unchanged)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'uncertain', basis: 'title' },
        ],
      };
      expect(classifyStatus(entry)).toBe('uncertain');
    });

    it('only title reviews, no uncertain conflict → existing behavior unchanged', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'title' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    // Cross-reviewer basis priority (Step 3)
    it('A: title uncertain, B: abstract include, C: abstract include → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
          { reviewer: 'ai:gemini', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('A: title uncertain, B: abstract include, C: abstract exclude → conflicting', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
          { reviewer: 'ai:gemini', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('conflicting');
    });

    it('A: title exclude, B: abstract include → agreed-include (higher basis overrides all lower)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'exclude', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('A: abstract uncertain, B: fulltext include → agreed-include', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'uncertain', basis: 'abstract' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'fulltext' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    // Task 92: Higher-basis definitive overrides ALL lower-basis decisions
    it('A title:include + B abstract:exclude → agreed-exclude (higher basis wins)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-exclude');
    });

    it('A title:exclude + B abstract:include → agreed-include (higher basis wins)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'exclude', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'include', basis: 'abstract' },
        ],
      };
      expect(classifyStatus(entry)).toBe('agreed-include');
    });

    it('A title:include + B title:exclude → conflicting (same basis still conflicts)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'title' },
        ],
      };
      expect(classifyStatus(entry)).toBe('conflicting');
    });
  });

  describe('basis-aware incomplete check (Task 92)', () => {
    it('title-only article + abstract reviewer registered → NOT incomplete', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'exclude', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'title' },
        ],
      };
      const reviewers: ReviewerRecord[] = [
        { name: 'ai:claude', basis: 'title' },
        { name: 'ai:gpt-4o', basis: 'title' },
        { name: 'ai:gemini', basis: 'abstract' },
      ];
      // Abstract reviewer registered but article only reviewed at title level
      // → should NOT be incomplete (abstract reviewer hasn't reached this article yet)
      expect(classifyStatus(entry, reviewers)).toBe('agreed-exclude');
    });

    it('two title reviewers exclude + abstract reviewer registered → agreed-exclude', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'exclude', basis: 'title' },
          { reviewer: 'ai:gpt-4o', decision: 'exclude', basis: 'title' },
        ],
      };
      const reviewers: ReviewerRecord[] = [
        { name: 'ai:claude', basis: 'title' },
        { name: 'ai:gpt-4o', basis: 'title' },
        { name: 'ai:gemini', basis: 'abstract' },
      ];
      expect(classifyStatus(entry, reviewers)).toBe('agreed-exclude');
    });

    it('article with abstract review + abstract reviewer not yet reviewed → incomplete (unchanged)', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'abstract' },
        ],
      };
      const reviewers: ReviewerRecord[] = [
        { name: 'ai:claude', basis: 'abstract' },
        { name: 'ai:gpt-4o', basis: 'abstract' },
      ];
      // ai:gpt-4o is registered at abstract basis and article has abstract review
      // → should be incomplete because gpt-4o hasn't reviewed yet
      expect(classifyStatus(entry, reviewers)).toBe('incomplete');
    });

    it('title-only article + fulltext reviewer registered → NOT incomplete', () => {
      const entry: ArticleEntry = {
        ...baseEntry,
        reviews: [
          { reviewer: 'ai:claude', decision: 'include', basis: 'title' },
        ],
      };
      const reviewers: ReviewerRecord[] = [
        { name: 'ai:claude', basis: 'title' },
        { name: 'ai:gpt-4o', basis: 'fulltext' },
      ];
      expect(classifyStatus(entry, reviewers)).toBe('agreed-include');
    });
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
