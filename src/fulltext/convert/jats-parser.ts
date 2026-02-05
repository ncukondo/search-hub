/**
 * JATS XML parser for PMC articles.
 *
 * Parses JATS (Journal Article Tag Suite) XML into an intermediate
 * representation for Markdown conversion.
 */

import { XMLParser } from 'fast-xml-parser';
import type { JatsAuthor, JatsMetadata } from './types.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  isArray: (name) => {
    const arrayElements = [
      'contrib',
      'article-id',
      'sec',
      'p',
      'ref',
      'list-item',
      'tr',
      'td',
      'th',
      'fig',
      'table-wrap',
      'xref',
    ];
    return arrayElements.includes(name);
  },
});

/**
 * Extract text content from a parsed XML node.
 * Handles both string values and objects with #text.
 */
function textContent(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && '#text' in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)['#text'] ?? '');
  }
  return '';
}

/**
 * Extract plain text from a node that may contain nested elements.
 * Recursively collects all text content.
 */
function extractAllText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return node.map(extractAllText).join('');
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue;
      parts.push(extractAllText(value));
    }
    return parts.join('');
  }
  return '';
}

/**
 * Parse JATS XML front matter to extract article metadata.
 */
export function parseJatsMetadata(xml: string): JatsMetadata {
  const parsed = parser.parse(xml);
  const front = parsed.article?.front;
  const articleMeta = front?.['article-meta'] ?? {};

  // Title
  const titleGroup = articleMeta['title-group'];
  const title = extractAllText(titleGroup?.['article-title']) || '';

  // Article IDs
  const articleIds: Array<Record<string, unknown>> = articleMeta['article-id'] ?? [];
  let doi: string | undefined;
  let pmcid: string | undefined;
  for (const idNode of articleIds) {
    const idType = idNode['@_pub-id-type'];
    const idText = textContent(idNode);
    if (idType === 'doi') doi = idText;
    if (idType === 'pmc') pmcid = idText;
  }

  // Authors
  const authors: JatsAuthor[] = [];
  const contribGroup = articleMeta['contrib-group'];
  const contribs: Array<Record<string, unknown>> = contribGroup?.contrib ?? [];
  for (const contrib of contribs) {
    if (contrib['@_contrib-type'] !== 'author') continue;
    const name = contrib['name'] as Record<string, unknown> | undefined;
    if (!name) continue;
    const author: JatsAuthor = {
      surname: textContent(name['surname']),
    };
    const givenNames = textContent(name['given-names']);
    if (givenNames) {
      author.givenNames = givenNames;
    }
    authors.push(author);
  }

  // Abstract
  const abstractNode = articleMeta.abstract;
  let abstract: string | undefined;
  if (abstractNode) {
    // Structured abstract with <sec> elements
    const sections: Array<Record<string, unknown>> = abstractNode.sec ?? [];
    if (sections.length > 0) {
      const parts: string[] = [];
      for (const sec of sections) {
        const secTitle = extractAllText(sec['title']);
        const secP = sec['p'];
        const paragraphs: unknown[] = Array.isArray(secP) ? secP : secP != null ? [secP] : [];
        const text = paragraphs.map(extractAllText).join(' ');
        if (secTitle) {
          parts.push(`${secTitle}: ${text}`);
        } else {
          parts.push(text);
        }
      }
      abstract = parts.join('\n\n');
    } else {
      // Simple abstract with <p>
      const paragraphs: unknown[] = Array.isArray(abstractNode.p)
        ? abstractNode.p
        : abstractNode.p != null
          ? [abstractNode.p]
          : [];
      if (paragraphs.length > 0) {
        abstract = paragraphs.map(extractAllText).join('\n\n');
      } else {
        const text = extractAllText(abstractNode);
        if (text) abstract = text;
      }
    }
  }

  const result: JatsMetadata = { title, authors };
  if (doi) result.doi = doi;
  if (pmcid) result.pmcid = pmcid;
  if (abstract) result.abstract = abstract;
  return result;
}
