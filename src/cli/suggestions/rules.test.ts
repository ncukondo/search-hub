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
});
