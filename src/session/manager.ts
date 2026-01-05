/**
 * Session manager for search-hub.
 *
 * Handles session CRUD operations including:
 * - Session ID generation
 * - Session creation and persistence
 * - Session loading and listing
 * - Session updates and status management
 */

import { mkdir, writeFile, readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  SessionFile,
  DatabaseStatus,
  ProviderName,
  SessionSummary,
  SessionStatus,
  ResumableProvider,
  ResumeStrategy,
} from './types';

/**
 * Options for creating a new session.
 */
export interface CreateSessionOptions {
  name: string;
  description?: string;
  queryFile: string;
  queryContent: string;
  queryHash: string;
  targets: ProviderName[];
  sessionsDir: string;
}

/**
 * Sanitize a name for use in session ID.
 * Converts to lowercase, replaces spaces with dashes, removes special characters.
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric except dashes
    .replace(/-+/g, '-') // Collapse multiple dashes
    .replace(/^-|-$/g, ''); // Trim dashes from start/end
}

/**
 * Generate a session ID in the format: {date}_{name}_{hash}
 * - date: YYYYMMDD format
 * - name: Sanitized query name
 * - hash: First 6 characters of query hash
 */
export function generateSessionId(
  queryName: string,
  queryHash: string
): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = sanitizeName(queryName);
  const hash = queryHash.slice(0, 6);
  return `${date}_${name}_${hash}`;
}

/**
 * Create initial database status for a provider.
 */
function createInitialDatabaseStatus(provider: ProviderName): DatabaseStatus {
  return {
    status: 'pending',
    files: {
      query: `query_${provider}.txt`,
      results: `results_${provider}.jsonl`,
    },
  };
}

/**
 * Create a new session.
 */
export async function createSession(
  options: CreateSessionOptions
): Promise<SessionFile> {
  const { name, description, queryFile, queryContent, queryHash, targets, sessionsDir } =
    options;

  const id = generateSessionId(name, queryHash);
  const sessionDir = join(sessionsDir, id);
  const now = new Date().toISOString();

  // Create session directory
  await mkdir(sessionDir, { recursive: true });

  // Create database statuses
  const databases: Partial<Record<ProviderName, DatabaseStatus>> = {};
  for (const target of targets) {
    databases[target] = createInitialDatabaseStatus(target);
  }

  // Create session file
  const sessionFile: SessionFile = {
    version: 1,
    id,
    name,
    ...(description && { description }),
    createdAt: now,
    updatedAt: now,
    query: {
      file: queryFile,
      hash: queryHash,
      targets,
    },
    databases,
    summary: {
      totalHits: 0,
      totalRetrieved: 0,
      status: 'created',
    },
  };

  // Write session.json
  await writeFile(
    join(sessionDir, 'session.json'),
    JSON.stringify(sessionFile, null, 2),
    'utf-8'
  );

  // Write query file copy
  await writeFile(join(sessionDir, 'query_common.yaml'), queryContent, 'utf-8');

  return sessionFile;
}

/**
 * Check if a session exists.
 */
export async function sessionExists(
  sessionId: string,
  sessionsDir: string
): Promise<boolean> {
  try {
    await access(join(sessionsDir, sessionId, 'session.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load an existing session by ID.
 */
export async function loadSession(
  sessionId: string,
  sessionsDir: string
): Promise<SessionFile> {
  const sessionPath = join(sessionsDir, sessionId, 'session.json');

  try {
    const content = await readFile(sessionPath, 'utf-8');
    return JSON.parse(content) as SessionFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Session not found: ${sessionId}`);
    }
    throw error;
  }
}

/**
 * List all sessions.
 */
export async function listSessions(sessionsDir: string): Promise<SessionSummary[]> {
  let entries: string[];

  try {
    entries = await readdir(sessionsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const summaries: SessionSummary[] = [];

  for (const entry of entries) {
    try {
      const session = await loadSession(entry, sessionsDir);
      summaries.push({
        id: session.id,
        name: session.name,
        status: session.summary.status,
        createdAt: session.createdAt,
        totalHits: session.summary.totalHits,
        totalRetrieved: session.summary.totalRetrieved,
      });
    } catch {
      // Skip directories that don't contain valid sessions
    }
  }

  return summaries;
}

/**
 * Calculate summary totals from all database statuses.
 */
function calculateSummaryTotals(databases: Partial<Record<ProviderName, DatabaseStatus>>): {
  totalHits: number;
  totalRetrieved: number;
} {
  let totalHits = 0;
  let totalRetrieved = 0;

  for (const db of Object.values(databases)) {
    if (db) {
      totalHits += db.totalHits ?? 0;
      totalRetrieved += db.retrievedCount ?? 0;
    }
  }

  return { totalHits, totalRetrieved };
}

/**
 * Save a session to disk.
 */
export async function saveSession(
  session: SessionFile,
  sessionsDir: string
): Promise<void> {
  const sessionPath = join(sessionsDir, session.id, 'session.json');
  await writeFile(sessionPath, JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Update the status of a specific database within a session.
 * Also updates summary totals and updatedAt timestamp.
 */
export async function updateDatabaseStatus(
  sessionId: string,
  provider: ProviderName,
  status: Partial<DatabaseStatus>,
  sessionsDir: string
): Promise<void> {
  const session = await loadSession(sessionId, sessionsDir);

  // Merge the new status with the existing status
  const existingStatus = session.databases[provider];
  if (!existingStatus) {
    throw new Error(`Database ${provider} not found in session ${sessionId}`);
  }

  session.databases[provider] = {
    ...existingStatus,
    ...status,
  };

  // Recalculate summary totals
  const { totalHits, totalRetrieved } = calculateSummaryTotals(session.databases);
  session.summary.totalHits = totalHits;
  session.summary.totalRetrieved = totalRetrieved;

  // Update timestamp
  session.updatedAt = new Date().toISOString();

  await saveSession(session, sessionsDir);
}

/**
 * Update the overall session status.
 */
export async function updateSessionStatus(
  sessionId: string,
  status: SessionStatus,
  sessionsDir: string
): Promise<void> {
  const session = await loadSession(sessionId, sessionsDir);

  session.summary.status = status;
  session.updatedAt = new Date().toISOString();

  await saveSession(session, sessionsDir);
}

/**
 * Get providers that can be resumed based on the resume logic:
 * - pending: start fresh
 * - in_progress: continue from cursor
 * - failed with retryable: retry from start
 * - completed/skipped/failed without retryable: skip
 */
export function getResumableProviders(session: SessionFile): ResumableProvider[] {
  const resumable: ResumableProvider[] = [];

  for (const [providerName, dbStatus] of Object.entries(session.databases)) {
    if (!dbStatus) continue;

    const provider = providerName as ProviderName;
    let strategy: ResumeStrategy | null = null;
    let cursor: string | null | undefined;
    let pageNumber: number | undefined;

    switch (dbStatus.status) {
      case 'pending':
        strategy = 'fresh';
        break;

      case 'in_progress':
        strategy = 'continue';
        cursor = dbStatus.pagination?.cursor;
        pageNumber = dbStatus.pagination?.pageNumber;
        break;

      case 'failed':
        if (dbStatus.error?.retryable) {
          strategy = 'retry';
        }
        break;

      case 'completed':
      case 'skipped':
        // Skip these - nothing to resume
        break;
    }

    if (strategy) {
      const resumableProvider: ResumableProvider = {
        provider,
        strategy,
      };

      if (cursor !== undefined) {
        resumableProvider.cursor = cursor;
      }

      if (pageNumber !== undefined) {
        resumableProvider.pageNumber = pageNumber;
      }

      resumable.push(resumableProvider);
    }
  }

  return resumable;
}
