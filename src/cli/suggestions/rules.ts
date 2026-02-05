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

// Phase 4: Review Workflow rules

const reviewInitRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review init') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [
      {
        command: `search-hub review extract --session ${sid} --basis title --name title-screening`,
        description: 'Start title screening',
      },
    ],
    seeAlso: [],
  };
};

const reviewStatusRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review status') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  const rs = ctx.reviewStatus;
  if (!rs) return null;

  // 1. pending > 0: title screening incomplete
  if (rs.pending > 0) {
    return {
      next: [
        {
          command: `search-hub review extract --session ${sid} --basis title --filter pending --name title-screening`,
          description: 'Continue title screening',
        },
      ],
      seeAlso: [],
    };
  }

  // 2. All reviewed or needs-final, no conflicting, no finalized yet → abstract screening
  //    (pending=0, conflicting=0, needsFinal > 0, finalized could be partial)
  //    Simplified: if no pending and no conflicting → suggest abstract screening for uncertain items
  //    But we need to differentiate "title done, abstract not started" from "abstract in progress"
  //    Per spec: pending=0, title reviewed > 0, abstract reviewed = 0 → abstract screening
  //    Since we don't have basis-level breakdown, we use: pending=0, conflicting=0, needsFinal > 0
  //    as a signal to suggest abstract screening or finalization

  // 3. conflicting > 0: resolve conflicts
  if (rs.conflicting > 0) {
    return {
      next: [
        {
          command: `search-hub review list --session ${sid} --filter conflicting`,
          description: 'Resolve conflicting reviews',
        },
      ],
      seeAlso: [],
    };
  }

  // 4. needs-final > 0, some already finalized → finalization phase
  if (rs.needsFinal > 0 && rs.finalized > 0) {
    return {
      next: [
        {
          command: `search-hub review list --session ${sid} --filter needs-final`,
          description: 'Finalize reviewed items',
        },
      ],
      seeAlso: [],
    };
  }

  // 5. needs-final > 0, none finalized yet → abstract screening phase
  if (rs.needsFinal > 0) {
    return {
      next: [
        {
          command: `search-hub review extract --session ${sid} --basis abstract --filter uncertain --name abstract-screening`,
          description: 'Start abstract screening for uncertain items',
        },
      ],
      seeAlso: [],
    };
  }

  // 6. All finalized
  if (rs.finalized === rs.total) {
    return {
      next: [
        {
          command: `search-hub register ${sid} --reviewed`,
          description: 'Register accepted articles',
        },
      ],
      seeAlso: [],
    };
  }

  return null;
};

const reviewListRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review list') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [],
    seeAlso: [
      {
        command: `search-hub review extract --session ${sid} --name <name>`,
        description: 'Extract subset for review',
      },
    ],
  };
};

const reviewExtractRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review extract') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  const name = ctx.extractName ?? '<name>';
  return {
    next: [
      {
        command: `search-hub review mark --file <path> ...`,
        description: 'Record decisions (AI/CLI)',
      },
      {
        command: `search-hub review merge --session ${sid} --name ${name}`,
        description: 'Merge review results',
      },
    ],
    seeAlso: [],
  };
};

const reviewMergeRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review merge') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [
      {
        command: `search-hub review status --session ${sid}`,
        description: 'Check progress',
      },
    ],
    seeAlso: [],
  };
};

const reviewExportRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review export') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [],
    seeAlso: [
      {
        command: `search-hub register ${sid} --reviewed`,
        description: 'Register with reference-manager',
      },
    ],
  };
};

// Phase 5: Registration & Export rules

const exportRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'export') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  if (ctx.hasReviews === false) {
    return {
      next: [],
      seeAlso: [
        {
          command: `search-hub review init --session ${sid}`,
          description: 'Start review workflow',
        },
      ],
    };
  }
  return { next: [], seeAlso: [] };
};

const registerRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'register') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  if (ctx.hasReviews === false) {
    return {
      next: [],
      seeAlso: [
        {
          command: `search-hub review init --session ${sid}`,
          description: 'Start systematic review',
        },
      ],
    };
  }
  // Terminal state: no suggestions
  return null;
};

const notesRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'notes add' && ctx.command !== 'notes assess') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [],
    seeAlso: [{ command: `search-hub notes list ${sid}`, description: 'View notes' }],
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
  // Phase 4
  reviewInitRule,
  reviewStatusRule,
  reviewListRule,
  reviewExtractRule,
  reviewMergeRule,
  reviewExportRule,
  // Phase 5
  exportRule,
  registerRule,
  notesRule,
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
