/**
 * Coverage check command - verifies known articles are present in session results.
 */

import type { Article, ProviderName } from '../../providers/base/types.js';
import { getArticleKeys } from './session-utils.js';

export interface ParsedIdentifier {
  type: 'doi' | 'pmid' | 'arxiv';
  value: string;
  raw: string;
}

export function parseIdentifierFile(content: string): ParsedIdentifier[] {
  const results: ParsedIdentifier[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const parsed = parseLine(trimmed, i + 1);
    results.push(parsed);
  }

  return results;
}

function parseLine(line: string, lineNumber: number): ParsedIdentifier {
  // Check for explicit prefix (case-insensitive)
  const prefixMatch = line.match(/^(doi|pmid|arxiv):(.+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1]!.toLowerCase() as 'doi' | 'pmid' | 'arxiv';
    return { type: prefix, value: prefixMatch[2]!, raw: line };
  }

  // Auto-detect: starts with "10." → DOI
  if (line.startsWith('10.')) {
    return { type: 'doi', value: line, raw: line };
  }

  // Auto-detect: all digits → PMID
  if (/^\d+$/.test(line)) {
    return { type: 'pmid', value: line, raw: line };
  }

  throw new Error(`Unrecognizable identifier at line ${lineNumber}: ${line}`);
}

export interface FoundItem {
  query: string;
  type: ParsedIdentifier['type'];
  sources: ProviderName[];
  title: string;
}

export interface MissingItem {
  query: string;
  type: ParsedIdentifier['type'];
}

export interface CheckResult {
  total: number;
  foundCount: number;
  missingCount: number;
  coverage: number;
  found: FoundItem[];
  missing: MissingItem[];
}

export function checkCoverage(articles: Article[], identifiers: ParsedIdentifier[]): CheckResult {
  if (identifiers.length === 0) {
    return { total: 0, foundCount: 0, missingCount: 0, coverage: 0, found: [], missing: [] };
  }

  // Build a lookup: key → list of articles with that key
  const keyToArticles = new Map<string, Article[]>();
  for (const article of articles) {
    for (const key of getArticleKeys(article)) {
      const existing = keyToArticles.get(key);
      if (existing) {
        existing.push(article);
      } else {
        keyToArticles.set(key, [article]);
      }
    }
  }

  const found: FoundItem[] = [];
  const missing: MissingItem[] = [];

  for (const id of identifiers) {
    const key = identifierToKey(id);
    const matched = keyToArticles.get(key);

    if (matched && matched.length > 0) {
      const sources = [...new Set(matched.map(a => a.source))];
      found.push({
        query: id.raw,
        type: id.type,
        sources,
        title: matched[0]!.title,
      });
    } else {
      missing.push({ query: id.raw, type: id.type });
    }
  }

  const total = identifiers.length;
  return {
    total,
    foundCount: found.length,
    missingCount: missing.length,
    coverage: found.length / total,
    found,
    missing,
  };
}

function identifierToKey(id: ParsedIdentifier): string {
  if (id.type === 'doi') {
    return `doi:${id.value.toLowerCase()}`;
  }
  return `${id.type}:${id.value}`;
}
