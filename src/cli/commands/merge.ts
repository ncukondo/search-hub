import { mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { stringify as stringifyYaml } from 'yaml';
import type { Article, ProviderName } from '../../providers/base/types.js';
import type { SessionFile, SessionSource, DatabaseStatus } from '../../session/types.js';
import { isMergedSession } from '../../session/types.js';
import { sanitizeName } from '../../session/manager.js';
import { convertResultsToYaml } from '../../session/results-io.js';
import { getArticleKeys } from './session-utils.js';

/**
 * Result of merging articles from multiple sessions.
 */
export interface MergeResult {
  /** All unique articles after deduplication */
  articles: Article[];
  /** Articles grouped by provider */
  byProvider: Map<ProviderName, Article[]>;
  /** Total article count before deduplication */
  totalBefore: number;
  /** Total unique article count after deduplication */
  totalAfter: number;
  /** Number of duplicates removed */
  duplicatesRemoved: number;
  /** Per-session article counts (before dedup) */
  perSession: Map<string, number>;
}

/**
 * Options for creating a merged session.
 */
export interface CreateMergedSessionOptions {
  name: string;
  sources: SessionSource[];
  byProvider: Map<ProviderName, Article[]>;
  totalRetrieved: number;
  sessionsDir: string;
  sourceSessionIds: string[];
}

/**
 * Validation result for merge sources.
 */
export interface MergeValidationResult {
  valid: boolean;
  error?: string;
  expandedCommand?: string;
}

/**
 * Output data for formatting merge results.
 */
export interface MergeOutputData {
  sessionId: string;
  totalBefore: number;
  totalAfter: number;
  duplicatesRemoved: number;
  sources: Array<{ id: string; name: string; count: number }>;
  byProvider: Map<string, number>;
}

/**
 * Count metadata fields for comparing article richness.
 */
function countMetadataFields(article: Article): number {
  let count = 0;
  if (article.doi) count++;
  if (article.pmid) count++;
  if (article.arxivId) count++;
  if (article.scopusId) count++;
  if (article.ericId) count++;
  if (article.abstract) count++;
  if (article.publicationDate) count++;
  if (article.journal) count++;
  if (article.volume) count++;
  if (article.issue) count++;
  if (article.pages) count++;
  if (article.authors.length > 0) count++;
  return count;
}

/**
 * Merge articles from multiple sessions with identifier-based deduplication.
 *
 * When duplicates are found (same DOI, PMID, etc.), the article with
 * richer metadata is kept.
 */
export function mergeArticles(sessionArticles: Map<string, Article[]>): MergeResult {
  const keyToIndex = new Map<string, number>();
  const unique: Article[] = [];
  let totalBefore = 0;
  let duplicatesRemoved = 0;
  const perSession = new Map<string, number>();

  for (const [sessionId, articles] of sessionArticles) {
    perSession.set(sessionId, articles.length);
    totalBefore += articles.length;

    for (const article of articles) {
      const keys = getArticleKeys(article);

      if (keys.length === 0) {
        unique.push(article);
        continue;
      }

      let existingIndex: number | undefined;
      for (const key of keys) {
        const idx = keyToIndex.get(key);
        if (idx !== undefined) {
          existingIndex = idx;
          break;
        }
      }

      if (existingIndex !== undefined) {
        const existing = unique[existingIndex]!;
        if (countMetadataFields(article) > countMetadataFields(existing)) {
          unique[existingIndex] = article;
          const newKeys = getArticleKeys(article);
          for (const key of newKeys) {
            keyToIndex.set(key, existingIndex);
          }
        }
        duplicatesRemoved++;
      } else {
        const index = unique.length;
        unique.push(article);
        for (const key of keys) {
          keyToIndex.set(key, index);
        }
      }
    }
  }

  // Group by provider
  const byProvider = new Map<ProviderName, Article[]>();
  for (const article of unique) {
    const existing = byProvider.get(article.source) ?? [];
    existing.push(article);
    byProvider.set(article.source, existing);
  }

  return {
    articles: unique,
    byProvider,
    totalBefore,
    totalAfter: unique.length,
    duplicatesRemoved,
    perSession,
  };
}

/**
 * Copy source session provenance files to sources/ subdirectory.
 * Copies session.yaml, query_common.yaml, and query text files.
 */
export async function copySourceProvenance(
  sourceSessionId: string,
  sessionsDir: string,
  mergedSessionDir: string,
): Promise<void> {
  const sourceDir = join(sessionsDir, sourceSessionId);
  const targetDir = join(mergedSessionDir, 'sources', sourceSessionId);
  await mkdir(targetDir, { recursive: true });

  // Copy session.yaml and query_common.yaml
  for (const file of ['session.yaml', 'query_common.yaml']) {
    try {
      await copyFile(join(sourceDir, file), join(targetDir, file));
    } catch {
      // Skip if file doesn't exist
    }
  }

  // Copy query text files (query_*.txt)
  const entries = await readdir(sourceDir);
  for (const entry of entries) {
    if (entry.startsWith('query_') && entry.endsWith('.txt')) {
      await copyFile(join(sourceDir, entry), join(targetDir, entry));
    }
  }
}

/**
 * Validate that all source sessions are valid for merging.
 */
export function validateMergeSources(sessions: Map<string, SessionFile>): MergeValidationResult {
  // Check for merged sessions as sources
  for (const [sessionId, session] of sessions) {
    if (isMergedSession(session)) {
      // Collect original sources from the merged session
      const originalSources = session.sources?.map((s) => s.id) ?? [];
      // Collect non-merged session IDs
      const otherIds = [...sessions.keys()].filter((id) => id !== sessionId);
      // Build expanded command with original sources + other sessions
      const allSources = [...new Set([...originalSources, ...otherIds])];
      const expandedCommand = `search-hub merge ${allSources.join(' ')}`;

      return {
        valid: false,
        error: `Session '${sessionId}' is a merged session (sources: ${originalSources.join(', ')}).\n  Merge the original sources directly:\n  ${expandedCommand}`,
        expandedCommand,
      };
    }
  }

  // Check that all sessions are completed
  for (const [sessionId, session] of sessions) {
    if (session.summary.status !== 'completed') {
      return {
        valid: false,
        error: `Session '${sessionId}' is not completed (status: ${session.summary.status}). Only completed sessions can be merged.`,
      };
    }
  }

  return { valid: true };
}

/**
 * Generate a session ID for a merged session.
 */
function generateMergedSessionId(name: string, sourceIds: string[]): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sanitized = sanitizeName(name);
  const hash = createHash('sha256').update(sourceIds.join(',')).digest('hex').slice(0, 6);
  return `${date}_${sanitized}_${hash}`;
}

/**
 * Create a merged session on disk.
 */
export async function createMergedSession(
  options: CreateMergedSessionOptions,
): Promise<SessionFile> {
  const { name, sources, byProvider, totalRetrieved, sessionsDir, sourceSessionIds } = options;

  const id = generateMergedSessionId(name, sourceSessionIds);
  const sessionDir = join(sessionsDir, id);
  const now = new Date().toISOString();

  await mkdir(sessionDir, { recursive: true });

  // Build database statuses and write result files
  const databases: Partial<Record<ProviderName, DatabaseStatus>> = {};

  for (const [provider, articles] of byProvider) {
    const jsonlFilename = `${provider}_results.jsonl`;
    const yamlFilename = `${provider}_results.yaml`;
    const jsonlPath = join(sessionDir, jsonlFilename);

    // Write JSONL results
    const jsonlContent = articles.map((a) => JSON.stringify(a)).join('\n') + '\n';
    await writeFile(jsonlPath, jsonlContent, 'utf-8');

    // Convert to YAML
    const yamlPath = join(sessionDir, yamlFilename);
    await convertResultsToYaml(jsonlPath, yamlPath, {
      provider,
      queryName: name,
    });

    databases[provider] = {
      status: 'completed',
      retrievedCount: articles.length,
      files: {
        query: '',
        results: jsonlFilename,
        resultsYaml: yamlFilename,
      },
    };
  }

  // Create session file
  const sessionFile: SessionFile = {
    version: 1,
    id,
    name,
    type: 'merge',
    createdAt: now,
    updatedAt: now,
    sources,
    databases,
    summary: {
      totalHits: 0,
      totalRetrieved: totalRetrieved,
      status: 'completed',
    },
  };

  // Write session.yaml
  await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(sessionFile), 'utf-8');

  // Copy provenance from source sessions
  for (const sourceId of sourceSessionIds) {
    await copySourceProvenance(sourceId, sessionsDir, sessionDir);
  }

  return sessionFile;
}

/**
 * Format merge result as human-readable text.
 */
export function formatMergeOutput(data: MergeOutputData): string {
  const lines: string[] = [];

  lines.push(`Merged session: ${data.sessionId}`);
  lines.push('');
  lines.push('Sources:');
  for (const source of data.sources) {
    lines.push(`  ${source.id} (${source.name}): ${source.count} articles`);
  }
  lines.push('');
  lines.push(
    `Total articles: ${data.totalBefore} → ${data.totalAfter} unique (${data.duplicatesRemoved} duplicates removed)`,
  );

  if (data.byProvider.size > 0) {
    lines.push('');
    lines.push('By database:');
    for (const [provider, count] of data.byProvider) {
      lines.push(`  ${provider}: ${count} articles`);
    }
  }

  return lines.join('\n');
}

/**
 * Format merge result as JSON.
 */
export function formatMergeJson(data: MergeOutputData): string {
  return JSON.stringify(
    {
      sessionId: data.sessionId,
      totalBefore: data.totalBefore,
      totalAfter: data.totalAfter,
      duplicatesRemoved: data.duplicatesRemoved,
      sources: data.sources,
      byProvider: Object.fromEntries(data.byProvider),
    },
    null,
    2,
  );
}
