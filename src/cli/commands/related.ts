/**
 * Related command for finding related articles via PubMed ELink.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { stringify as stringifyYaml } from 'yaml';
import type { Article } from '../../providers/base/types.js';
import type { SessionFile, SessionSeeds } from '../../session/types.js';
import type { DatabaseStatus } from '../../session/types.js';
import { loadSession } from '../../session/manager.js';
import { sanitizeName } from '../../session/manager.js';
import { convertResultsToYaml } from '../../session/results-io.js';
import { loadSessionArticles } from './session-utils.js';

/**
 * Parsed options for the related command.
 */
export interface RelatedCommandOptions {
  pmids: string[];
  name?: string;
  maxResults: number;
  fromSession?: string;
  term?: string;
}

/**
 * CLI option types from Commander.js.
 */
export interface CommandLineOptions {
  name?: string;
  maxResults?: string;
  fromSession?: string;
  pmid?: string | string[];
  term?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Options for creating a related session.
 */
export interface CreateRelatedSessionOptions {
  name: string;
  seeds: SessionSeeds;
  articles: Article[];
  sessionsDir: string;
}

/**
 * Data for formatting related output.
 */
export interface RelatedOutputData {
  sessionId: string;
  seedCount: number;
  totalRelated: number;
  retrievedCount: number;
  articles: Article[];
}

/**
 * Parse command line options into RelatedCommandOptions.
 */
export function parseRelatedOptions(
  pmidArgs: string[],
  options: CommandLineOptions,
): RelatedCommandOptions {
  const result: RelatedCommandOptions = {
    pmids: [...pmidArgs],
    maxResults: 20,
  };

  // --pmid option (alternative to positional args, required with --from-session)
  if (options.pmid) {
    const pmidOption = Array.isArray(options.pmid) ? options.pmid : [options.pmid];
    result.pmids = [...result.pmids, ...pmidOption];
  }

  if (options.name) {
    result.name = options.name;
  }

  if (options.maxResults) {
    result.maxResults = parseInt(options.maxResults, 10);
  }

  if (options.fromSession) {
    result.fromSession = options.fromSession;
  }

  if (options.term) {
    result.term = options.term;
  }

  return result;
}

/**
 * Validate related command input.
 */
export function validateRelatedInput(options: RelatedCommandOptions): ValidationResult {
  if (options.pmids.length === 0 && !options.fromSession) {
    return {
      valid: false,
      error: 'At least one PMID is required. Provide PMIDs as arguments or use --from-session.',
    };
  }

  // Validate PMID format (numeric strings)
  for (const pmid of options.pmids) {
    if (!/^\d+$/.test(pmid)) {
      return {
        valid: false,
        error: `Invalid PMID format: "${pmid}". PMIDs must be numeric.`,
      };
    }
  }

  if (options.maxResults <= 0) {
    return {
      valid: false,
      error: '--max-results must be a positive number.',
    };
  }

  return { valid: true };
}

/**
 * Resolve seed PMIDs from options and/or existing session.
 */
export async function resolveSeeds(
  options: RelatedCommandOptions,
  sessionsDir: string,
): Promise<string[]> {
  if (!options.fromSession) {
    return options.pmids;
  }

  // Load articles from the source session
  const session = await loadSession(options.fromSession, sessionsDir);
  const articles = await loadSessionArticles(session, options.fromSession, sessionsDir);

  // Extract PMIDs from session articles
  const sessionPmids = new Set<string>();
  for (const article of articles) {
    if (article.pmid) {
      sessionPmids.add(article.pmid);
    }
  }

  if (options.pmids.length === 0) {
    // No specific PMIDs requested, return all from session
    return [...sessionPmids];
  }

  // Validate that requested PMIDs exist in the session
  const missing = options.pmids.filter((pmid) => !sessionPmids.has(pmid));
  if (missing.length > 0) {
    throw new Error(`PMIDs not found in session "${options.fromSession}": ${missing.join(', ')}`);
  }

  return options.pmids;
}

/**
 * Generate a session ID for a related session.
 */
function generateRelatedSessionId(name: string, seeds: string[]): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const sanitized = sanitizeName(name);
  const hash = createHash('sha256').update(seeds.join(',')).digest('hex').slice(0, 6);
  return `${date}_${sanitized}_${hash}`;
}

/**
 * Create a related session on disk.
 */
export async function createRelatedSession(
  options: CreateRelatedSessionOptions,
): Promise<SessionFile> {
  const { name, seeds, articles, sessionsDir } = options;

  const id = generateRelatedSessionId(name, seeds.ids);
  const sessionDir = join(sessionsDir, id);
  const now = new Date().toISOString();

  await mkdir(sessionDir, { recursive: true });

  // Write JSONL results (use {provider}_results convention for loadResults compatibility)
  const jsonlFilename = 'pubmed_results.jsonl';
  const yamlFilename = 'pubmed_results.yaml';
  const jsonlPath = join(sessionDir, jsonlFilename);

  const jsonlContent = articles.map((a) => JSON.stringify(a)).join('\n') + '\n';
  await writeFile(jsonlPath, jsonlContent, 'utf-8');

  // Convert to YAML
  const yamlPath = join(sessionDir, yamlFilename);
  await convertResultsToYaml(jsonlPath, yamlPath, {
    provider: 'pubmed',
    queryName: name,
  });

  // Build database status
  const databases: Partial<Record<string, DatabaseStatus>> = {
    pubmed: {
      status: 'completed',
      retrievedCount: articles.length,
      files: {
        query: '',
        results: jsonlFilename,
        resultsYaml: yamlFilename,
      },
    },
  };

  // Create session file
  const sessionFile: SessionFile = {
    version: 1,
    id,
    name,
    type: 'related',
    createdAt: now,
    updatedAt: now,
    seeds,
    databases,
    summary: {
      totalHits: 0,
      totalRetrieved: articles.length,
      status: 'completed',
    },
  };

  // Write session.yaml
  await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(sessionFile), 'utf-8');

  return sessionFile;
}

/**
 * Format related search output for display.
 */
export function formatRelatedOutput(data: RelatedOutputData): string {
  const lines: string[] = [];

  lines.push(`Related session: ${data.sessionId}`);
  lines.push('');
  lines.push(`Seeds: ${data.seedCount} PMIDs`);
  lines.push(`Related found: ${data.totalRelated}`);
  lines.push(`Retrieved: ${data.retrievedCount}`);

  if (data.articles.length > 0) {
    lines.push('');
    lines.push('Top results:');
    const maxDisplay = Math.min(data.articles.length, 10);
    for (let i = 0; i < maxDisplay; i++) {
      const article = data.articles[i]!;
      const title =
        article.title.length > 70 ? article.title.substring(0, 67) + '...' : article.title;
      lines.push(`  ${i + 1}. ${title}`);
    }
    if (data.articles.length > maxDisplay) {
      lines.push(`  ... and ${data.articles.length - maxDisplay} more`);
    }
  }

  return lines.join('\n');
}
