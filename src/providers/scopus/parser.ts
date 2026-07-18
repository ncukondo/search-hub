/**
 * Scopus Response Parser
 *
 * Parses Scopus API JSON responses into typed structures.
 */

import { z } from 'zod';
import type { ScopusSearchResponse, ScopusDocument, ScopusRawEntry, ScopusAuthor } from './types';

/**
 * Zod schema for Scopus author in API response.
 */
const ScopusAuthorSchema = z.object({
  authname: z.string().nullish(),
  authid: z.string().nullish(),
  afid: z.array(z.object({ $: z.string().nullish() })).nullish(),
});

/**
 * Zod schema for Scopus entry in API response.
 */
const ScopusRawEntrySchema = z.object({
  'dc:identifier': z.string().nullish(),
  'dc:title': z.string().nullish(),
  'dc:creator': z.string().nullish(),
  'dc:description': z.string().nullish(),
  'prism:doi': z.string().nullish(),
  'prism:coverDate': z.string().nullish(),
  'prism:publicationName': z.string().nullish(),
  'prism:volume': z.string().nullish(),
  'prism:issueIdentifier': z.string().nullish(),
  'prism:pageRange': z.string().nullish(),
  'citedby-count': z.string().nullish(),
  eid: z.string().nullish(),
  subtypeDescription: z.string().nullish(),
  author: z.array(ScopusAuthorSchema).nullish(),
});

/**
 * Zod schema for Scopus search results wrapper.
 */
const ScopusSearchResultsSchema = z.object({
  'opensearch:totalResults': z.string().optional(),
  'opensearch:startIndex': z.string().optional(),
  'opensearch:itemsPerPage': z.string().optional(),
  entry: z.array(ScopusRawEntrySchema).optional(),
});

/**
 * Zod schema for full Scopus API response.
 */
const ScopusApiResponseSchema = z.object({
  'search-results': ScopusSearchResultsSchema,
});

/**
 * Parse the raw Scopus API search response.
 * Validates the response structure using Zod before parsing.
 */
export function parseSearchResponse(json: unknown): ScopusSearchResponse {
  const parseResult = ScopusApiResponseSchema.safeParse(json);

  if (!parseResult.success) {
    // Build warning message from Zod errors
    const issues = parseResult.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    const warning = `Scopus API response parse failed: ${issues}`;

    // Fallback to empty response on invalid structure
    return {
      totalResults: 0,
      startIndex: 0,
      itemsPerPage: 25,
      entries: [],
      parseWarning: warning,
    };
  }

  const searchResults = parseResult.data['search-results'];

  const totalResults = parseInt(searchResults['opensearch:totalResults'] ?? '0', 10) || 0;
  const startIndex = parseInt(searchResults['opensearch:startIndex'] ?? '0', 10) || 0;
  const itemsPerPage = parseInt(searchResults['opensearch:itemsPerPage'] ?? '25', 10) || 25;
  const entries = (searchResults.entry as ScopusRawEntry[]) ?? [];

  return {
    totalResults,
    startIndex,
    itemsPerPage,
    entries,
  };
}

/**
 * Parse author name from "Last, First" format.
 */
function parseAuthorName(authname: string): { family: string; given?: string | undefined } {
  const parts = authname.split(', ');
  if (parts.length >= 2) {
    return {
      family: parts[0]!,
      given: parts.slice(1).join(', '),
    };
  }
  return { family: authname };
}

/**
 * Parse a single document entry into ScopusDocument.
 */
export function parseDocument(entry: ScopusRawEntry): ScopusDocument {
  // Parse authors
  let authors: ScopusAuthor[];

  if (entry.author && entry.author.length > 0) {
    authors = entry.author.map((a) => {
      const parsed = parseAuthorName(a.authname || '');
      const author: ScopusAuthor = {
        family: parsed.family,
      };
      if (parsed.given !== undefined) {
        author.given = parsed.given;
      }
      if (a.authid !== undefined) {
        author.authid = a.authid;
      }
      return author;
    });
  } else if (entry['dc:creator']) {
    // Fallback to dc:creator
    authors = [{ family: entry['dc:creator'] }];
  } else {
    authors = [];
  }

  // Build document with required fields
  const doc: ScopusDocument = {
    scopusId: entry['dc:identifier'] || '',
    title: entry['dc:title'] || '',
    authors,
    source: 'scopus',
    retrievedAt: new Date().toISOString(),
  };

  // Add optional fields only if defined
  if (entry['dc:description'] !== undefined) {
    doc.abstract = entry['dc:description'];
  }
  if (entry['prism:doi'] !== undefined) {
    doc.doi = entry['prism:doi'];
  }
  if (entry['prism:coverDate'] !== undefined) {
    doc.publicationDate = entry['prism:coverDate'];
  }
  if (entry['prism:publicationName'] !== undefined) {
    doc.journal = entry['prism:publicationName'];
  }
  if (entry['prism:volume'] !== undefined) {
    doc.volume = entry['prism:volume'];
  }
  if (entry['prism:issueIdentifier'] !== undefined) {
    doc.issue = entry['prism:issueIdentifier'];
  }
  if (entry['prism:pageRange'] !== undefined) {
    doc.pages = entry['prism:pageRange'];
  }

  // Scopus-specific fields
  if (entry['citedby-count'] !== undefined) {
    doc.citedByCount = parseInt(entry['citedby-count'], 10);
  }
  if (entry.eid !== undefined) {
    doc.eid = entry.eid;
  }
  if (entry.subtypeDescription !== undefined) {
    doc.sourceType = entry.subtypeDescription;
  }

  return doc;
}
