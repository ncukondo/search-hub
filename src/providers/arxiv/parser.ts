/**
 * arXiv Atom XML Response Parser
 *
 * Parses arXiv API Atom XML feed responses into structured data.
 * Uses fast-xml-parser for XML to JSON conversion.
 */

import { XMLParser } from 'fast-xml-parser';
import type { ArxivSearchResponse, ArxivPaper } from './types.js';
import type { Author } from '../base/types.js';

/**
 * Parser configuration for arXiv Atom XML.
 * Handles namespaces and attributes properly.
 */
const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true, // Remove namespace prefixes like opensearch:, arxiv:
  isArray: (name: string) => {
    // These elements can appear multiple times
    return name === 'entry' || name === 'author' || name === 'category';
  },
};

const parser = new XMLParser(parserOptions);

/**
 * Extract arXiv ID from URL, removing version suffix.
 * Input: http://arxiv.org/abs/2401.12345v1
 * Output: 2401.12345
 */
export function extractArxivId(url: string): string {
  // Extract the ID part from the URL
  const match = url.match(/arxiv\.org\/abs\/(.+?)(?:v\d+)?$/);
  if (match && match[1]) {
    // Remove version suffix if present
    return match[1].replace(/v\d+$/, '');
  }
  // Fallback: return the last part of the URL
  const parts = url.split('/');
  const lastPart = parts[parts.length - 1] ?? '';
  return lastPart.replace(/v\d+$/, '');
}

/**
 * Parse author name into given/family components.
 * arXiv provides names as "FirstName LastName" or just "Name"
 */
function parseAuthorName(name: string): Author {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { family: parts[0]! };
  }
  // Last word is family name, rest is given name
  const family = parts[parts.length - 1]!;
  const given = parts.slice(0, -1).join(' ');
  return { family, given };
}

/**
 * Parse publication date from ISO 8601 format to YYYY-MM-DD.
 */
function parsePublicationDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0]!;
  } catch {
    // If date parsing fails (invalid format), return original string as fallback
    return dateStr;
  }
}

/**
 * Safely get a value that might be string or object with #text.
 */
function getTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as { '#text': unknown })['#text']);
  }
  return undefined;
}

/**
 * Parse an entry element from the Atom feed.
 */
export function parseEntry(entry: Record<string, unknown>): ArxivPaper {
  // Extract arXiv ID from entry id URL
  const idUrl = getTextValue(entry['id']) ?? '';
  const arxivId = extractArxivId(idUrl);

  // Extract title (may need newline normalization)
  const rawTitle = getTextValue(entry['title']) ?? '';
  const title = rawTitle.replace(/\s+/g, ' ').trim();

  // Extract abstract (summary)
  const rawAbstract = getTextValue(entry['summary']);
  const abstract = rawAbstract?.replace(/\s+/g, ' ').trim();

  // Extract DOI
  const doi = getTextValue(entry['doi']);

  // Extract publication date
  const published = getTextValue(entry['published']);
  const publicationDate = published ? parsePublicationDate(published) : undefined;

  // Extract authors
  const authorData = entry['author'];
  const authors: Author[] = [];
  if (Array.isArray(authorData)) {
    for (const a of authorData) {
      const name = getTextValue((a as Record<string, unknown>)['name']);
      if (name) {
        authors.push(parseAuthorName(name));
      }
    }
  } else if (authorData && typeof authorData === 'object') {
    const name = getTextValue((authorData as Record<string, unknown>)['name']);
    if (name) {
      authors.push(parseAuthorName(name));
    }
  }

  // Extract primary category
  const primaryCategoryData = entry['primary_category'] as Record<string, unknown> | undefined;
  const primaryCategory = (primaryCategoryData?.['@_term'] as string | undefined) ?? '';

  // Extract all categories
  const categoryData = entry['category'];
  const categories: string[] = [];
  if (Array.isArray(categoryData)) {
    for (const cat of categoryData) {
      const term = (cat as Record<string, unknown>)['@_term'];
      if (typeof term === 'string') {
        categories.push(term);
      }
    }
  } else if (categoryData && typeof categoryData === 'object') {
    const term = (categoryData as Record<string, unknown>)['@_term'];
    if (typeof term === 'string') {
      categories.push(term);
    }
  }

  const paper: ArxivPaper = {
    arxivId,
    title,
    authors,
    source: 'arxiv',
    retrievedAt: new Date().toISOString(),
    primaryCategory,
    categories,
  };

  // Add optional fields only if defined
  if (abstract !== undefined) {
    paper.abstract = abstract;
  }
  if (doi !== undefined) {
    paper.doi = doi;
  }
  if (publicationDate !== undefined) {
    paper.publicationDate = publicationDate;
  }

  return paper;
}

/**
 * Parse arXiv Atom feed XML into structured response.
 */
export function parseAtomFeed(xml: string): ArxivSearchResponse {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const feed = parsed['feed'] as Record<string, unknown>;

  if (!feed) {
    return {
      totalResults: 0,
      startIndex: 0,
      itemsPerPage: 0,
      entries: [],
    };
  }

  // Extract opensearch metadata
  const totalResults = Number(feed['totalResults'] ?? 0);
  const startIndex = Number(feed['startIndex'] ?? 0);
  const itemsPerPage = Number(feed['itemsPerPage'] ?? 0);

  // Parse entries
  const entryData = feed['entry'];
  const entries: ArxivPaper[] = [];

  if (Array.isArray(entryData)) {
    for (const entry of entryData) {
      entries.push(parseEntry(entry as Record<string, unknown>));
    }
  } else if (entryData && typeof entryData === 'object') {
    entries.push(parseEntry(entryData as Record<string, unknown>));
  }

  return {
    totalResults,
    startIndex,
    itemsPerPage,
    entries,
  };
}
