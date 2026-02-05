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
});
