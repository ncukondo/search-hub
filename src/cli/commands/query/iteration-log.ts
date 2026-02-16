/**
 * Query iteration log I/O.
 *
 * Reads and appends entries to a search iteration log file
 * that lives alongside the query YAML file.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { CountResult, PreviewResult } from '../search.js';

// ── Types ───────────────────────────────────────────────────────────

export interface CountLogEntry {
  date: string;
  type: 'count';
  query_hash: string;
  counts: Record<string, number>;
  total: number;
}

export interface PreviewLogEntry {
  date: string;
  type: 'preview';
  query_hash: string;
  counts: Record<string, number>;
  total: number;
  titles: Record<string, string[]>;
}

export interface AssessmentLogEntry {
  date: string;
  type: 'assessment';
  verdict?: string;
  precision?: string;
  comment?: string;
}

export type LogEntry = CountLogEntry | PreviewLogEntry | AssessmentLogEntry;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Derive the log file path from a query file path.
 * `{dir}/{basename}.yaml` → `{dir}/{basename}.search-log.yaml`
 */
export function getLogFilePath(queryFilePath: string): string {
  const dir = dirname(queryFilePath);
  const base = basename(queryFilePath).replace(/\.ya?ml$/, '');
  const logName = `${base}.search-log.yaml`;
  return dir === '.' ? logName : join(dir, logName);
}

/**
 * Generate a timestamp in "YYYY-MM-DD HH:mm" format.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Compute a short hash of the query file content.
 * Uses the same algorithm as session creation (SHA-256, first 8 hex chars).
 */
export function computeQueryHash(queryContent: string): string {
  return createHash('sha256').update(queryContent).digest('hex').slice(0, 8);
}

/**
 * Build a CountLogEntry from count-only results.
 */
export function buildCountLogEntry(
  queryHash: string,
  results: CountResult[],
): CountLogEntry {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const r of results) {
    if (!r.error) {
      counts[r.provider] = r.count;
      total += r.count;
    }
  }
  return {
    date: formatTimestamp(),
    type: 'count',
    query_hash: queryHash,
    counts,
    total,
  };
}

/**
 * Build a PreviewLogEntry from preview results.
 * Stores at most `maxTitles` titles per provider to avoid log bloat.
 */
export function buildPreviewLogEntry(
  queryHash: string,
  results: PreviewResult[],
  maxTitles = 5,
): PreviewLogEntry {
  const counts: Record<string, number> = {};
  const titles: Record<string, string[]> = {};
  let total = 0;
  for (const r of results) {
    if (!r.error) {
      counts[r.provider] = r.count;
      total += r.count;
      if (r.titles.length > 0) {
        titles[r.provider] = r.titles.slice(0, maxTitles);
      }
    }
  }
  return {
    date: formatTimestamp(),
    type: 'preview',
    query_hash: queryHash,
    counts,
    total,
    titles,
  };
}

// ── Read / Write ────────────────────────────────────────────────────

/**
 * Read raw content of the log file, preserving comments.
 * Returns null when the file does not exist.
 */
async function readRawLog(logPath: string): Promise<string | null> {
  try {
    return await readFile(logPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Read log entries from the iteration log file for a given query file.
 * Returns an empty array when the log file does not exist or is empty.
 */
export async function readLogEntries(queryFilePath: string): Promise<LogEntry[]> {
  const logPath = getLogFilePath(queryFilePath);
  const content = await readRawLog(logPath);

  if (content === null || !content.trim()) {
    return [];
  }

  const parsed = parse(content);

  // YAML with only comments parses to null
  if (parsed === null || parsed === undefined) {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as LogEntry[];
}

/**
 * Append a log entry to the iteration log file.
 * Creates the file with a header comment if it does not exist.
 */
export async function appendLogEntry(
  queryFilePath: string,
  entry: LogEntry,
): Promise<void> {
  const logPath = getLogFilePath(queryFilePath);
  const queryBasename = basename(queryFilePath);
  const existing = await readRawLog(logPath);

  // Stringify the single entry as a YAML sequence item
  const entryYaml = stringify([entry], { lineWidth: 0 }).trimEnd();

  let content: string;
  if (existing === null) {
    const header =
      `# Search iteration log for ${queryBasename}\n` +
      `# Auto-generated by search-hub. You can also edit this file manually.\n\n`;
    content = header + entryYaml + '\n';
  } else {
    const trimmed = existing.trimEnd();
    content = trimmed + '\n\n' + entryYaml + '\n';
  }

  await writeFile(logPath, content, 'utf-8');
}
