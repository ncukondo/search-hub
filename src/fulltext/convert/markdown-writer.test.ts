import { describe, it, expect } from 'vitest';
import { writeMarkdown } from './markdown-writer.js';
import type { JatsDocument } from './types.js';

function makeDoc(overrides: Partial<JatsDocument> = {}): JatsDocument {
  return {
    metadata: {
      title: 'Test Article',
      authors: [],
      ...overrides.metadata,
    },
    sections: overrides.sections ?? [],
    references: overrides.references ?? [],
  };
}

describe('writeMarkdown', () => {
  it('generates Markdown header with metadata', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Machine Learning in Healthcare',
        authors: [
          { surname: 'Smith', givenNames: 'John' },
          { surname: 'Jones', givenNames: 'Alice' },
        ],
        doi: '10.1234/example',
        pmcid: '1234567',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('# Machine Learning in Healthcare');
    expect(md).toContain('**Authors**: Smith J, Jones A');
    expect(md).toContain('**DOI**: 10.1234/example');
    expect(md).toContain('**PMC**: PMC1234567');
  });

  it('converts sections to ## headings', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Introduction',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Intro text.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Introduction');
    expect(md).toContain('Intro text.');
  });

  it('converts nested sections to ### headings', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Methods',
          level: 2,
          content: [],
          subsections: [
            {
              title: 'Participants',
              level: 3,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Details.' }] },
              ],
              subsections: [],
            },
          ],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Methods');
    expect(md).toContain('### Participants');
    expect(md).toContain('Details.');
  });

  it('converts paragraphs with proper spacing', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph.' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('First paragraph.\n\nSecond paragraph.');
  });

  it('converts tables to Markdown tables', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Data',
          level: 2,
          content: [
            {
              type: 'table',
              caption: 'Table 1. Results',
              headers: ['Name', 'Value'],
              rows: [
                ['A', '1'],
                ['B', '2'],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('*Table 1. Results*');
    expect(md).toContain('| Name | Value |');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| A | 1 |');
    expect(md).toContain('| B | 2 |');
  });

  it('converts blockquotes to > prefixed lines', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Interview',
          level: 2,
          content: [
            {
              type: 'blockquote',
              content: [{ type: 'text', text: 'This is a quoted passage.' }],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> This is a quoted passage.');
  });

  it('converts multi-paragraph blockquotes with > prefix on each paragraph', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Interview',
          level: 2,
          content: [
            {
              type: 'blockquote',
              content: [
                { type: 'text', text: 'First paragraph.' },
                { type: 'text', text: '\n\n' },
                { type: 'text', text: 'Second paragraph.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> First paragraph.');
    expect(md).toContain('> Second paragraph.');
  });

  it('converts figures to ![Figure N](caption)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'figure', label: 'Figure 1', caption: 'Score distribution' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('![Figure 1](Score distribution)');
  });

  it('converts lists (ordered and unordered)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Steps',
          level: 2,
          content: [
            {
              type: 'list',
              ordered: false,
              items: [
                [{ type: 'text', text: 'Item one' }],
                [{ type: 'text', text: 'Item two' }],
              ],
            },
            {
              type: 'list',
              ordered: true,
              items: [
                [{ type: 'text', text: 'First step' }],
                [{ type: 'text', text: 'Second step' }],
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('- Item one');
    expect(md).toContain('- Item two');
    expect(md).toContain('1. First step');
    expect(md).toContain('2. Second step');
  });

  it('preserves inline formatting (bold, italic)', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Text',
          level: 2,
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Normal ' },
                { type: 'bold', children: [{ type: 'text', text: 'bold' }] },
                { type: 'text', text: ' and ' },
                { type: 'italic', children: [{ type: 'text', text: 'italic' }] },
                { type: 'text', text: ' and ' },
                { type: 'superscript', text: '2' },
                { type: 'text', text: ' end.' },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Normal **bold** and *italic* and ^2^ end.');
  });

  it('generates references section', () => {
    const doc = makeDoc({
      references: [
        { id: 'ref1', text: 'Smith J. Title. Journal. 2024.' },
        { id: 'ref2', text: 'Jones A. Another. Nature. 2023.' },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## References');
    expect(md).toContain('1. Smith J. Title. Journal. 2024.');
    expect(md).toContain('2. Jones A. Another. Nature. 2023.');
  });

  it('includes abstract from metadata', () => {
    const doc = makeDoc({
      metadata: {
        title: 'Test',
        authors: [],
        abstract: 'This is the abstract.',
      },
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('## Abstract');
    expect(md).toContain('This is the abstract.');
  });

  it('handles empty document gracefully', () => {
    const doc = makeDoc();
    const md = writeMarkdown(doc);
    expect(md).toContain('# Test Article');
    expect(typeof md).toBe('string');
  });
});
