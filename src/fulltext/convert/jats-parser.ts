/**
 * JATS XML parser for PMC articles.
 *
 * Parses JATS (Journal Article Tag Suite) XML into an intermediate
 * representation for Markdown conversion.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  JatsAuthor,
  JatsMetadata,
  JatsSection,
  BlockElement,
  InlineContent,
} from './types.js';

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

/**
 * Parse inline content from a paragraph node.
 * Handles mixed text and element content (bold, italic, sup, sub, xref).
 */
function parseInlineContent(node: unknown): InlineContent[] {
  if (node == null) return [];
  if (typeof node === 'string') return [{ type: 'text', text: node }];
  if (typeof node === 'number') return [{ type: 'text', text: String(node) }];

  if (Array.isArray(node)) {
    return node.flatMap(parseInlineContent);
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const result: InlineContent[] = [];

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('@_')) continue;

      if (key === '#text') {
        const text = String(value ?? '');
        if (text) result.push({ type: 'text', text });
      } else if (key === 'bold') {
        const children = parseInlineContent(value);
        result.push({ type: 'bold', children });
      } else if (key === 'italic') {
        const children = parseInlineContent(value);
        result.push({ type: 'italic', children });
      } else if (key === 'sup') {
        result.push({ type: 'superscript', text: extractAllText(value) });
      } else if (key === 'sub') {
        result.push({ type: 'subscript', text: extractAllText(value) });
      } else if (key === 'xref') {
        const xrefs = Array.isArray(value) ? value : [value];
        for (const xref of xrefs) {
          if (typeof xref === 'object' && xref != null) {
            const xobj = xref as Record<string, unknown>;
            const refType = xobj['@_ref-type'];
            if (refType === 'bibr') {
              result.push({
                type: 'citation',
                refId: String(xobj['@_rid'] ?? ''),
                text: extractAllText(xobj),
              });
            } else {
              result.push({ type: 'text', text: extractAllText(xobj) });
            }
          }
        }
      } else {
        // Unknown inline element - extract text
        const text = extractAllText(value);
        if (text) result.push({ type: 'text', text });
      }
    }
    return result;
  }
  return [];
}

/**
 * Parse a <list> element into a BlockElement.
 */
function parseList(listNode: Record<string, unknown>): BlockElement {
  const listType = listNode['@_list-type'];
  const ordered = listType === 'order';
  const listItems: Array<Record<string, unknown>> = (listNode['list-item'] as Array<Record<string, unknown>>) ?? [];
  const items: InlineContent[][] = [];

  for (const item of listItems) {
    const pNodes = item['p'];
    const paragraphs: unknown[] = Array.isArray(pNodes) ? pNodes : pNodes != null ? [pNodes] : [];
    const content = paragraphs.flatMap(parseInlineContent);
    items.push(content);
  }

  return { type: 'list', ordered, items };
}

/**
 * Parse a table row into an array of cell text content.
 */
function parseTableRow(tr: Record<string, unknown>): string[] {
  const cells: string[] = [];
  // Try both th (headers) and td (data) — th first so headers come in order
  for (const cellTag of ['th', 'td']) {
    const cellNodes = tr[cellTag];
    if (cellNodes) {
      const cellArray: unknown[] = Array.isArray(cellNodes) ? cellNodes : [cellNodes];
      for (const cell of cellArray) {
        cells.push(String(extractAllText(cell)));
      }
    }
  }
  return cells;
}

/**
 * Parse a <table-wrap> element into a table block.
 * Exported for standalone use and used internally by parseBlockContent.
 */
export function parseJatsTable(xml: string): { caption?: string; headers: string[]; rows: string[][] } {
  const parsed = parser.parse(xml);
  let tableWrap = parsed['table-wrap'] ?? parsed;
  // isArray may wrap it in an array
  if (Array.isArray(tableWrap)) tableWrap = tableWrap[0];
  return parseTableWrap(tableWrap as Record<string, unknown>);
}

/**
 * Parse an already-parsed table-wrap node.
 */
function parseTableWrap(tableWrap: Record<string, unknown>): { caption?: string; headers: string[]; rows: string[][] } {
  // Caption
  const label = extractAllText(tableWrap['label']);
  const captionNode = tableWrap['caption'];
  const captionText = captionNode ? extractAllText(captionNode) : '';
  const captionStr = [label, captionText].filter(Boolean).join('. ');

  const table = tableWrap['table'] as Record<string, unknown> | undefined;
  const result: { caption?: string; headers: string[]; rows: string[][] } = { headers: [], rows: [] };
  if (captionStr) result.caption = captionStr;
  if (!table) return result;

  // Headers from thead
  const thead = table['thead'] as Record<string, unknown> | undefined;
  if (thead) {
    const headRows = thead['tr'];
    const headRowArray: unknown[] = Array.isArray(headRows) ? headRows : headRows ? [headRows] : [];
    if (headRowArray.length > 0) {
      const firstRow = headRowArray[0] as Record<string, unknown>;
      result.headers.push(...parseTableRow(firstRow));
    }
  }

  // Body rows
  const tbody = table['tbody'] as Record<string, unknown> | undefined;
  if (tbody) {
    const bodyRows = tbody['tr'];
    const bodyRowArray: unknown[] = Array.isArray(bodyRows) ? bodyRows : bodyRows ? [bodyRows] : [];
    for (const row of bodyRowArray) {
      if (typeof row === 'object' && row != null) {
        result.rows.push(parseTableRow(row as Record<string, unknown>));
      }
    }
  }

  return result;
}

/**
 * Parse block-level content from a section.
 */
function parseBlockContent(sectionNode: Record<string, unknown>): BlockElement[] {
  const blocks: BlockElement[] = [];

  // Paragraphs
  const pNodes = sectionNode['p'];
  if (pNodes) {
    const paragraphs: unknown[] = Array.isArray(pNodes) ? pNodes : [pNodes];
    for (const p of paragraphs) {
      blocks.push({ type: 'paragraph', content: parseInlineContent(p) });
    }
  }

  // Lists
  const listNode = sectionNode['list'];
  if (listNode) {
    const lists = Array.isArray(listNode) ? listNode : [listNode];
    for (const list of lists) {
      if (typeof list === 'object' && list != null) {
        blocks.push(parseList(list as Record<string, unknown>));
      }
    }
  }

  // Tables
  const tableWrapNode = sectionNode['table-wrap'];
  if (tableWrapNode) {
    const tableWraps: unknown[] = Array.isArray(tableWrapNode) ? tableWrapNode : [tableWrapNode];
    for (const tw of tableWraps) {
      if (typeof tw === 'object' && tw != null) {
        const tableResult = parseTableWrap(tw as Record<string, unknown>);
        const tableBlock: BlockElement = { type: 'table', headers: tableResult.headers, rows: tableResult.rows };
        if (tableResult.caption) (tableBlock as { caption?: string }).caption = tableResult.caption;
        blocks.push(tableBlock);
      }
    }
  }

  return blocks;
}

/**
 * Parse a <sec> element into a JatsSection, recursively handling subsections.
 */
function parseSection(secNode: Record<string, unknown>, level: number): JatsSection {
  const title = extractAllText(secNode['title']);
  const content = parseBlockContent(secNode);

  // Nested sections
  const subsections: JatsSection[] = [];
  const nestedSecs = secNode['sec'];
  if (nestedSecs) {
    const secs: Array<Record<string, unknown>> = Array.isArray(nestedSecs)
      ? (nestedSecs as Array<Record<string, unknown>>)
      : [nestedSecs as Record<string, unknown>];
    for (const sub of secs) {
      subsections.push(parseSection(sub, level + 1));
    }
  }

  return { title, level, content, subsections };
}

/**
 * Parse JATS XML body to extract sections and content.
 */
export function parseJatsBody(xml: string): JatsSection[] {
  const parsed = parser.parse(xml);
  const body = parsed.article?.body;
  if (!body) return [];

  const sections: JatsSection[] = [];
  const secs = body['sec'];

  if (secs && Array.isArray(secs) && secs.length > 0) {
    for (const sec of secs) {
      if (typeof sec === 'object' && sec != null) {
        sections.push(parseSection(sec as Record<string, unknown>, 2));
      }
    }
  } else {
    // Body has paragraphs without sections
    const content = parseBlockContent(body as Record<string, unknown>);
    if (content.length > 0) {
      sections.push({ title: '', level: 2, content, subsections: [] });
    }
  }

  return sections;
}
