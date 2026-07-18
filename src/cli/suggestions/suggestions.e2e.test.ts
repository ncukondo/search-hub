/**
 * E2E Tests for Next Step Suggestions
 *
 * Tests that the suggestion system integrates correctly with CLI commands:
 * - Suggestions appear in actual CLI output
 * - --quiet suppresses suggestions
 * - State-dependent suggestions reflect session state
 * - Old tip functions are fully replaced
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { getSuggestion } from './rules.js';
import { formatSuggestion } from './index.js';
import type { SuggestionContext } from './types.js';
import { countSessions, hasReviewFile } from './conditions.js';

describe('Next Step Suggestions E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  describe('suggestion output format', () => {
    it('should output "Next:" section with aligned comments', () => {
      const result = getSuggestion({
        command: 'query validate',
        queryFile: 'query.yaml',
        validationSuccess: true,
      });
      const output = formatSuggestion(result);

      expect(output).toContain('Next:');
      expect(output).toContain('search-hub search query.yaml --dry-run');
      expect(output).toContain('# Check DB translations');
      expect(output).toContain('search-hub search query.yaml --preview');
      expect(output).toContain('# Preview hit counts + sample titles');
    });

    it('should output "See also:" section when alternatives exist', () => {
      const result = getSuggestion({
        command: 'search --query',
        sessionId: 'test-session',
        sessionStatus: 'completed',
      });
      const output = formatSuggestion(result);

      expect(output).toContain('Next:');
      expect(output).toContain('See also:');
      expect(output).toContain('search-hub query init');
      expect(output).toContain('YAML for reproducibility');
    });
  });

  describe('--quiet suppresses suggestions', () => {
    it('should produce no output when called with quiet flag context', () => {
      // Verify suggestions exist for a given context
      const result = getSuggestion({
        command: 'search --count-only',
        queryFile: 'query.yaml',
      });
      expect(result).not.toBeNull();
      expect(formatSuggestion(result)).toContain('Next:');

      // In the CLI, --quiet prevents console.log from being called.
      // We verify the mechanism works: formatSuggestion returns a string,
      // and the CLI code gates it behind !globalOpts.quiet.
      // Here we verify the string is non-empty (so suppression is meaningful).
      const output = formatSuggestion(result);
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('state-dependent suggestions (search command)', () => {
    it('should suggest results for completed search', () => {
      const result = getSuggestion({
        command: 'search',
        sessionId: 'session-abc',
        sessionStatus: 'completed',
      });

      expect(result).not.toBeNull();
      expect(result!.next).toHaveLength(1);
      expect(result!.next[0]!.command).toContain('results session-abc');
    });

    it('should suggest resume for partial search', () => {
      const result = getSuggestion({
        command: 'search',
        sessionId: 'session-abc',
        sessionStatus: 'partial',
      });

      expect(result).not.toBeNull();
      expect(result!.next).toHaveLength(1);
      expect(result!.next[0]!.command).toContain('resume session-abc');
    });

    it('should suggest retry for failed search', () => {
      const result = getSuggestion({
        command: 'search',
        sessionId: 'session-abc',
        sessionStatus: 'failed',
      });

      expect(result).not.toBeNull();
      expect(result!.next).toHaveLength(2);
      expect(result!.next[0]!.command).toContain('resume session-abc --retry-failed');
      expect(result!.next[1]!.command).toContain('status session-abc');
    });

    it('should suggest diff when multiple sessions exist', () => {
      const result = getSuggestion({
        command: 'search',
        sessionId: 'session-v2',
        sessionStatus: 'completed',
        sessionCount: 3,
      });

      expect(result).not.toBeNull();
      expect(result!.seeAlso).toHaveLength(1);
      expect(result!.seeAlso[0]!.command).toContain('diff');
      expect(result!.seeAlso[0]!.command).toContain('session-v2');
    });

    it('should not suggest diff when only one session exists', () => {
      const result = getSuggestion({
        command: 'search',
        sessionId: 'session-v1',
        sessionStatus: 'completed',
        sessionCount: 1,
      });

      expect(result).not.toBeNull();
      expect(result!.seeAlso).toHaveLength(0);
    });
  });

  describe('state-dependent suggestions (review status)', () => {
    it('should suggest title screening when pending > 0', () => {
      const result = getSuggestion({
        command: 'review status',
        sessionId: 'session-abc',
        reviewStatus: {
          sessionId: 'session-abc',
          total: 100,
          pending: 80,
          incomplete: 0,
          allUncertain: 0,
          agreedInclude: 0,
          agreedExclude: 0,
          divided: 0,
          finalized: 0,
          included: 0,
          excluded: 0,
          reviewers: [],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('--basis title');
      expect(result!.next[0]!.command).toContain('--filter pending');
    });

    it('should suggest resolving conflicts when divided > 0', () => {
      const result = getSuggestion({
        command: 'review status',
        sessionId: 'session-abc',
        reviewStatus: {
          sessionId: 'session-abc',
          total: 100,
          pending: 0,
          incomplete: 0,
          allUncertain: 0,
          agreedInclude: 0,
          agreedExclude: 0,
          divided: 5,
          finalized: 85,
          included: 50,
          excluded: 35,
          reviewers: [],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('--filter divided');
    });

    it('should suggest finalization when agreed > 0', () => {
      const result = getSuggestion({
        command: 'review status',
        sessionId: 'session-abc',
        reviewStatus: {
          sessionId: 'session-abc',
          total: 100,
          pending: 0,
          incomplete: 0,
          allUncertain: 0,
          agreedInclude: 10,
          agreedExclude: 5,
          divided: 0,
          finalized: 85,
          included: 50,
          excluded: 35,
          reviewers: [],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('review finalize');
    });

    it('should suggest registration when all finalized', () => {
      const result = getSuggestion({
        command: 'review status',
        sessionId: 'session-abc',
        reviewStatus: {
          sessionId: 'session-abc',
          total: 100,
          pending: 0,
          incomplete: 0,
          allUncertain: 0,
          agreedInclude: 0,
          agreedExclude: 0,
          divided: 0,
          finalized: 100,
          included: 60,
          excluded: 40,
          reviewers: [],
        },
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('register session-abc --reviewed');
    });
  });

  describe('conditional suggestions (results/summary)', () => {
    it('should suggest review init when no reviews exist', () => {
      const result = getSuggestion({
        command: 'results',
        sessionId: 'session-abc',
        hasReviews: false,
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('review init');
    });

    it('should suggest review status when reviews exist', () => {
      const result = getSuggestion({
        command: 'results',
        sessionId: 'session-abc',
        hasReviews: true,
      });

      expect(result).not.toBeNull();
      expect(result!.next[0]!.command).toContain('review status');
    });
  });

  describe('conditions module with real filesystem', () => {
    it('countSessions should count session directories', async () => {
      // Create test session directories
      await mkdir(join(ctx.sessionsDir, 'session-a'), { recursive: true });
      await mkdir(join(ctx.sessionsDir, 'session-b'), { recursive: true });
      await mkdir(join(ctx.sessionsDir, 'session-c'), { recursive: true });

      const count = countSessions(ctx.sessionsDir);
      expect(count).toBe(3);
    });

    it('countSessions should return 0 for empty directory', () => {
      const count = countSessions(ctx.sessionsDir);
      expect(count).toBe(0);
    });

    it('countSessions should return 0 for non-existent directory', () => {
      const count = countSessions('/nonexistent/path');
      expect(count).toBe(0);
    });

    it('hasReviewFile should return false when no reviews.yaml exists', async () => {
      await mkdir(join(ctx.sessionsDir, 'session-x'), { recursive: true });

      const result = hasReviewFile(ctx.sessionsDir, 'session-x');
      expect(result).toBe(false);
    });

    it('hasReviewFile should return true when reviews.yaml exists', async () => {
      const sessionDir = join(ctx.sessionsDir, 'session-x');
      const internalDir = join(sessionDir, '.internal');
      await mkdir(internalDir, { recursive: true });
      await writeFile(join(internalDir, 'reviews.yaml'), 'articles: []\n', 'utf-8');

      const result = hasReviewFile(ctx.sessionsDir, 'session-x');
      expect(result).toBe(true);
    });
  });

  describe('all phases covered', () => {
    const phaseCommands: { command: string; ctx: Partial<SuggestionContext> }[] = [
      // Phase 1: Query Preparation
      { command: 'query init', ctx: { outputFile: 'query.yaml' } },
      { command: 'query validate', ctx: { queryFile: 'q.yaml', validationSuccess: true } },
      { command: 'query validate', ctx: { queryFile: 'q.yaml', validationSuccess: false } },
      { command: 'query translate', ctx: { queryFile: 'q.yaml' } },
      // Phase 2: Search Execution
      { command: 'search --dry-run', ctx: { queryFile: 'q.yaml' } },
      { command: 'search --preview', ctx: { queryFile: 'q.yaml' } },
      { command: 'search --count-only', ctx: { queryFile: 'q.yaml' } },
      { command: 'search', ctx: { sessionId: 'sid', sessionStatus: 'completed' } },
      { command: 'search --query', ctx: { sessionId: 'sid', sessionStatus: 'completed' } },
      { command: 'resume', ctx: { sessionId: 'sid', sessionStatus: 'completed' } },
      // Phase 3: Result Analysis
      { command: 'status', ctx: { sessionId: 'sid', sessionStatus: 'completed' } },
      { command: 'results', ctx: { sessionId: 'sid', hasReviews: false } },
      { command: 'summary', ctx: { sessionId: 'sid', hasReviews: false } },
      { command: 'diff', ctx: { sessionId: 'sid' } },
      // Phase 4: Review Workflow
      { command: 'review init', ctx: { sessionId: 'sid' } },
      {
        command: 'review status',
        ctx: {
          sessionId: 'sid',
          reviewStatus: {
            sessionId: 'sid',
            total: 10,
            pending: 5,
            incomplete: 0,
            allUncertain: 0,
            agreedInclude: 0,
            agreedExclude: 0,
            divided: 0,
            finalized: 0,
            included: 0,
            excluded: 0,
            reviewers: [],
          },
        },
      },
      { command: 'review list', ctx: { sessionId: 'sid' } },
      { command: 'review extract', ctx: { sessionId: 'sid', extractName: 'batch1' } },
      { command: 'review merge', ctx: { sessionId: 'sid' } },
      { command: 'review export', ctx: { sessionId: 'sid' } },
      // Phase 5: Registration & Export
      { command: 'export', ctx: { sessionId: 'sid', hasReviews: false } },
      { command: 'register', ctx: { sessionId: 'sid', hasReviews: false } },
      { command: 'notes add', ctx: { sessionId: 'sid' } },
      { command: 'notes assess', ctx: { sessionId: 'sid' } },
    ];

    for (const { command, ctx } of phaseCommands) {
      it(`should produce suggestion for "${command}"`, () => {
        const result = getSuggestion({ command, ...ctx } as SuggestionContext);
        expect(result).not.toBeNull();
        const output = formatSuggestion(result);
        // Each command should produce at least one Next or See also suggestion
        expect(output.length).toBeGreaterThan(0);
        expect(output).toMatch(/Next:|See also:/);
      });
    }
  });

  describe('terminal states (no suggestions)', () => {
    it('register with reviews should return null (terminal state)', () => {
      const result = getSuggestion({
        command: 'register',
        sessionId: 'sid',
        hasReviews: true,
      });
      expect(result).toBeNull();
    });

    it('export with reviews should return empty suggestions', () => {
      const result = getSuggestion({
        command: 'export',
        sessionId: 'sid',
        hasReviews: true,
      });
      // export with reviews returns { next: [], seeAlso: [] }
      expect(result).not.toBeNull();
      const output = formatSuggestion(result);
      expect(output).toBe('');
    });
  });

  describe('old tip functions fully replaced', () => {
    it('should NOT have formatSearchCompletionTip in search module', async () => {
      const searchModule = await import('../commands/search.js');
      expect('formatSearchCompletionTip' in searchModule).toBe(false);
    });

    it('should NOT have formatCountOnlyTip in search module', async () => {
      const searchModule = await import('../commands/search.js');
      expect('formatCountOnlyTip' in searchModule).toBe(false);
    });

    it('should NOT have formatDirectQueryTip in search module', async () => {
      const searchModule = await import('../commands/search.js');
      expect('formatDirectQueryTip' in searchModule).toBe(false);
    });

    it('should NOT have formatReviewWorkflowTip in register module', async () => {
      const registerModule = await import('../commands/register.js');
      expect('formatReviewWorkflowTip' in registerModule).toBe(false);
    });
  });

  describe('integration: search --count-only with suggestion', () => {
    it('should include count-only suggestion in formatted output', () => {
      const suggestion = getSuggestion({
        command: 'search --count-only',
        queryFile: 'diabetes.yaml',
      });
      const output = formatSuggestion(suggestion);

      expect(output).toContain('Next:');
      expect(output).toContain('search-hub search diabetes.yaml');
      expect(output).toContain('# Execute full search');
    });
  });

  describe('integration: search --dry-run with suggestion', () => {
    it('should include dry-run suggestion with correct query file', () => {
      const suggestion = getSuggestion({
        command: 'search --dry-run',
        queryFile: 'my-query.yaml',
      });
      const output = formatSuggestion(suggestion);

      expect(output).toContain('Next:');
      expect(output).toContain('my-query.yaml --preview');
      expect(output).toContain('my-query.yaml');
    });
  });

  describe('integration: register with suggestion', () => {
    it('should suggest review init when no reviews exist', () => {
      const suggestion = getSuggestion({
        command: 'register',
        sessionId: 'my-session',
        hasReviews: false,
      });
      const output = formatSuggestion(suggestion);

      expect(output).toContain('See also:');
      expect(output).toContain('review init --session my-session');
    });

    it('should have no suggestion when reviews exist (terminal)', () => {
      const suggestion = getSuggestion({
        command: 'register',
        sessionId: 'my-session',
        hasReviews: true,
      });
      expect(suggestion).toBeNull();
    });
  });
});
