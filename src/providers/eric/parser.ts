/**
 * ERIC JSON response parser.
 * Parses ERIC API responses and converts them to ERICDocument.
 */

import type { Author } from '../base/types';
import { createProviderError } from '../base/types';
import type { ERICDocument, ERICRawDocument, ERICSearchResponse } from './types';

/**
 * Truncate a string or object for error messages.
 * Prevents leaking large response bodies in errors.
 */
function truncateForError(value: unknown, maxLength = 200): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '... (truncated)';
}

/**
 * Validate ERIC API response structure.
 * Throws descriptive ProviderError if the response is malformed.
 */
export function validateSearchResponse(response: unknown): asserts response is ERICSearchResponse {
  // Check for null/undefined
  if (response == null) {
    throw createProviderError(
      'PARSE_ERROR',
      'ERIC API error: Unexpected response format (response is null/undefined). ' +
        'This may indicate an API change or service issue. ' +
        'Response received: ' + truncateForError(response),
      'eric',
      { retryable: false }
    );
  }

  // Check for ERIC API error response: { error: { msg: "..." } }
  if (typeof response === 'object' && 'error' in response) {
    const respObj = response as Record<string, unknown>;
    if (typeof respObj['error'] === 'object' && respObj['error'] !== null) {
      const errorObj = respObj['error'] as { msg?: string };
      const errorMsg = errorObj.msg ?? 'Unknown error';

      // Check for PhraseQuery error and provide helpful message
      if (errorMsg.includes('PhraseQuery')) {
        throw createProviderError(
          'QUERY_ERROR',
          'ERIC does not support phrase queries without field specification. ' +
            'Use field-prefixed queries like: title:"your phrase" OR description:"your phrase". ' +
            'Alternatively, use YAML format which automatically adds field prefixes.',
          'eric',
          { retryable: false }
        );
      }

      throw createProviderError(
        'QUERY_ERROR',
        `ERIC API error: ${errorMsg}`,
        'eric',
        { retryable: false }
      );
    }
  }

  // Check for response.response object
  if (typeof response !== 'object' || !('response' in response)) {
    throw createProviderError(
      'PARSE_ERROR',
      "ERIC API error: Unexpected response format (missing 'response' property). " +
        'This may indicate an API change or service issue. ' +
        'Response received: ' + truncateForError(response),
      'eric',
      { retryable: false }
    );
  }

  const inner = (response as Record<string, unknown>)['response'];

  // Check for response.response being an object
  if (inner == null || typeof inner !== 'object') {
    throw createProviderError(
      'PARSE_ERROR',
      "ERIC API error: Unexpected response format ('response' is not an object). " +
        'This may indicate an API change or service issue. ' +
        'Response received: ' + truncateForError(response),
      'eric',
      { retryable: false }
    );
  }

  const innerObj = inner as Record<string, unknown>;

  // Check for numFound
  if (!('numFound' in innerObj) || typeof innerObj['numFound'] !== 'number') {
    throw createProviderError(
      'PARSE_ERROR',
      "ERIC API error: Unexpected response format (missing 'numFound'). " +
        'This may indicate an API change or service issue. ' +
        'Response received: ' + truncateForError(response),
      'eric',
      { retryable: false }
    );
  }

  // Check for docs array
  if (!('docs' in innerObj) || !Array.isArray(innerObj['docs'])) {
    throw createProviderError(
      'PARSE_ERROR',
      "ERIC API error: Unexpected response format ('docs' is not an array). " +
        'This may indicate an API change or service issue. ' +
        'Response received: ' + truncateForError(response),
      'eric',
      { retryable: false }
    );
  }
}

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
 * Validates the response structure before parsing.
 */
export function parseSearchResponse(response: unknown): ERICSearchResult {
  // Validate response structure first
  validateSearchResponse(response);

  const { numFound, start, docs } = response.response;

  const documents = docs.map(parseDocument);

  return {
    totalResults: numFound,
    start,
    documents,
  };
}
