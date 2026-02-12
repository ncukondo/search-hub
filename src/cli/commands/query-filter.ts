/**
 * Query filter module for filtering articles with a unified query expression.
 *
 * Syntax: field:value pairs and free text, space-separated.
 * - Free text searches title OR abstract
 * - Different fields: AND logic
 * - Same field repeated: OR logic
 */
import type { Article } from '../../providers/base/types.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export type QueryToken =
  | { type: 'text'; value: string }
  | { type: 'field'; field: string; value: string };

const KNOWN_FIELDS = new Set([
  'title', 'abstract', 'author', 'journal',
  'year', 'doi', 'pmid', 'arxiv', 'scopus', 'eric',
  'source',
]);

// ─── Tokenizer ──────────────────────────────────────────────────────────────

export function tokenizeQuery(query: string): QueryToken[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const tokens: QueryToken[] = [];
  let i = 0;

  while (i < trimmed.length) {
    // Skip whitespace
    while (i < trimmed.length && trimmed[i] === ' ') i++;
    if (i >= trimmed.length) break;

    // Quoted free text: "..."
    if (trimmed[i] === '"') {
      const closing = trimmed.indexOf('"', i + 1);
      if (closing === -1) {
        // Unclosed quote — take rest as value
        tokens.push({ type: 'text', value: trimmed.slice(i + 1) });
        break;
      }
      tokens.push({ type: 'text', value: trimmed.slice(i + 1, closing) });
      i = closing + 1;
      continue;
    }

    // Read a word (until space or end)
    const start = i;
    while (i < trimmed.length && trimmed[i] !== ' ') i++;
    const word = trimmed.slice(start, i);

    // Check for field:value pattern
    const colonIdx = word.indexOf(':');
    if (colonIdx > 0) {
      const fieldName = word.slice(0, colonIdx);
      if (KNOWN_FIELDS.has(fieldName)) {
        let value = word.slice(colonIdx + 1);

        // Field with quoted value: field:"..."
        if (value.startsWith('"')) {
          const afterQuote = start + colonIdx + 2; // position after opening quote
          const closing = trimmed.indexOf('"', afterQuote);
          if (closing === -1) {
            // Unclosed quote
            value = trimmed.slice(afterQuote);
            tokens.push({ type: 'field', field: fieldName, value });
            break;
          }
          value = trimmed.slice(afterQuote, closing);
          tokens.push({ type: 'field', field: fieldName, value });
          i = closing + 1;
          continue;
        }

        tokens.push({ type: 'field', field: fieldName, value });
        continue;
      }
    }

    // Plain free text word (or unknown field prefix)
    tokens.push({ type: 'text', value: word });
  }

  return tokens;
}

// ─── Matcher ────────────────────────────────────────────────────────────────

function extractYear(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})/);
  return match ? parseInt(match[1]!, 10) : null;
}

function matchIdField(articleValue: string | undefined, queryValue: string): boolean {
  if (!articleValue) return false;
  return articleValue.toLowerCase() === queryValue.toLowerCase();
}

function matchSubstring(text: string | undefined, queryValue: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(queryValue.toLowerCase());
}

function matchYearToken(article: Article, value: string): boolean {
  const year = extractYear(article.publicationDate);
  if (year === null) return false;

  const rangeMatch = value.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[1]!, 10);
    const to = parseInt(rangeMatch[2]!, 10);
    return year >= from && year <= to;
  }

  const exact = parseInt(value, 10);
  return !Number.isNaN(exact) && year === exact;
}

function matchSingleToken(article: Article, token: QueryToken): boolean {
  if (token.type === 'text') {
    return matchSubstring(article.title, token.value) ||
           matchSubstring(article.abstract, token.value);
  }

  switch (token.field) {
    case 'title':
      return matchSubstring(article.title, token.value);
    case 'abstract':
      return matchSubstring(article.abstract, token.value);
    case 'author':
      return article.authors.some(
        (a) => matchSubstring(a.family, token.value) || matchSubstring(a.given, token.value)
      );
    case 'journal':
      return matchSubstring(article.journal, token.value);
    case 'year':
      return matchYearToken(article, token.value);
    case 'doi':
      return matchIdField(article.doi, token.value);
    case 'pmid':
      return matchIdField(article.pmid, token.value);
    case 'arxiv':
      return matchIdField(article.arxivId, token.value);
    case 'scopus':
      return matchIdField(article.scopusId, token.value);
    case 'eric':
      return matchIdField(article.ericId, token.value);
    case 'source':
      return article.source === token.value.toLowerCase();
    default:
      return false;
  }
}

export function matchArticle(article: Article, tokens: QueryToken[]): boolean {
  if (tokens.length === 0) return true;

  // Group tokens by their "field key" (field name, or 'text' for free text)
  const groups = new Map<string, QueryToken[]>();
  for (const token of tokens) {
    const key = token.type === 'text' ? '__text__' : token.field;
    const group = groups.get(key);
    if (group) {
      group.push(token);
    } else {
      groups.set(key, [token]);
    }
  }

  // AND across groups, OR within each group
  for (const groupTokens of groups.values()) {
    const anyMatch = groupTokens.some((t) => matchSingleToken(article, t));
    if (!anyMatch) return false;
  }

  return true;
}

// ─── Filter ─────────────────────────────────────────────────────────────────

export function filterByQuery(articles: Article[], query: string): Article[] {
  const trimmed = query.trim();
  if (!trimmed) return articles;

  const tokens = tokenizeQuery(trimmed);
  if (tokens.length === 0) return articles;

  return articles.filter((article) => matchArticle(article, tokens));
}
