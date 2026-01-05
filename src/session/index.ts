/**
 * Session module for search-hub.
 *
 * Provides session management functionality including:
 * - Session creation and persistence
 * - Session loading and listing
 * - Session updates and status tracking
 * - Resume logic for interrupted searches
 * - Event logging
 */

// Types
export type {
  SessionFile,
  SessionSummary,
  SessionStatus,
  DatabaseStatus,
  DatabaseStatusType,
  DatabaseError,
  PaginationState,
  ProviderName,
  LogEvent,
  LogEventType,
  ResumableProvider,
  ResumeStrategy,
} from './types';

// Manager functions
export {
  createSession,
  loadSession,
  listSessions,
  sessionExists,
  saveSession,
  updateDatabaseStatus,
  updateSessionStatus,
  getResumableProviders,
  generateSessionId,
  sanitizeName,
  type CreateSessionOptions,
} from './manager';

// Logger
export { SessionLogger } from './logger';
