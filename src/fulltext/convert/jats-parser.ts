/**
 * JATS XML parser for PMC articles.
 *
 * Parses JATS (Journal Article Tag Suite) XML into an intermediate
 * representation for Markdown conversion.
 *
 * Uses fast-xml-parser with `preserveOrder: true` to maintain document order
 * of interleaved elements (e.g. text, citations, formatting).
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  JatsAuthor,
  JatsMetadata,
  JatsSection,
  JatsReference,
  BlockElement,
  InlineContent,
} from './types.js';

/**
 * A node in the preserveOrder output.
 * Either a text node `{ "#text": string | number }` or an element node
 * `{ tagName: OrderedNode[], ":@"?: { "@_attr": value } }`.
 */
type OrderedNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: false,
  preserveOrder: true,
  processEntities: true,
  htmlEntities: true,
});

// ─── Navigation Helpers ──────────────────────────────────────────────

/** Get the tag name of an ordered node (the first key that isn't ":@" or "#text"). */
function getTagName(node: OrderedNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ':@' && key !== '#text') return key;
  }
  return undefined;
}

/** Get the children array of an element node. */
function getChildren(node: OrderedNode): OrderedNode[] {
  const tag = getTagName(node);
  if (!tag) return [];
  const children = node[tag];
  return Array.isArray(children) ? (children as OrderedNode[]) : [];
}

/** Get attributes of an element node. */
function getAttr(node: OrderedNode, attrName: string): string | undefined {
  const attrs = node[':@'] as Record<string, unknown> | undefined;
  if (!attrs) return undefined;
  const val = attrs[`@_${attrName}`];
  return val != null ? String(val) : undefined;
}

/** Get all attributes of an element node (strips @_ prefix for consistency with getAttr). */
function getAttrs(node: OrderedNode): Record<string, string> {
  const attrs = node[':@'] as Record<string, unknown> | undefined;
  if (!attrs) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('@_')) {
      result[key.slice(2)] = String(value);
    }
  }
  return result;
}

/** Find the first child element with the given tag name. */
function findChild(
  children: OrderedNode[],
  tagName: string,
): { node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> } | undefined {
  for (const child of children) {
    if (tagName in child) {
      const childArr = child[tagName];
      return {
        node: child,
        children: Array.isArray(childArr) ? (childArr as OrderedNode[]) : [],
        attrs: getAttrs(child),
      };
    }
  }
  return undefined;
}

/** Find all child elements with the given tag name. */
function findChildren(
  children: OrderedNode[],
  tagName: string,
): Array<{ node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> }> {
  const results: Array<{
    node: OrderedNode;
    children: OrderedNode[];
    attrs: Record<string, string>;
  }> = [];
  for (const child of children) {
    if (tagName in child) {
      const childArr = child[tagName];
      results.push({
        node: child,
        children: Array.isArray(childArr) ? (childArr as OrderedNode[]) : [],
        attrs: getAttrs(child),
      });
    }
  }
  return results;
}

/** Get text content from a #text node. */
function getTextContent(child: OrderedNode): string | undefined {
  if ('#text' in child) {
    const val = child['#text'];
    return val != null ? String(val) : undefined;
  }
  return undefined;
}

/**
 * Find the <article> element, handling optional <pmc-articleset> wrapper
 * that appears in efetch responses.
 */
function findArticle(
  parsed: OrderedNode[],
): { node: OrderedNode; children: OrderedNode[]; attrs: Record<string, string> } | undefined {
  const direct = findChild(parsed, 'article');
  if (direct) return direct;
  const wrapper = findChild(parsed, 'pmc-articleset');
  if (wrapper) return findChild(wrapper.children, 'article');
  return undefined;
}

// ─── Text Extraction ─────────────────────────────────────────────────

/** Tags whose text content should be followed by a space when adjacent to other content. */
const SPACE_AFTER_TAGS = new Set([
  'surname',
  'given-names',
  'name',
  'string-name',
]);

/**
 * Extract plain text from a node that may contain nested elements.
 * Recursively collects all text content from preserveOrder nodes.
 *
 * When extracting text from inline container elements (e.g. `<name>`,
 * `<string-name>`), inserts a space between adjacent child elements
 * that would otherwise concatenate without whitespace (e.g.
 * `<surname>McGuire</surname><given-names>N</given-names>` → `McGuire N`).
 */
function extractAllText(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    return joinChildTexts(node);
  }
  if (typeof node === 'object') {
    const obj = node as OrderedNode;
    // Text node
    const text = getTextContent(obj);
    if (text != null) return text;
    // Element node — recurse into children
    const tag = getTagName(obj);
    if (tag) {
      const children = obj[tag];
      if (Array.isArray(children)) {
        return joinChildTexts(children as OrderedNode[]);
      }
    }
  }
  return '';
}

/**
 * Join extracted text from an array of child nodes, inserting spaces
 * between adjacent inline elements where no whitespace separator exists.
 */
function joinChildTexts(children: OrderedNode[]): string {
  const parts: string[] = [];
  for (const child of children) {
    const text = extractAllText(child);
    if (!text) continue;

    const tag = getTagName(child as OrderedNode);

    // If this is a space-after tag and there's previous content that doesn't
    // end with whitespace or punctuation, insert a space before this text.
    if (tag && SPACE_AFTER_TAGS.has(tag) && parts.length > 0) {
      const prev = parts[parts.length - 1]!;
      if (prev && !/[\s,;.:()\-/]$/.test(prev)) {
        parts.push(' ');
      }
    }

    parts.push(text);

    // If this is a space-after tag, check if a space is needed after.
    // We handle this by peeking: space will be inserted before the next
    // element if needed (handled above). But we also need to handle
    // the case where the next sibling is a text node starting without space.
    // That's already handled since text nodes include their own whitespace.
  }
  return parts.join('');
}

// ─── Metadata Parsing ────────────────────────────────────────────────

/**
 * Parse JATS XML front matter to extract article metadata.
 */
export function parseJatsMetadata(xml: string): JatsMetadata {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return { title: '', authors: [] };

  const front = findChild(article.children, 'front');
  if (!front) return { title: '', authors: [] };

  const articleMeta = findChild(front.children, 'article-meta');
  if (!articleMeta) return { title: '', authors: [] };

  const metaChildren = articleMeta.children;

  // Title
  const titleGroup = findChild(metaChildren, 'title-group');
  const articleTitle = titleGroup ? findChild(titleGroup.children, 'article-title') : undefined;
  const title = articleTitle ? extractAllText(articleTitle.children) : '';

  // Article IDs
  const articleIds = findChildren(metaChildren, 'article-id');
  let doi: string | undefined;
  let pmcid: string | undefined;
  let pmid: string | undefined;
  for (const idEntry of articleIds) {
    const idType = idEntry.attrs['pub-id-type'];
    const idText = extractAllText(idEntry.children);
    if (idType === 'doi') doi = idText;
    if (idType === 'pmc' || idType === 'pmcid') {
      pmcid = idText.replace(/^PMC/, '');
    }
    if (idType === 'pmid') pmid = idText;
  }

  // Authors
  const authors: JatsAuthor[] = [];
  const contribGroup = findChild(metaChildren, 'contrib-group');
  if (contribGroup) {
    const contribs = findChildren(contribGroup.children, 'contrib');
    for (const contrib of contribs) {
      if (contrib.attrs['contrib-type'] !== 'author') continue;
      const nameNode = findChild(contrib.children, 'name');
      if (!nameNode) continue;
      const surnameNode = findChild(nameNode.children, 'surname');
      const givenNamesNode = findChild(nameNode.children, 'given-names');
      const author: JatsAuthor = {
        surname: surnameNode ? extractAllText(surnameNode.children) : '',
      };
      const givenNames = givenNamesNode ? extractAllText(givenNamesNode.children) : '';
      if (givenNames) {
        author.givenNames = givenNames;
      }
      authors.push(author);
    }
  }

  // Abstract
  const abstractNode = findChild(metaChildren, 'abstract');
  let abstract: string | undefined;
  if (abstractNode) {
    // Structured abstract with <sec> elements
    const sections = findChildren(abstractNode.children, 'sec');
    if (sections.length > 0) {
      const parts: string[] = [];
      for (const sec of sections) {
        const secTitleNode = findChild(sec.children, 'title');
        const secTitle = secTitleNode ? extractAllText(secTitleNode.children) : '';
        const secPs = findChildren(sec.children, 'p');
        const text = secPs.map((p) => extractAllText(p.children)).join(' ');
        if (secTitle) {
          parts.push(`${secTitle}: ${text}`);
        } else {
          parts.push(text);
        }
      }
      abstract = parts.join('\n\n');
    } else {
      // Simple abstract with <p>
      const paragraphs = findChildren(abstractNode.children, 'p');
      if (paragraphs.length > 0) {
        abstract = paragraphs.map((p) => extractAllText(p.children)).join('\n\n');
      } else {
        const text = extractAllText(abstractNode.children);
        if (text) abstract = text;
      }
    }
  }

  // Journal name (from <front>/<journal-meta>)
  const journalMeta = findChild(front.children, 'journal-meta');
  let journal: string | undefined;
  if (journalMeta) {
    const titleGroup = findChild(journalMeta.children, 'journal-title-group');
    if (titleGroup) {
      const jTitle = findChild(titleGroup.children, 'journal-title');
      if (jTitle) journal = extractAllText(jTitle.children);
    }
    if (!journal) {
      const jTitle = findChild(journalMeta.children, 'journal-title');
      if (jTitle) journal = extractAllText(jTitle.children);
    }
  }

  const result: JatsMetadata = { title, authors };
  if (doi) result.doi = doi;
  if (pmcid) result.pmcid = pmcid;
  if (pmid) result.pmid = pmid;
  if (journal) result.journal = journal;
  if (abstract) result.abstract = abstract;
  return result;
}

// ─── Inline Content Parsing ──────────────────────────────────────────

/**
 * Parse inline content from a paragraph's children array.
 * Iterates in document order to preserve interleaving of text, citations,
 * and formatting elements.
 */
function parseInlineContent(children: OrderedNode[]): InlineContent[] {
  const result: InlineContent[] = [];

  for (const child of children) {
    // Text node
    const text = getTextContent(child);
    if (text != null) {
      if (text) result.push({ type: 'text', text });
      continue;
    }

    const tag = getTagName(child);
    if (!tag) continue;

    const innerChildren = getChildren(child);

    if (tag === 'bold') {
      result.push({ type: 'bold', children: parseInlineContent(innerChildren) });
    } else if (tag === 'italic') {
      result.push({ type: 'italic', children: parseInlineContent(innerChildren) });
    } else if (tag === 'sup') {
      result.push({ type: 'superscript', text: extractAllText(innerChildren) });
    } else if (tag === 'sub') {
      result.push({ type: 'subscript', text: extractAllText(innerChildren) });
    } else if (tag === 'xref') {
      const refType = getAttr(child, 'ref-type');
      if (refType === 'bibr') {
        result.push({
          type: 'citation',
          refId: getAttr(child, 'rid') ?? '',
          text: extractAllText(innerChildren),
        });
      } else {
        const xrefText = extractAllText(innerChildren);
        if (xrefText) result.push({ type: 'text', text: xrefText });
      }
    } else {
      // Unknown inline element — extract text
      const unknownText = extractAllText(innerChildren);
      if (unknownText) result.push({ type: 'text', text: unknownText });
    }
  }

  return result;
}

// ─── Block Content Parsing ───────────────────────────────────────────

/**
 * Parse a <list> element into a BlockElement.
 */
function parseList(listNode: OrderedNode): BlockElement {
  const listType = getAttr(listNode, 'list-type');
  const ordered = listType === 'order';
  const listChildren = getChildren(listNode);
  const listItems = findChildren(listChildren, 'list-item');
  const items: InlineContent[][] = [];

  for (const item of listItems) {
    const pNodes = findChildren(item.children, 'p');
    const content = pNodes.flatMap((p) => parseInlineContent(p.children));
    items.push(content);
  }

  return { type: 'list', ordered, items };
}

/**
 * Parse a table row into an array of cell text content.
 */
function parseTableRow(trChildren: OrderedNode[]): string[] {
  const cells: string[] = [];
  for (const child of trChildren) {
    const tag = getTagName(child);
    if (tag === 'th' || tag === 'td') {
      const cellChildren = getChildren(child);
      // Check if cell contains multiple <p> elements
      const paragraphs = findChildren(cellChildren, 'p');
      if (paragraphs.length > 1) {
        cells.push(
          paragraphs.map((p) => extractAllText(p.children)).join('<br>'),
        );
      } else {
        cells.push(extractAllText(cellChildren));
      }
    }
  }
  return cells;
}

/**
 * Parse an already-parsed table-wrap node.
 */
function parseTableWrap(tableWrapNode: OrderedNode): {
  caption?: string;
  headers: string[];
  rows: string[][];
} {
  const children = getChildren(tableWrapNode);

  // Caption
  const labelNode = findChild(children, 'label');
  const label = labelNode ? extractAllText(labelNode.children) : '';
  const captionNode = findChild(children, 'caption');
  const captionText = captionNode ? extractAllText(captionNode.children) : '';
  const captionStr = [label, captionText].filter(Boolean).join('. ');

  const tableNode = findChild(children, 'table');
  const result: { caption?: string; headers: string[]; rows: string[][] } = {
    headers: [],
    rows: [],
  };
  if (captionStr) result.caption = captionStr;
  if (!tableNode) return result;

  // Headers from thead
  const thead = findChild(tableNode.children, 'thead');
  if (thead) {
    const headRows = findChildren(thead.children, 'tr');
    if (headRows.length > 0) {
      result.headers.push(...parseTableRow(headRows[0]!.children));
    }
  }

  // Body rows
  const tbody = findChild(tableNode.children, 'tbody');
  if (tbody) {
    const bodyRows = findChildren(tbody.children, 'tr');
    for (const row of bodyRows) {
      result.rows.push(parseTableRow(row.children));
    }
  }

  return result;
}

/**
 * Parse a <table-wrap> element into a table block.
 * Exported for standalone use and used internally by parseBlockContent.
 */
export function parseJatsTable(xml: string): {
  caption?: string;
  headers: string[];
  rows: string[][];
} {
  const parsed = parser.parse(xml) as OrderedNode[];
  const tableWrap = findChild(parsed, 'table-wrap');
  if (tableWrap) {
    return parseTableWrap(tableWrap.node);
  }
  // Fallback: if not wrapped, try to find table directly
  return { headers: [], rows: [] };
}

/** Tags that represent block-level elements when nested inside <p>. */
const BLOCK_TAGS = new Set(['table-wrap', 'fig', 'disp-quote']);

/**
 * Parse a <disp-quote> element into a blockquote block.
 * Extracts <p> children and concatenates their inline content.
 */
function parseDispQuote(node: OrderedNode): BlockElement {
  const children = getChildren(node);
  const paragraphs = findChildren(children, 'p');
  const content: InlineContent[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    if (i > 0) content.push({ type: 'text', text: '\n\n' });
    const para = paragraphs[i];
    if (para) content.push(...parseInlineContent(para.children));
  }
  // If no <p> children, extract inline content directly
  if (paragraphs.length === 0) {
    content.push(...parseInlineContent(children));
  }
  return { type: 'blockquote', content };
}

/**
 * Parse a <table-wrap> node into a table block element.
 */
function parseTableBlock(node: OrderedNode): BlockElement {
  const tableResult = parseTableWrap(node);
  const tableBlock: BlockElement = {
    type: 'table',
    headers: tableResult.headers,
    rows: tableResult.rows,
  };
  if (tableResult.caption) tableBlock.caption = tableResult.caption;
  return tableBlock;
}

/**
 * Parse a <fig> node into a figure block element.
 */
function parseFigBlock(node: OrderedNode): BlockElement {
  const innerChildren = getChildren(node);
  const figBlock: BlockElement = { type: 'figure' };
  const figId = getAttr(node, 'id');
  if (figId) figBlock.id = figId;
  const figLabel = findChild(innerChildren, 'label');
  if (figLabel) {
    const labelText = extractAllText(figLabel.children);
    if (labelText) figBlock.label = labelText;
  }
  const figCaption = findChild(innerChildren, 'caption');
  if (figCaption) {
    const captionText = extractAllText(figCaption.children);
    if (captionText) figBlock.caption = captionText;
  }
  return figBlock;
}

/**
 * Parse a <p> element, splitting it if it contains nested block elements
 * (table-wrap, fig, disp-quote). Returns one or more block elements.
 */
function parseParagraph(pChildren: OrderedNode[]): BlockElement[] {
  // Check if <p> contains any nested block elements
  const hasNestedBlocks = pChildren.some((child) => {
    const tag = getTagName(child);
    return tag != null && BLOCK_TAGS.has(tag);
  });

  if (!hasNestedBlocks) {
    return [{ type: 'paragraph', content: parseInlineContent(pChildren) }];
  }

  // Split into inline runs and block elements
  const blocks: BlockElement[] = [];
  let inlineBuffer: OrderedNode[] = [];

  const flushInline = () => {
    if (inlineBuffer.length > 0) {
      const content = parseInlineContent(inlineBuffer);
      // Skip whitespace-only paragraphs created by XML formatting
      const hasNonWhitespace = content.some(
        (c) => c.type !== 'text' || c.text.trim() !== '',
      );
      if (content.length > 0 && hasNonWhitespace) {
        blocks.push({ type: 'paragraph', content });
      }
      inlineBuffer = [];
    }
  };

  for (const child of pChildren) {
    const tag = getTagName(child);
    if (tag === 'table-wrap') {
      flushInline();
      blocks.push(parseTableBlock(child));
    } else if (tag === 'fig') {
      flushInline();
      blocks.push(parseFigBlock(child));
    } else if (tag === 'disp-quote') {
      flushInline();
      blocks.push(parseDispQuote(child));
    } else {
      inlineBuffer.push(child);
    }
  }
  flushInline();

  return blocks;
}

/**
 * Parse block-level content from a section's children.
 * Iterates in document order to preserve ordering of paragraphs, lists,
 * tables, figures, and blockquotes.
 */
function parseBlockContent(sectionChildren: OrderedNode[]): BlockElement[] {
  const blocks: BlockElement[] = [];

  for (const child of sectionChildren) {
    const tag = getTagName(child);
    if (!tag) continue;

    if (tag === 'p') {
      blocks.push(...parseParagraph(getChildren(child)));
    } else if (tag === 'list') {
      blocks.push(parseList(child));
    } else if (tag === 'table-wrap') {
      blocks.push(parseTableBlock(child));
    } else if (tag === 'fig') {
      blocks.push(parseFigBlock(child));
    } else if (tag === 'disp-quote') {
      blocks.push(parseDispQuote(child));
    }
    // Skip title, sec, and other non-block elements
  }

  return blocks;
}

// ─── Section Parsing ─────────────────────────────────────────────────

/**
 * Parse a <sec> element into a JatsSection, recursively handling subsections.
 */
function parseSection(secChildren: OrderedNode[], level: number): JatsSection {
  const titleNode = findChild(secChildren, 'title');
  const title = titleNode ? extractAllText(titleNode.children) : '';
  const content = parseBlockContent(secChildren);

  // Nested sections
  const subsections: JatsSection[] = [];
  const nestedSecs = findChildren(secChildren, 'sec');
  for (const sub of nestedSecs) {
    subsections.push(parseSection(sub.children, level + 1));
  }

  return { title, level, content, subsections };
}

/**
 * Parse JATS XML body to extract sections and content.
 */
export function parseJatsBody(xml: string): JatsSection[] {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return [];

  const body = findChild(article.children, 'body');
  if (!body) return [];

  const sections: JatsSection[] = [];
  const secs = findChildren(body.children, 'sec');

  if (secs.length > 0) {
    for (const sec of secs) {
      sections.push(parseSection(sec.children, 2));
    }
  } else {
    // Body has paragraphs without sections
    const content = parseBlockContent(body.children);
    if (content.length > 0) {
      sections.push({ title: '', level: 2, content, subsections: [] });
    }
  }

  return sections;
}

// ─── Reference Parsing ───────────────────────────────────────────────

/**
 * Format a structured <element-citation> into a readable reference string.
 * Produces: "Author1, Author2. Title. Source. Year;Volume:FirstPage-LastPage."
 */
function formatElementCitation(children: OrderedNode[]): string {
  const parts: string[] = [];

  // Authors from person-group
  const personGroup = findChild(children, 'person-group');
  if (personGroup) {
    const names = findChildren(personGroup.children, 'name');
    const authorParts: string[] = [];
    for (const name of names) {
      const surname = findChild(name.children, 'surname');
      const givenNames = findChild(name.children, 'given-names');
      const surnameText = surname ? extractAllText(surname.children) : '';
      const givenText = givenNames ? extractAllText(givenNames.children) : '';
      if (surnameText && givenText) {
        authorParts.push(`${surnameText} ${givenText}`);
      } else if (surnameText) {
        authorParts.push(surnameText);
      }
    }
    if (authorParts.length > 0) {
      parts.push(authorParts.join(', '));
    }
  }

  // Article title
  const articleTitle = findChild(children, 'article-title');
  if (articleTitle) {
    parts.push(extractAllText(articleTitle.children));
  }

  // Source (journal name)
  const source = findChild(children, 'source');
  if (source) {
    parts.push(extractAllText(source.children));
  }

  // Year, volume, pages
  const year = findChild(children, 'year');
  const volume = findChild(children, 'volume');
  const fpage = findChild(children, 'fpage');
  const lpage = findChild(children, 'lpage');

  if (year) {
    let yearStr = extractAllText(year.children);
    if (volume) {
      yearStr += `;${extractAllText(volume.children)}`;
    }
    if (fpage) {
      const fpageText = extractAllText(fpage.children);
      const lpageText = lpage ? extractAllText(lpage.children) : '';
      yearStr += `:${fpageText}${lpageText ? `-${lpageText}` : ''}`;
    }
    parts.push(yearStr);
  }

  return parts.join('. ') + '.';
}

/**
 * Extract text from a <mixed-citation>'s children, deduplicating any
 * <pub-id> content that also appears as inline text.
 *
 * Some publishers include the DOI/PMID both as a text node and inside
 * a <pub-id> element, causing duplication like "10.1234/x 10.1234/x".
 */
function extractMixedCitationText(children: OrderedNode[]): string {
  // Collect pub-id values
  const pubIds = findChildren(children, 'pub-id');
  const pubIdValues = pubIds
    .map((p) => extractAllText(p.children).trim())
    .filter(Boolean);

  if (pubIdValues.length === 0) {
    return extractAllText(children).trim();
  }

  // Extract full text
  const fullText = extractAllText(children).trim();

  // For each pub-id value, if it appears more than once, remove extra occurrences
  let result = fullText;
  for (const val of pubIdValues) {
    // Escape regex special characters
    const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = result.match(new RegExp(escaped, 'g'));
    if (matches && matches.length > 1) {
      // Remove the first occurrence (typically the inline text), keep the last (pub-id element)
      result = result.replace(val, '');
      // Clean up any leftover extra whitespace
      result = result.replace(/\s{2,}/g, ' ').trim();
    }
  }

  return result;
}

/**
 * Parse JATS XML back matter to extract references.
 */
export function parseJatsReferences(xml: string): JatsReference[] {
  const parsed = parser.parse(xml) as OrderedNode[];
  const article = findArticle(parsed);
  if (!article) return [];

  const back = findChild(article.children, 'back');
  if (!back) return [];

  const refList = findChild(back.children, 'ref-list');
  if (!refList) return [];

  const refs = findChildren(refList.children, 'ref');
  const references: JatsReference[] = [];

  for (const ref of refs) {
    const id = ref.attrs['id'] ?? '';

    // Determine the search scope: if <citation-alternatives> exists, search within it;
    // otherwise search direct children of <ref>
    const citationAlternatives = findChild(ref.children, 'citation-alternatives');
    const searchChildren = citationAlternatives ? citationAlternatives.children : ref.children;

    // Try mixed-citation first (already formatted), then element-citation (structured)
    const mixedCitation = findChild(searchChildren, 'mixed-citation');
    if (mixedCitation) {
      const text = extractMixedCitationText(mixedCitation.children);
      if (id && text) references.push({ id, text });
      continue;
    }

    const elementCitation = findChild(searchChildren, 'element-citation');
    if (elementCitation) {
      const text = formatElementCitation(elementCitation.children);
      if (id && text) references.push({ id, text });
      continue;
    }

    // Fallback: extract all text from ref, skipping <label>
    const childrenWithoutLabel = ref.children.filter((c) => !('label' in c));
    const text = extractAllText(childrenWithoutLabel).trim();
    if (id && text) {
      references.push({ id, text });
    }
  }

  return references;
}
