import type { SuggestionContext, SuggestionResult, SuggestionRule } from './types.js';

// Phase 1: Query Preparation rules

const queryInitRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query init') return null;
  const file = ctx.outputFile ?? 'query.yaml';
  return {
    next: [{ command: `$EDITOR ${file}`, description: 'Edit your query' }],
    seeAlso: [],
  };
};

const queryValidateRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query validate') return null;
  const file = ctx.queryFile ?? '<query-file>';

  if (ctx.validationSuccess === false) {
    return {
      next: [{ command: `$EDITOR ${file}`, description: 'Fix errors and re-validate' }],
      seeAlso: [],
    };
  }

  return {
    next: [
      { command: `search-hub search ${file} --dry-run`, description: 'Check DB translations' },
      { command: `search-hub search ${file} --preview`, description: 'Preview hit counts + sample titles' },
    ],
    seeAlso: [],
  };
};

const queryTranslateRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query translate') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [
      { command: `search-hub search ${file} --preview`, description: 'Preview hit counts + sample titles' },
      { command: `search-hub search ${file}`, description: 'Execute search' },
    ],
    seeAlso: [],
  };
};

/**
 * All suggestion rules in evaluation order.
 */
const rules: SuggestionRule[] = [
  // Phase 1
  queryInitRule,
  queryValidateRule,
  queryTranslateRule,
];

/**
 * Evaluate suggestion rules for the given context.
 * Returns the first matching rule's result, or null if no rules match.
 */
export function getSuggestion(ctx: SuggestionContext): SuggestionResult | null {
  for (const rule of rules) {
    const result = rule(ctx);
    if (result !== null) return result;
  }
  return null;
}
