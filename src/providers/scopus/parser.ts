/**
 * Scopus Response Parser
 *
 * Parses Scopus API JSON responses into typed structures.
 */

import type { ScopusSearchResponse, ScopusDocument, ScopusRawEntry, ScopusAuthor } from './types';

/**
 * Parse the raw Scopus API search response.
 */
export function parseSearchResponse(json: unknown): ScopusSearchResponse {
  const data = json as Record<string, unknown>;
  const searchResults = data['search-results'] as Record<string, unknown>;

  const totalResults = parseInt(searchResults['opensearch:totalResults'] as string, 10) || 0;
  const startIndex = parseInt(searchResults['opensearch:startIndex'] as string, 10) || 0;
  const itemsPerPage = parseInt(searchResults['opensearch:itemsPerPage'] as string, 10) || 25;
  const entries = (searchResults['entry'] as ScopusRawEntry[]) || [];

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
