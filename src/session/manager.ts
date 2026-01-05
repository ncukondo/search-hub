/**
 * Session manager for search-hub.
 *
 * Handles session CRUD operations including:
 * - Session ID generation
 * - Session creation and persistence
 * - Session loading and listing
 * - Session updates and status management
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionFile, DatabaseStatus, ProviderName } from './types';

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
