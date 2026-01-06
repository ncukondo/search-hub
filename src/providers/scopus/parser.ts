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
  authname: z.string().optional(),
  authid: z.string().optional(),
  afid: z.array(z.object({ $: z.string().optional() })).optional(),
});

/**
 * Zod schema for Scopus entry in API response.
 */
const ScopusRawEntrySchema = z.object({
  'dc:identifier': z.string().optional(),
  'dc:title': z.string().optional(),
  'dc:creator': z.string().optional(),
  'dc:description': z.string().optional(),
  'prism:doi': z.string().optional(),
  'prism:coverDate': z.string().optional(),
  'prism:publicationName': z.string().optional(),
  'prism:volume': z.string().optional(),
  'prism:issueIdentifier': z.string().optional(),
  'prism:pageRange': z.string().optional(),
  'citedby-count': z.string().optional(),
  eid: z.string().optional(),
  subtypeDescription: z.string().optional(),
  author: z.array(ScopusAuthorSchema).optional(),
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
    // Fallback to empty response on invalid structure
    return {
      totalResults: 0,
      startIndex: 0,
      itemsPerPage: 25,
      entries: [],
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
    authors = entry.author.map(a => {
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
