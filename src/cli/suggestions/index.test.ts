import { describe, it, expect } from 'vitest';
import { formatSuggestion } from './index.js';
import type { SuggestionResult } from './types.js';

describe('formatSuggestion', () => {
  it('should format Next and See also sections', () => {
    const result: SuggestionResult = {
      next: [
        { command: 'search-hub results my-session', description: '結果を確認' },
        { command: 'search-hub summary my-session', description: '統計を確認' },
      ],
      seeAlso: [
        {
          command: 'search-hub diff <other-session> my-session',
          description: '別バージョンと比較',
        },
      ],
    };

    const output = formatSuggestion(result);

    expect(output).toContain('Next:');
    expect(output).toContain('  search-hub results my-session');
    expect(output).toContain('# 結果を確認');
    expect(output).toContain('  search-hub summary my-session');
    expect(output).toContain('# 統計を確認');
    expect(output).toContain('See also:');
    expect(output).toContain('  search-hub diff <other-session> my-session');
    expect(output).toContain('# 別バージョンと比較');
  });

  it('should format Next only when no See also', () => {
    const result: SuggestionResult = {
      next: [{ command: 'search-hub search query.yaml', description: '検索を実行' }],
      seeAlso: [],
    };

    const output = formatSuggestion(result);

    expect(output).toContain('Next:');
    expect(output).toContain('  search-hub search query.yaml');
    expect(output).not.toContain('See also:');
  });

  it('should format See also only when no Next', () => {
    const result: SuggestionResult = {
      next: [],
      seeAlso: [
        { command: 'search-hub results my-session', description: '結果を詳しく見る' },
      ],
    };

    const output = formatSuggestion(result);

    expect(output).not.toContain('Next:');
    expect(output).toContain('See also:');
    expect(output).toContain('  search-hub results my-session');
  });

  it('should return empty string when both arrays are empty', () => {
    const result: SuggestionResult = {
      next: [],
      seeAlso: [],
    };

    const output = formatSuggestion(result);

    expect(output).toBe('');
  });

  it('should return null for null input', () => {
    const output = formatSuggestion(null);

    expect(output).toBe('');
  });

  it('should render tip before Next section', () => {
    const result: SuggestionResult = {
      next: [{ command: 'search-hub search query.yaml --dry-run', description: 'Check DB translations' }],
      seeAlso: [],
      tip: 'Tip: Start from a template to get $schema support and usage examples:\n     search-hub query init -o query.yaml',
    };

    const output = formatSuggestion(result);

    // Tip should appear before Next
    const tipIndex = output.indexOf('Tip:');
    const nextIndex = output.indexOf('Next:');
    expect(tipIndex).toBeGreaterThan(-1);
    expect(nextIndex).toBeGreaterThan(-1);
    expect(tipIndex).toBeLessThan(nextIndex);
  });

  it('should render normally when tip is undefined', () => {
    const result: SuggestionResult = {
      next: [{ command: 'search-hub search query.yaml --dry-run', description: 'Check DB translations' }],
      seeAlso: [],
    };

    const output = formatSuggestion(result);

    expect(output).toContain('Next:');
    expect(output).not.toContain('Tip:');
  });

  it('should align inline comments', () => {
    const result: SuggestionResult = {
      next: [
        { command: 'search-hub results my-session', description: '結果を確認' },
        { command: 'search-hub summary my-session', description: '統計を確認' },
      ],
      seeAlso: [],
    };

    const output = formatSuggestion(result);

    // Both commands have the same length, so comments should be aligned
    const lines = output.split('\n').filter((l) => l.includes('#'));
    const commentPositions = lines.map((l) => l.indexOf('#'));
    // All comment positions should be the same within a section
    expect(new Set(commentPositions).size).toBe(1);
  });
});
