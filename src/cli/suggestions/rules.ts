import type { SuggestionContext, SuggestionResult, SuggestionRule } from './types.js';
import {
  computeBatchContinuation,
  generateReviewNextSteps,
} from '../commands/review/next-steps.js';

// Phase 1: Query Preparation rules

const queryInitRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query init') return null;
  const file = ctx.outputFile ?? '.search-hub/queries/query.yaml';
  return {
    next: [
      { command: `$EDITOR ${file}`, description: 'Edit your query' },
      { command: `search-hub query validate ${file}`, description: 'Validate query' },
      { command: `search-hub search ${file} --count-only`, description: 'Check hit counts' },
    ],
    seeAlso: [],
  };
};

const queryValidateRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query validate') return null;
  const file = ctx.queryFile ?? '<query-file>';

  if (ctx.validationSuccess === false) {
    const next = [{ command: `$EDITOR ${file}`, description: 'Fix errors and re-validate' }];

    if (ctx.hasSchemaLink === false) {
      return {
        next,
        or: {
          label: 'Or create a new query from the template',
          items: [{ command: 'search-hub query init "<title>"', description: '' }],
        },
        seeAlso: [],
      };
    }

    return { next, seeAlso: [] };
  }

  const next = [
    { command: `search-hub search ${file} --dry-run`, description: 'Check DB translations' },
    {
      command: `search-hub search ${file} --preview`,
      description: 'Preview hit counts + sample titles',
    },
  ];

  if (ctx.hasSchemaLink === false) {
    return {
      tip:
        'Tip: Start from a template to get $schema support and usage examples:\n' +
        '     search-hub query init "<title>"',
      next,
      seeAlso: [],
    };
  }

  return { next, seeAlso: [] };
};

const queryTranslateRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query translate') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [
      {
        command: `search-hub search ${file} --preview`,
        description: 'Preview hit counts + sample titles',
      },
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
      if (ctx.previousSessionId) {
        seeAlso.push({
          command: `search-hub diff ${ctx.previousSessionId} ${sid}`,
          description: 'Compare with previous',
        });
      } else if (ctx.sessionCount !== undefined && ctx.sessionCount > 1) {
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
          {
            command: `search-hub resume ${sid} --retry-failed`,
            description: 'Retry all databases',
          },
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
      {
        command: `search-hub search ${file} --preview`,
        description: 'Preview hit counts + sample titles',
      },
      { command: `search-hub search ${file}`, description: 'Execute search' },
    ],
    seeAlso: [],
  };
};

const searchPreviewRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --preview') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [
      {
        command: `search-hub query assess ${file} --verdict <verdict>`,
        description: 'Record assessment',
      },
      { command: `search-hub search ${file}`, description: 'Execute full search' },
    ],
    seeAlso: [],
  };
};

const searchCountOnlyRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'search --count-only') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [
      { command: `$EDITOR ${file}`, description: 'Edit query to refine' },
      { command: `search-hub search ${file} --count-only`, description: 'Re-check counts' },
      {
        command: `search-hub query assess ${file} --verdict refine`,
        description: 'Record assessment',
      },
    ],
    seeAlso: [{ command: `search-hub search ${file}`, description: 'Execute full search' }],
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
      {
        command: 'search-hub query init "<title>"',
        description: 'Save as YAML for reproducibility',
      },
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
        next: [
          {
            command: `search-hub resume ${sid} --retry-failed`,
            description: 'Retry all databases',
          },
        ],
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
      next: [
        {
          command: `search-hub review status --session ${sid}`,
          description: 'Check review progress',
        },
      ],
      seeAlso: [],
    };
  }
  return {
    next: [
      {
        command: `search-hub review init --session ${sid}`,
        description: 'Start systematic review',
      },
    ],
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
  const seeAlso: SuggestionResult['seeAlso'] = [];

  // Suggest merge when both sessions have unique articles
  if (
    ctx.diffAddedCount !== undefined &&
    ctx.diffAddedCount > 0 &&
    ctx.diffRemovedCount !== undefined &&
    ctx.diffRemovedCount > 0
  ) {
    const sid1 = ctx.diffSession1Id ?? '<session-id-1>';
    seeAlso.push({
      command: `search-hub merge ${sid1} ${sid}`,
      description: 'Combine results from both sessions',
    });
  }

  seeAlso.push({ command: `search-hub results ${sid}`, description: 'View detailed results' });

  return { next: [], seeAlso };
};

const mergeRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'merge') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [
      { command: `search-hub results ${sid}`, description: 'View merged results' },
      { command: `search-hub summary ${sid}`, description: 'View merge statistics' },
    ],
    seeAlso: [],
  };
};

const relatedRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'related') return null;
  const sid = ctx.sessionId ?? '<session-id>';
  return {
    next: [
      { command: `search-hub results ${sid}`, description: 'View related articles' },
      { command: `search-hub review init ${sid}`, description: 'Screen related articles' },
      { command: `search-hub export ${sid}`, description: 'Export results' },
    ],
    seeAlso: [],
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
  const rs = ctx.reviewStatus;
  if (!rs) return null;

  return generateReviewNextSteps({
    sessionId: ctx.sessionId ?? '<session-id>',
    statusResult: rs,
    ...(rs.mode && { mode: rs.mode }),
  });
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
  const result: SuggestionResult = {
    next: [
      {
        command: `search-hub review merge --session ${sid} --name ${name}`,
        description: 'Merge review results',
      },
    ],
    seeAlso: [],
  };

  // Batch continuation: suggest next batch if --limit was used with remaining articles
  if (
    ctx.extractLimit !== undefined &&
    ctx.extractedCount !== undefined &&
    ctx.totalMatching !== undefined
  ) {
    const batch = computeBatchContinuation({
      sessionId: sid,
      extractName: name !== '<name>' ? name : undefined,
      extractedCount: ctx.extractedCount,
      totalMatching: ctx.totalMatching,
      limit: ctx.extractLimit,
      offset: ctx.extractOffset,
    });
    if (batch) result.seeAlso.push(batch);
  }

  return result;
};

const reviewMergeRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review merge') return null;
  const rs = ctx.reviewStatus;
  if (!rs) {
    // Fallback: suggest status check when reviewStatus not available
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
  }

  return generateReviewNextSteps({
    sessionId: ctx.sessionId ?? '<session-id>',
    statusResult: rs,
    ...(rs.mode && { mode: rs.mode }),
  });
};

const reviewFinalizeRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'review finalize') return null;
  const rs = ctx.reviewStatus;
  if (!rs) return null;

  return generateReviewNextSteps({
    sessionId: ctx.sessionId ?? '<session-id>',
    statusResult: rs,
    ...(rs.mode && { mode: rs.mode }),
  });
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

const queryAssessRule: SuggestionRule = (ctx) => {
  if (ctx.command !== 'query assess') return null;
  const file = ctx.queryFile ?? '<query-file>';
  return {
    next: [{ command: `search-hub query log ${file}`, description: 'View iteration history' }],
    seeAlso: [{ command: `$EDITOR ${file}`, description: 'Edit query and re-run count' }],
  };
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
  mergeRule,
  relatedRule,
  // Phase 4
  reviewInitRule,
  reviewStatusRule,
  reviewListRule,
  reviewExtractRule,
  reviewMergeRule,
  reviewFinalizeRule,
  reviewExportRule,
  // Query iteration
  queryAssessRule,
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
