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
  /** Output file path (for query init) */
  outputFile?: string | undefined;
  /** Whether validation succeeded (for query validate) */
  validationSuccess?: boolean | undefined;
}

/**
 * A suggestion rule function that evaluates context and returns suggestions.
 */
export type SuggestionRule = (ctx: SuggestionContext) => SuggestionResult | null;
