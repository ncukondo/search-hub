/**
 * ERIC JSON response parser.
 * Parses ERIC API responses and converts them to ERICDocument.
 */

import type { Author } from '../base/types';
import type { ERICDocument, ERICRawDocument, ERICSearchResponse } from './types';

/**
 * Result of parsing an ERIC search response.
 */
export interface ERICSearchResult {
  /** Total number of results available */
  totalResults: number;
  /** Starting offset of this page */
  start: number;
  /** Parsed documents */
  documents: ERICDocument[];
}

/**
 * Parse an author string in "Last, First" format.
 */
function parseAuthor(authorStr: string): Author | null {
  const trimmed = authorStr.trim();
  if (!trimmed) {
    return null;
  }

  // Split by comma, but handle "Last, Jr., First" format
  const parts = trimmed.split(',').map((p) => p.trim());

  if (parts.length === 0 || !parts[0]) {
    return null;
  }

  if (parts.length === 1) {
    // Just last name
    return { family: parts[0] };
  }

  if (parts.length === 2) {
    // Standard "Last, First" format
    const given = parts[1];
    if (given) {
      return { family: parts[0], given };
    }
    return { family: parts[0] };
  }

  // Handle "Last, Jr., First" or similar complex formats
  // Assume first part is family name, last part is given name
  const givenName = parts[parts.length - 1];
  if (givenName) {
    return {
      family: parts.slice(0, -1).join(', '),
      given: givenName,
    };
  }
  return { family: parts.slice(0, -1).join(', ') };
}

/**
 * Parse an ERIC raw document into an ERICDocument.
 */
export function parseDocument(doc: ERICRawDocument): ERICDocument {
  // Parse authors
  const authors: Author[] = [];
  if (doc.author) {
    for (const authorStr of doc.author) {
      const parsed = parseAuthor(authorStr);
      if (parsed) {
        authors.push(parsed);
      }
    }
  }

  const result: ERICDocument = {
    ericId: doc.id,
    title: doc.title,
    authors,
    source: 'eric',
    retrievedAt: new Date().toISOString(),
    rawResponse: doc,
  };

  // Only add optional fields if they have values
  if (doc.description !== undefined) {
    result.abstract = doc.description;
  }
  if (doc.publicationdateyear !== undefined) {
    result.publicationDate = doc.publicationdateyear.toString();
  }
  if (doc.source !== undefined) {
    result.journal = doc.source;
  }
  if (doc.peerreviewed !== undefined) {
    result.peerReviewed = doc.peerreviewed;
  }
  if (doc.publicationtype !== undefined) {
    result.publicationType = doc.publicationtype;
  }
  if (doc.issn !== undefined) {
    result.issn = doc.issn;
  }
  if (doc.identifiersgov !== undefined) {
    result.identifiersGov = doc.identifiersgov;
  }
  if (doc.subject !== undefined) {
    result.descriptors = doc.subject;
  }

  return result;
}

/**
 * Parse an ERIC API search response.
 */
export function parseSearchResponse(response: ERICSearchResponse): ERICSearchResult {
  const { numFound, start, docs } = response.response;

  const documents = docs.map(parseDocument);

  return {
    totalResults: numFound,
    start,
    documents,
  };
}
