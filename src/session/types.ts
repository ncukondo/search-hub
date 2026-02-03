/**
 * Session types for search-hub.
 *
 * These types define the structure of session data, including:
 * - Session status and lifecycle
 * - Database-specific status and pagination
 * - Event logging
 */

// Import and re-export ProviderName from the authoritative source
import type { ProviderName } from '../providers/base/types.js';
export type { ProviderName };

/**
 * Overall session status.
 */
export type SessionStatus =
  | 'created'
  | 'running'
  | 'completed'
  | 'partial'
  | 'failed';

/**
 * Status for individual database searches.
 */
export type DatabaseStatusType =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Pagination state for resumable searches.
 */
export interface PaginationState {
  cursor: string | null;
  pageNumber: number;
  isComplete: boolean;
}

/**
 * Error information for failed searches.
 */
export interface DatabaseError {
  code: string;
  message: string;
  retryable: boolean;
}

/**
 * Status of a database search within a session.
 */
export interface DatabaseStatus {
  status: DatabaseStatusType;
  startedAt?: string;
  completedAt?: string;
  totalHits?: number;
  retrievedCount?: number;
  pagination?: PaginationState;
  error?: DatabaseError;
  files: {
    query: string;
    results: string;
    /** Human-readable YAML results file (present when search is completed) */
    resultsYaml?: string;
  };
}

/**
 * Session file structure (session.json).
 */
export interface SessionFile {
  version: 1;
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  query: {
    file: string;
    hash: string;
    targets: ProviderName[];
  };
  databases: Partial<Record<ProviderName, DatabaseStatus>>;
  summary: {
    totalHits: number;
    totalRetrieved: number;
    status: SessionStatus;
  };
}

/**
 * Session summary for listing.
 */
export interface SessionSummary {
  id: string;
  name: string;
  status: SessionStatus;
  createdAt: string;
  totalHits: number;
  totalRetrieved: number;
}

/**
 * Log event types.
 */
export type LogEventType =
  | 'session_created'
  | 'search_started'
  | 'page_fetched'
  | 'rate_limited'
  | 'retry'
  | 'search_completed'
  | 'search_failed'
  | 'session_completed'
  | 'session_resumed';

/**
 * Base log event structure.
 */
interface BaseLogEvent {
  ts: string;
}

/**
 * Session created event.
 */
interface SessionCreatedEvent extends BaseLogEvent {
  event: 'session_created';
  data: { id: string; query: string };
}

/**
 * Search started event.
 */
interface SearchStartedEvent extends BaseLogEvent {
  event: 'search_started';
  provider: ProviderName;
}

/**
 * Page fetched event.
 */
interface PageFetchedEvent extends BaseLogEvent {
  event: 'page_fetched';
  provider: ProviderName;
  page: number;
  count: number;
  cursor?: string;
}

/**
 * Rate limited event.
 */
interface RateLimitedEvent extends BaseLogEvent {
  event: 'rate_limited';
  provider: ProviderName;
  waitMs: number;
}

/**
 * Retry event.
 */
interface RetryEvent extends BaseLogEvent {
  event: 'retry';
  provider: ProviderName;
  attempt: number;
  reason: string;
}

/**
 * Search completed event.
 */
interface SearchCompletedEvent extends BaseLogEvent {
  event: 'search_completed';
  provider: ProviderName;
  total: number;
  duration: number;
}

/**
 * Search failed event.
 */
interface SearchFailedEvent extends BaseLogEvent {
  event: 'search_failed';
  provider: ProviderName;
  error: string;
}

/**
 * Session completed event.
 */
interface SessionCompletedEvent extends BaseLogEvent {
  event: 'session_completed';
  summary: { totalHits: number; totalRetrieved: number };
}

/**
 * Session resumed event.
 */
interface SessionResumedEvent extends BaseLogEvent {
  event: 'session_resumed';
  fromProvider: ProviderName;
  fromPage: number;
}

/**
 * Union of all log event types.
 */
export type LogEvent =
  | SessionCreatedEvent
  | SearchStartedEvent
  | PageFetchedEvent
  | RateLimitedEvent
  | RetryEvent
  | SearchCompletedEvent
  | SearchFailedEvent
  | SessionCompletedEvent
  | SessionResumedEvent;

/**
 * Resume strategy for a provider.
 */
export type ResumeStrategy = 'fresh' | 'retry' | 'continue';

/**
 * Information about a provider that can be resumed.
 */
export interface ResumableProvider {
  provider: ProviderName;
  strategy: ResumeStrategy;
  cursor?: string | null;
  pageNumber?: number;
}
