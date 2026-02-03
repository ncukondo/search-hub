import { describe, it, expect } from 'vitest';
import { classifyStatus, type ArticleEntry } from './types.js';

describe('classifyStatus', () => {
  const baseEntry: Omit<ArticleEntry, 'reviews' | 'finalDecision'> = {
    title: 'Test Article',
    doi: '10.1234/test',
  };

  it('returns "pending" when reviews array is empty', () => {
    const entry: ArticleEntry = {
      ...baseEntry,
      reviews: [],
    };
    expect(classifyStatus(entry)).toBe('pending');
  });

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

  it('returns "needs-final" when reviews exist but no finalDecision', () => {
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
    expect(classifyStatus(entry)).toBe('needs-final');
  });

  it('returns "conflicting" when reviewers disagree', () => {
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
    };
    expect(classifyStatus(entry)).toBe('conflicting');
  });

  it('returns "needs-final" when all reviewers agree', () => {
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
          decision: 'include',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('needs-final');
  });

  it('ignores reviews without decision when checking conflicts', () => {
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
    expect(classifyStatus(entry)).toBe('needs-final');
  });

  it('treats "uncertain" as a different decision for conflict detection', () => {
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
          decision: 'uncertain',
          timestamp: '2024-01-15T11:00:00Z',
        },
      ],
    };
    expect(classifyStatus(entry)).toBe('conflicting');
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
});
