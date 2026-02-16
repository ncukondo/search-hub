import { describe, it, expect } from 'vitest';
import { computeBatchContinuation, generateReviewNextSteps, type ReviewNextStepsContext } from './next-steps.js';
import type { ReviewStatusResult } from './status.js';

function makeStatusResult(overrides: Partial<ReviewStatusResult> = {}): ReviewStatusResult {
  return {
    sessionId: 'test-session',
    total: 100,
    pending: 0,
    incomplete: 0,
    allUncertain: 0,
    agreedInclude: 0,
    agreedExclude: 0,
    divided: 0,
    finalized: 0,
    included: 0,
    excluded: 0,
    reviewers: [],
    ...overrides,
  };
}

describe('generateReviewNextSteps', () => {
  describe('agreed > 0', () => {
    it('should suggest review finalize', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          agreedInclude: 30,
          agreedExclude: 20,
          finalized: 50,
          included: 30,
          excluded: 20,
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next).toHaveLength(1);
      expect(result!.next[0]!.command).toContain('review finalize');
      expect(result!.next[0]!.command).toContain('--session my-session');
      expect(result!.next[0]!.description).toContain('50');
    });
  });

  describe('agreed = 0, divided + all-uncertain + incomplete > 0', () => {
    it('should suggest review extract with next basis (no reviewers → title)', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          allUncertain: 10,
          divided: 5,
          finalized: 85,
          included: 50,
          excluded: 35,
          reviewers: [],
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next).toHaveLength(1);
      expect(result!.next[0]!.command).toContain('review extract');
      expect(result!.next[0]!.command).toContain('--basis title');
      expect(result!.next[0]!.command).toContain('--filter divided,all-uncertain,incomplete');
      expect(result!.next[0]!.command).toContain('--session my-session');
      expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
    });

    it('should detect next basis: has title reviews → abstract', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          allUncertain: 10,
          finalized: 90,
          included: 50,
          excluded: 40,
          reviewers: [{ name: 'ai:claude', basis: 'title' }],
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('--basis abstract');
      expect(result!.next[0]!.command).toContain('--name abstract-screening');
    });

    it('should detect next basis: has abstract reviews → fulltext', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          allUncertain: 5,
          finalized: 95,
          included: 50,
          excluded: 45,
          reviewers: [
            { name: 'ai:claude', basis: 'title' },
            { name: 'ai:claude', basis: 'abstract' },
          ],
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('--basis fulltext');
      expect(result!.next[0]!.command).toContain('--name fulltext-screening');
    });
  });

  describe('pending > 0', () => {
    it('should suggest review extract with title basis for pending', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          pending: 50,
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('review extract');
      expect(result!.next[0]!.command).toContain('--basis title');
      expect(result!.next[0]!.command).toContain('--filter pending');
      expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
      expect(result!.next[0]!.command).toContain('--name title-screening');
    });
  });

  describe('all finalized', () => {
    it('should suggest review export', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          total: 100,
          finalized: 100,
          included: 60,
          excluded: 40,
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('register');
      expect(result!.next[0]!.command).toContain('--reviewed');
    });
  });

  describe('batch continuation', () => {
    it('should suggest next batch with correct offset when --limit used with remaining', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          pending: 80,
        }),
        extractName: 'title-batch-1',
        extractedCount: 20,
        totalMatching: 80,
        limit: 20,
        offset: 0,
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      // Should have main suggestion + batch continuation in seeAlso
      expect(result!.seeAlso.length).toBeGreaterThanOrEqual(1);
      const batchSuggestion = result!.seeAlso.find(s => s.command.includes('--offset'));
      expect(batchSuggestion).toBeDefined();
      expect(batchSuggestion!.command).toContain('--offset 20');
      expect(batchSuggestion!.command).toContain('--limit 20');
    });

    it('should not suggest batch continuation when all articles extracted', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({
          pending: 20,
        }),
        extractName: 'title-screening',
        extractedCount: 20,
        totalMatching: 20,
        limit: 20,
        offset: 0,
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      // No batch continuation in seeAlso
      const batchSuggestion = result!.seeAlso.find(s => s.command.includes('--offset'));
      expect(batchSuggestion).toBeUndefined();
    });
  });

  describe('session ID embedded in commands', () => {
    it('should embed session ID in all suggested commands', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'abc-123',
        statusResult: makeStatusResult({
          sessionId: 'abc-123',
          agreedInclude: 10,
        }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).not.toBeNull();
      for (const s of result!.next) {
        expect(s.command).toContain('abc-123');
      }
    });
  });

  describe('no action needed', () => {
    it('should return null when status is empty (total=0)', () => {
      const ctx: ReviewNextStepsContext = {
        sessionId: 'my-session',
        statusResult: makeStatusResult({ total: 0 }),
      };
      const result = generateReviewNextSteps(ctx);
      expect(result).toBeNull();
    });
  });
});

describe('computeBatchContinuation', () => {
  it('should return suggestion with correct offset and limit', () => {
    const result = computeBatchContinuation({
      sessionId: 'my-session',
      extractName: 'batch-1',
      extractedCount: 20,
      totalMatching: 80,
      limit: 20,
      offset: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.command).toContain('--offset 20');
    expect(result!.command).toContain('--limit 20');
    expect(result!.command).toContain('--name batch-1-next');
    expect(result!.command).toContain('--session my-session');
    expect(result!.description).toContain('60');
  });

  it('should return null when no remaining articles', () => {
    const result = computeBatchContinuation({
      sessionId: 'my-session',
      extractName: 'batch-1',
      extractedCount: 20,
      totalMatching: 20,
      limit: 20,
      offset: 0,
    });
    expect(result).toBeNull();
  });

  it('should use next-batch as default name when extractName is undefined', () => {
    const result = computeBatchContinuation({
      sessionId: 'my-session',
      extractedCount: 10,
      totalMatching: 30,
      limit: 10,
      offset: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.command).toContain('--name next-batch');
  });

  it('should default offset to 0 when not provided', () => {
    const result = computeBatchContinuation({
      sessionId: 'my-session',
      extractName: 'batch',
      extractedCount: 10,
      totalMatching: 30,
      limit: 10,
    });
    expect(result).not.toBeNull();
    expect(result!.command).toContain('--offset 10');
  });
});
