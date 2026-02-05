import type { Suggestion, SuggestionResult } from './types.js';

export type { Suggestion, SuggestionResult } from './types.js';
export type { SuggestionContext, SuggestionRule } from './types.js';

/**
 * Format a section (Next or See also) with aligned inline comments.
 */
function formatSection(label: string, items: Suggestion[]): string {
  if (items.length === 0) return '';

  // Find the longest command to align comments
  const maxCommandLen = Math.max(...items.map((s) => s.command.length));
  const padding = 4; // spaces between command and comment

  const lines = items.map((s) => {
    const spaces = ' '.repeat(maxCommandLen - s.command.length + padding);
    return `  ${s.command}${spaces}# ${s.description}`;
  });

  return `${label}:\n${lines.join('\n')}`;
}

/**
 * Format suggestion result into a human-readable string.
 *
 * Output format:
 * ```
 * Next:
 *   search-hub results <session-id>        # 結果を確認
 *
 * See also:
 *   search-hub diff <other> <session-id>   # 別バージョンと比較
 * ```
 */
export function formatSuggestion(result: SuggestionResult | null): string {
  if (result === null) return '';

  const sections: string[] = [];

  const nextSection = formatSection('Next', result.next);
  if (nextSection) sections.push(nextSection);

  const seeAlsoSection = formatSection('See also', result.seeAlso);
  if (seeAlsoSection) sections.push(seeAlsoSection);

  if (sections.length === 0) return '';

  return '\n' + sections.join('\n\n');
}
