import type { SessionStatus } from '../../session/types.js';
import type { ReviewStatusResult } from '../commands/review/status.js';

/**
 * A single suggestion item with command and description.
 */
export interface Suggestion {
  /** Executable command string */
  command: string;
  /** Inline comment describing the purpose */
  description: string;
}

/**
 * Result of evaluating suggestion rules.
 */
export interface SuggestionResult {
  /** Primary next steps (1-2 items) */
  next: Suggestion[];
  /** Alternative paths (0-2 items) */
  seeAlso: Suggestion[];
  /** Tip displayed before Next (plain text) */
  tip?: string;
}

/**
 * Context passed to suggestion rules for evaluation.
 */
export interface SuggestionContext {
  /** The command that was executed */
  command: string;
  /** Session ID (if applicable) */
  sessionId?: string | undefined;
  /** Session status */
  sessionStatus?: SessionStatus | undefined;
  /** Review status (with basis-level breakdown) */
  reviewStatus?: ReviewStatusResult | undefined;
  /** Number of existing sessions */
  sessionCount?: number | undefined;
  /** Whether reviews.yaml exists */
  hasReviews?: boolean | undefined;
  /** Query file path */
  queryFile?: string | undefined;
  /** Extract --name value */
  extractName?: string | undefined;
  /** Number of articles extracted in current batch */
  extractedCount?: number | undefined;
  /** Total articles matching the filter */
  totalMatching?: number | undefined;
  /** Limit used in extract */
  extractLimit?: number | undefined;
  /** Offset used in extract */
  extractOffset?: number | undefined;
  /** Output file path (for query init) */
  outputFile?: string | undefined;
  /** Whether validation succeeded (for query validate) */
  validationSuccess?: boolean | undefined;
  /** Whether the query file has a $schema link */
  hasSchemaLink?: boolean | undefined;
  /** Number of added articles in diff result */
  diffAddedCount?: number | undefined;
  /** Number of removed articles in diff result */
  diffRemovedCount?: number | undefined;
  /** Session 1 ID for diff command */
  diffSession1Id?: string | undefined;
}

/**
 * A suggestion rule function that evaluates context and returns suggestions.
 */
export type SuggestionRule = (ctx: SuggestionContext) => SuggestionResult | null;
