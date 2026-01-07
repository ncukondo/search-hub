/**
 * CLI Exit Codes
 *
 * These codes indicate the type of error that occurred.
 */
export const EXIT_CODES = {
  /** Operation completed successfully */
  SUCCESS: 0,
  /** General/unexpected error */
  GENERAL_ERROR: 1,
  /** Configuration error (missing config, invalid config, etc.) */
  CONFIG_ERROR: 2,
  /** Query validation error (invalid YAML, invalid query syntax) */
  QUERY_ERROR: 3,
  /** Network/API error (connection failure, API rate limit, etc.) */
  NETWORK_ERROR: 4,
  /** Session error (session not found, invalid session state, etc.) */
  SESSION_ERROR: 5,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Exit code descriptions for help output.
 */
export const EXIT_CODE_DESCRIPTIONS: Record<ExitCode, string> = {
  [EXIT_CODES.SUCCESS]: 'Success',
  [EXIT_CODES.GENERAL_ERROR]: 'General error',
  [EXIT_CODES.CONFIG_ERROR]: 'Configuration error',
  [EXIT_CODES.QUERY_ERROR]: 'Query validation error',
  [EXIT_CODES.NETWORK_ERROR]: 'Network/API error',
  [EXIT_CODES.SESSION_ERROR]: 'Session error',
};
