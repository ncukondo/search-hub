/**
 * Markdown writer for JATS XML conversion.
 *
 * Converts the intermediate JatsDocument representation to Markdown text.
 */

import type {
  JatsDocument,
  JatsSection,
  BlockElement,
  InlineContent,
  JatsReference,
} from './types.js';

/**
 * Format an author's name in abbreviated form (e.g., "Smith J").
 */
function formatAuthor(author: { surname: string; givenNames?: string }): string {
  if (!author.givenNames) return author.surname;
  const initials = author.givenNames
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('');
  return `${author.surname} ${initials}`;
}

/**
 * Render inline content to Markdown string.
 */
function renderInline(content: InlineContent[]): string {
  return content
    .map((node) => {
      switch (node.type) {
        case 'text':
          return node.text;
        case 'bold':
          return `**${renderInline(node.children)}**`;
        case 'italic':
          return `*${renderInline(node.children)}*`;
        case 'superscript':
          return `^${node.text}^`;
        case 'subscript':
          return `~${node.text}~`;
        case 'citation':
          return node.text;
      }
    })
    .join('');
}

/**
 * Render a block element to Markdown lines.
 */
function renderBlock(block: BlockElement): string {
  switch (block.type) {
    case 'paragraph':
      return renderInline(block.content);

    case 'blockquote': {
      const text = renderInline(block.content);
      return text
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
    }

    case 'list': {
      return block.items
        .map((item, i) => {
          const prefix = block.ordered ? `${i + 1}. ` : '- ';
          return `${prefix}${renderInline(item)}`;
        })
        .join('\n');
    }

    case 'table': {
      const lines: string[] = [];
      if (block.caption) {
        lines.push(`*${block.caption}*`);
        lines.push('');
      }
      if (block.headers.length > 0) {
        lines.push(`| ${block.headers.join(' | ')} |`);
        lines.push(`| ${block.headers.map(() => '---').join(' | ')} |`);
      }
      for (const row of block.rows) {
        lines.push(`| ${row.join(' | ')} |`);
      }
      return lines.join('\n');
    }

    case 'figure': {
      const label = block.label ?? 'Figure';
      const altText = block.caption ? `${label}. ${block.caption}` : label;
      return `![${altText}]()`;
    }

    case 'boxed-text': {
      const lines: string[] = [];
      if (block.title) {
        lines.push(`> **${block.title}**`);
        lines.push('>');
      }
      for (const inner of block.content) {
        const rendered = renderBlock(inner);
        rendered.split('\n').forEach((line) => {
          lines.push(line === '' ? '>' : `> ${line}`);
        });
      }
      return lines.join('\n');
    }
  }
}

/**
 * Render a section and its subsections to Markdown.
 */
function renderSection(section: JatsSection): string {
  const lines: string[] = [];
  const heading = '#'.repeat(section.level);

  if (section.title.trim()) {
    lines.push(`${heading} ${section.title}`);
    lines.push('');
  }

  for (const block of section.content) {
    lines.push(renderBlock(block));
    lines.push('');
  }

  for (const sub of section.subsections) {
    lines.push(renderSection(sub));
  }

  return lines.join('\n');
}

/**
 * Render references section.
 */
function renderReferences(references: JatsReference[]): string {
  if (references.length === 0) return '';
  const lines: string[] = ['## References', ''];
  references.forEach((ref, i) => {
    lines.push(`${i + 1}. ${ref.text}`);
  });
  lines.push('');
  return lines.join('\n');
}

/**
 * Convert a parsed JATS document to Markdown string.
 */
export function writeMarkdown(doc: JatsDocument): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${doc.metadata.title}`);
  lines.push('');

  // Authors
  if (doc.metadata.authors.length > 0) {
    const authorStr = doc.metadata.authors.map(formatAuthor).join(', ');
    lines.push(`**Authors**: ${authorStr}`);
  }

  // DOI
  if (doc.metadata.doi) {
    lines.push(`**DOI**: ${doc.metadata.doi}`);
  }

  // PMC
  if (doc.metadata.pmcid) {
    lines.push(`**PMC**: PMC${doc.metadata.pmcid}`);
  }

  if (doc.metadata.authors.length > 0 || doc.metadata.doi || doc.metadata.pmcid) {
    lines.push('');
  }

  // Abstract
  if (doc.metadata.abstract) {
    lines.push('## Abstract');
    lines.push('');
    lines.push(doc.metadata.abstract);
    lines.push('');
  }

  // Sections
  for (const section of doc.sections) {
    lines.push(renderSection(section));
  }

  // References
  if (doc.references.length > 0) {
    lines.push(renderReferences(doc.references));
  }

  return lines.join('\n').trimEnd() + '\n';
}
