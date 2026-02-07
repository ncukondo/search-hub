/**
 * Intermediate representation types for JATS XML to Markdown conversion.
 * These types represent the parsed document structure between parsing and writing.
 */

/** Author information extracted from JATS contrib-group. */
export interface JatsAuthor {
  surname: string;
  givenNames?: string;
}

/** Metadata extracted from JATS front matter. */
export interface JatsMetadata {
  title: string;
  authors: JatsAuthor[];
  doi?: string;
  pmcid?: string;
  pmid?: string;
  journal?: string;
  publicationDate?: { year: string; month?: string; day?: string };
  volume?: string;
  issue?: string;
  pages?: string;
  keywords?: string[];
  abstract?: string;
}

/** Inline content element (text with optional formatting). */
export type InlineContent =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: InlineContent[] }
  | { type: 'italic'; children: InlineContent[] }
  | { type: 'superscript'; text: string }
  | { type: 'subscript'; text: string }
  | { type: 'citation'; refId: string; text: string };

/** A block-level element within a section. */
export type BlockElement =
  | { type: 'paragraph'; content: InlineContent[] }
  | { type: 'blockquote'; content: InlineContent[] }
  | { type: 'list'; ordered: boolean; items: InlineContent[][] }
  | { type: 'table'; caption?: string; headers: string[]; rows: string[][] }
  | { type: 'figure'; id?: string; label?: string; caption?: string };

/** A document section (may contain nested subsections). */
export interface JatsSection {
  title: string;
  level: number; // 2 for h2, 3 for h3, etc.
  content: BlockElement[];
  subsections: JatsSection[];
}

/** A reference entry from the back matter. */
export interface JatsReference {
  id: string;
  text: string;
}

/** Complete parsed JATS document. */
export interface JatsDocument {
  metadata: JatsMetadata;
  sections: JatsSection[];
  references: JatsReference[];
}
