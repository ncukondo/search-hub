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

// Phase 2: Search Execution rules

/**
 * Build search completion suggestions based on session status.
 * Shared by search, search --query, and resume commands.
 */
function searchCompletionSuggestion(ctx: SuggestionContext): SuggestionResult | null {
  const sid = ctx.sessionId ?? '<session-id>';

  switch (ctx.sessionStatus) {
    case 'completed': {
      const seeAlso: SuggestionResult['seeAlso'] = [];
      if (ctx.sessionCount !== undefined && ctx.sessionCount > 1) {
        seeAlso.push({
          command: `search-hub diff <other-session> ${sid}`,
          description: 'Compare with another query version',
        });
      }
      return {
        next: [{ command: `search-hub results ${sid}`, description: 'View results' }],
        seeAlso,
      };
    }
    case 'partial':
      return {
        next: [{ command: `search-hub resume ${sid}`, description: 'Retry failed databases' }],
        seeAlso: [],
      };
    case 'failed':
      return {
        next: [
          { command: `search-hub resume ${sid} --retry-failed`, description: 'Retry all databases' },
          { command: `search-hub status ${sid}`, description: 'View error details' },
        ],
        seeAlso: [],
      };
    default:
      return null;
  }
}

const searchDryRunRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --dry-run') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [
      { command: `search-hub search ${file} --preview`, description: 'Preview hit counts + sample titles' },
      { command: `search-hub search ${file}`, description: 'Execute search' },
    ],
    seeAlso: [],
  };
};

const searchPreviewRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --preview') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [{ command: `search-hub search ${file}`, description: 'Execute full search' }],
    seeAlso: [],
  };
};

const searchCountOnlyRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --count-only') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [{ command: `search-hub search ${file}`, description: 'Execute full search' }],
    seeAlso: [],
  };
};

const searchDirectQueryRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --query') return null;
  const base = searchCompletionSuggestion(ctx);
  if (base === null) return null;
  return {
    next: base.next,
    seeAlso: [
      ...base.seeAlso,
      { command: 'search-hub query init -o my-search.yaml', description: 'Save as YAML for reproducibility' },
    ],
  };
};

const searchRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search') return null;
  return searchCompletionSuggestion(ctx);
};

const resumeRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'resume') return null;
  return searchCompletionSuggestion(ctx);
};

// Phase 3: Result Analysis rules

const statusRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'status') return null;
  const sid = ctx.sessionId ?? '<session-id>';

  switch (ctx.sessionStatus) {
    case 'completed':
      return {
        next: [{ command: `search-hub results ${sid}`, description: 'View results' }],
        seeAlso: [],
      };
    case 'partial':
      return {
        next: [{ command: `search-hub resume ${sid}`, description: 'Resume search' }],
        seeAlso: [],
      };
    case 'failed':
      return {
        next: [{ command: `search-hub resume ${sid} --retry-failed`, description: 'Retry all databases' }],
        seeAlso: [],
      };
    default:
      return null;
  }
};

/**
 * Suggestion for results/summary commands - conditional based on reviews.yaml existence.
 */
function resultReviewSuggestion(ctx: SuggestionContext): SuggestionResult {
  const sid = ctx.sessionId ?? '<session-id>';
  if (ctx.hasReviews === true) {
    return {
      next: [{ command: `search-hub review status --session ${sid}`, description: 'Check review progress' }],
      seeAlso: [],
    };
  }
  return {
    next: [{ command: `search-hub review init --session ${sid}`, description: 'Start systematic review' }],
    seeAlso: [],
  };
}

const resultsRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'results') return null;
  return resultReviewSuggestion(ctx);
};

const summaryRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'summary') return null;
  return resultReviewSuggestion(ctx);
};

const diffRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'diff') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [],
    seeAlso: [{ command: `search-hub results ${sid}`, description: 'View detailed results' }],
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
  // Phase 2
  searchDryRunRule,
  searchPreviewRule,
  searchCountOnlyRule,
  searchDirectQueryRule,
  searchRule,
  resumeRule,
  // Phase 3
  statusRule,
  resultsRule,
  summaryRule,
  diffRule,
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
