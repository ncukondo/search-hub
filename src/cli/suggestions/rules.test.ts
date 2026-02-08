import { describe, it, expect } from 'vitest';
import { getSuggestion } from './rules.js';
import type { SuggestionContext } from './types.js';

describe('getSuggestion', () => {
  describe('Phase 1: Query Preparation', () => {
    describe('query init', () => {
      it('should suggest editing the output file', () => {
        const ctx: SuggestionContext = {
          command: 'query init',
          outputFile: 'my-search.yaml',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('my-search.yaml');
        expect(result!.next[0]!.command).toContain('$EDITOR');
        expect(result!.seeAlso).toHaveLength(0);
      });
    });

    describe('query validate (success)', () => {
      it('should suggest dry-run and preview', () => {
        const ctx: SuggestionContext = {
          command: 'query validate',
          queryFile: 'query.yaml',
          validationSuccess: true,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(2);
        expect(result!.next[0]!.command).toContain('--dry-run');
        expect(result!.next[0]!.command).toContain('query.yaml');
        expect(result!.next[1]!.command).toContain('--preview');
        expect(result!.seeAlso).toHaveLength(0);
      });
    });

    describe('query validate (failure)', () => {
      it('should suggest editing the query file', () => {
        const ctx: SuggestionContext = {
          command: 'query validate',
          queryFile: 'query.yaml',
          validationSuccess: false,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('$EDITOR');
        expect(result!.next[0]!.command).toContain('query.yaml');
        expect(result!.seeAlso).toHaveLength(0);
      });
    });

    describe('query translate', () => {
      it('should suggest preview and full search', () => {
        const ctx: SuggestionContext = {
          command: 'query translate',
          queryFile: 'query.yaml',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(2);
        expect(result!.next[0]!.command).toContain('--preview');
        expect(result!.next[1]!.command).toContain('search-hub search query.yaml');
        expect(result!.next[1]!.command).not.toContain('--');
        expect(result!.seeAlso).toHaveLength(0);
      });
    });
  });

  describe('Phase 2: Search Execution', () => {
    describe('search --dry-run', () => {
      it('should suggest preview and full search', () => {
        const ctx: SuggestionContext = {
          command: 'search --dry-run',
          queryFile: 'query.yaml',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(2);
        expect(result!.next[0]!.command).toContain('--preview');
        expect(result!.next[1]!.command).toBe('search-hub search query.yaml');
      });
    });

    describe('search --preview', () => {
      it('should suggest full search', () => {
        const ctx: SuggestionContext = {
          command: 'search --preview',
          queryFile: 'query.yaml',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toBe('search-hub search query.yaml');
      });
    });

    describe('search --count-only', () => {
      it('should suggest full search', () => {
        const ctx: SuggestionContext = {
          command: 'search --count-only',
          queryFile: 'query.yaml',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toBe('search-hub search query.yaml');
      });
    });

    describe('search (completed)', () => {
      it('should suggest results when completed', () => {
        const ctx: SuggestionContext = {
          command: 'search',
          sessionId: 'my-session',
          sessionStatus: 'completed',
          sessionCount: 1,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('results');
        expect(result!.next[0]!.command).toContain('my-session');
        expect(result!.seeAlso).toHaveLength(0);
      });

      it('should suggest diff when other sessions exist', () => {
        const ctx: SuggestionContext = {
          command: 'search',
          sessionId: 'my-session',
          sessionStatus: 'completed',
          sessionCount: 3,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('diff');
      });
    });

    describe('search (partial)', () => {
      it('should suggest resume', () => {
        const ctx: SuggestionContext = {
          command: 'search',
          sessionId: 'my-session',
          sessionStatus: 'partial',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('resume');
        expect(result!.next[0]!.command).toContain('my-session');
      });
    });

    describe('search (failed)', () => {
      it('should suggest resume --retry-failed and status', () => {
        const ctx: SuggestionContext = {
          command: 'search',
          sessionId: 'my-session',
          sessionStatus: 'failed',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(2);
        expect(result!.next[0]!.command).toContain('resume');
        expect(result!.next[0]!.command).toContain('--retry-failed');
        expect(result!.next[1]!.command).toContain('status');
      });
    });

    describe('search --query (direct query mode)', () => {
      it('should include YAML suggestion in seeAlso along with search suggestions', () => {
        const ctx: SuggestionContext = {
          command: 'search --query',
          sessionId: 'my-session',
          sessionStatus: 'completed',
          sessionCount: 1,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('results');
        expect(result!.seeAlso.length).toBeGreaterThanOrEqual(1);
        expect(result!.seeAlso.some((s) => s.command.includes('query init'))).toBe(true);
      });
    });

    describe('resume', () => {
      it('should follow same rules as search (completed)', () => {
        const ctx: SuggestionContext = {
          command: 'resume',
          sessionId: 'my-session',
          sessionStatus: 'completed',
          sessionCount: 1,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('results');
      });

      it('should follow same rules as search (partial)', () => {
        const ctx: SuggestionContext = {
          command: 'resume',
          sessionId: 'my-session',
          sessionStatus: 'partial',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('resume');
      });
    });
  });

  describe('Phase 3: Result Analysis', () => {
    describe('status (completed)', () => {
      it('should suggest results', () => {
        const ctx: SuggestionContext = {
          command: 'status',
          sessionId: 'my-session',
          sessionStatus: 'completed',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('results');
        expect(result!.next[0]!.command).toContain('my-session');
      });
    });

    describe('status (partial)', () => {
      it('should suggest resume', () => {
        const ctx: SuggestionContext = {
          command: 'status',
          sessionId: 'my-session',
          sessionStatus: 'partial',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('resume');
      });
    });

    describe('status (failed)', () => {
      it('should suggest resume --retry-failed', () => {
        const ctx: SuggestionContext = {
          command: 'status',
          sessionId: 'my-session',
          sessionStatus: 'failed',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('resume');
        expect(result!.next[0]!.command).toContain('--retry-failed');
      });
    });

    describe('results', () => {
      it('should suggest review init when no reviews', () => {
        const ctx: SuggestionContext = {
          command: 'results',
          sessionId: 'my-session',
          hasReviews: false,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review init');
      });

      it('should suggest review status when reviews exist', () => {
        const ctx: SuggestionContext = {
          command: 'results',
          sessionId: 'my-session',
          hasReviews: true,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review status');
      });
    });

    describe('summary', () => {
      it('should suggest review init when no reviews', () => {
        const ctx: SuggestionContext = {
          command: 'summary',
          sessionId: 'my-session',
          hasReviews: false,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review init');
      });

      it('should suggest review status when reviews exist', () => {
        const ctx: SuggestionContext = {
          command: 'summary',
          sessionId: 'my-session',
          hasReviews: true,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review status');
      });
    });

    describe('diff', () => {
      it('should suggest results as see also', () => {
        const ctx: SuggestionContext = {
          command: 'diff',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(0);
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('results');
      });
    });

    describe('merge', () => {
      it('should suggest results and summary', () => {
        const ctx: SuggestionContext = {
          command: 'merge',
          sessionId: 'merged-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(2);
        expect(result!.next[0]!.command).toContain('results');
        expect(result!.next[1]!.command).toContain('summary');
      });
    });
  });

  describe('Phase 4: Review Workflow', () => {
    describe('review init', () => {
      it('should suggest extract with title basis', () => {
        const ctx: SuggestionContext = {
          command: 'review init',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review extract');
        expect(result!.next[0]!.command).toContain('--basis title');
        expect(result!.next[0]!.command).toContain('--name title-screening');
      });
    });

    describe('review status', () => {
      it('should suggest title screening when pending > 0', () => {
        const ctx: SuggestionContext = {
          command: 'review status',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 50,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 0,
            finalized: 0,
            included: 0,
            excluded: 0,
            reviewers: [],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('--basis title');
        expect(result!.next[0]!.command).toContain('--filter pending');
        expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
      });

      it('should suggest finalization when agreed > 0', () => {
        const ctx: SuggestionContext = {
          command: 'review status',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 60,
            agreedExclude: 40,
            conflicting: 0,
            finalized: 0,
            included: 0,
            excluded: 0,
            reviewers: [],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('review finalize');
      });

      it('should suggest abstract screening when conflicting > 0', () => {
        const ctx: SuggestionContext = {
          command: 'review status',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 5,
            finalized: 85,
            included: 50,
            excluded: 35,
            reviewers: [{ name: 'ai:claude', basis: 'title' }],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('--basis abstract');
        expect(result!.next[0]!.command).toContain('--filter conflicting,uncertain,incomplete');
        expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
      });

      it('should suggest abstract screening when uncertain or incomplete > 0', () => {
        const ctx: SuggestionContext = {
          command: 'review status',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 5,
            uncertain: 10,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 0,
            finalized: 85,
            included: 50,
            excluded: 35,
            reviewers: [{ name: 'ai:claude', basis: 'title' }],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('--basis abstract');
        expect(result!.next[0]!.command).toContain('--filter conflicting,uncertain,incomplete');
        expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
      });

      it('should suggest register when all finalized', () => {
        const ctx: SuggestionContext = {
          command: 'review status',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 0,
            finalized: 100,
            included: 60,
            excluded: 40,
            reviewers: [],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('register');
        expect(result!.next[0]!.command).toContain('--reviewed');
      });
    });

    describe('review list', () => {
      it('should suggest extract as see also', () => {
        const ctx: SuggestionContext = {
          command: 'review list',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('review extract');
      });
    });

    describe('review extract', () => {
      it('should suggest merge', () => {
        const ctx: SuggestionContext = {
          command: 'review extract',
          sessionId: 'my-session',
          extractName: 'title-screening',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review merge');
        expect(result!.next[0]!.command).toContain('--name title-screening');
      });

      it('should suggest next batch when --limit used with remaining articles', () => {
        const ctx: SuggestionContext = {
          command: 'review extract',
          sessionId: 'my-session',
          extractName: 'title-batch-1',
          extractedCount: 20,
          totalMatching: 80,
          extractLimit: 20,
          extractOffset: 0,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review merge');
        expect(result!.seeAlso.length).toBeGreaterThanOrEqual(1);
        const batchSuggestion = result!.seeAlso.find(s => s.command.includes('--offset'));
        expect(batchSuggestion).toBeDefined();
        expect(batchSuggestion!.command).toContain('--offset 20');
        expect(batchSuggestion!.command).toContain('--limit 20');
      });

      it('should not suggest next batch when all articles extracted', () => {
        const ctx: SuggestionContext = {
          command: 'review extract',
          sessionId: 'my-session',
          extractName: 'title-screening',
          extractedCount: 50,
          totalMatching: 50,
          extractLimit: 50,
          extractOffset: 0,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(0);
      });
    });

    describe('review merge', () => {
      it('should suggest status when reviewStatus not provided', () => {
        const ctx: SuggestionContext = {
          command: 'review merge',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(1);
        expect(result!.next[0]!.command).toContain('review status');
      });

      it('should suggest finalize when agreed > 0', () => {
        const ctx: SuggestionContext = {
          command: 'review merge',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 60,
            agreedExclude: 30,
            conflicting: 0,
            finalized: 10,
            included: 5,
            excluded: 5,
            reviewers: [{ name: 'ai:claude', basis: 'title' }],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('review finalize');
      });
    });

    describe('review finalize', () => {
      it('should suggest next review phase when unresolved articles remain', () => {
        const ctx: SuggestionContext = {
          command: 'review finalize',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 10,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 5,
            finalized: 85,
            included: 50,
            excluded: 35,
            reviewers: [{ name: 'ai:claude', basis: 'title' }],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('review extract');
        expect(result!.next[0]!.command).toContain('--basis abstract');
        expect(result!.next[0]!.command).toContain('--reviewer "<name>"');
      });

      it('should suggest register when all finalized', () => {
        const ctx: SuggestionContext = {
          command: 'review finalize',
          sessionId: 'my-session',
          reviewStatus: {
            sessionId: 'my-session',
            total: 100,
            pending: 0,
            incomplete: 0,
            uncertain: 0,
            agreedInclude: 0,
            agreedExclude: 0,
            conflicting: 0,
            finalized: 100,
            included: 60,
            excluded: 40,
            reviewers: [{ name: 'ai:claude', basis: 'title' }],
          },
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next[0]!.command).toContain('register');
        expect(result!.next[0]!.command).toContain('--reviewed');
      });
    });

    describe('review export', () => {
      it('should suggest register as see also', () => {
        const ctx: SuggestionContext = {
          command: 'review export',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('register');
        expect(result!.seeAlso[0]!.command).toContain('--reviewed');
      });
    });
  });

  describe('Phase 5: Registration & Export', () => {
    describe('export', () => {
      it('should suggest review init when no reviews', () => {
        const ctx: SuggestionContext = {
          command: 'export',
          sessionId: 'my-session',
          hasReviews: false,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('review init');
      });

      it('should return no suggestions when reviews exist', () => {
        const ctx: SuggestionContext = {
          command: 'export',
          sessionId: 'my-session',
          hasReviews: true,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.next).toHaveLength(0);
        expect(result!.seeAlso).toHaveLength(0);
      });
    });

    describe('register', () => {
      it('should suggest review init when no reviews', () => {
        const ctx: SuggestionContext = {
          command: 'register',
          sessionId: 'my-session',
          hasReviews: false,
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('review init');
      });

      it('should return null (terminal state) when reviews exist', () => {
        const ctx: SuggestionContext = {
          command: 'register',
          sessionId: 'my-session',
          hasReviews: true,
        };
        const result = getSuggestion(ctx);
        expect(result).toBeNull();
      });
    });

    describe('notes add', () => {
      it('should suggest notes list as see also', () => {
        const ctx: SuggestionContext = {
          command: 'notes add',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('notes list');
      });
    });

    describe('notes assess', () => {
      it('should suggest notes list as see also', () => {
        const ctx: SuggestionContext = {
          command: 'notes assess',
          sessionId: 'my-session',
        };
        const result = getSuggestion(ctx);
        expect(result).not.toBeNull();
        expect(result!.seeAlso).toHaveLength(1);
        expect(result!.seeAlso[0]!.command).toContain('notes list');
      });
    });
  });
});
