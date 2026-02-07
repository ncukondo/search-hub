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

  it('converts figures with caption in alt text position', () => {
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
    expect(md).toContain('![Figure 1. Score distribution]()');
  });

  it('converts figures without caption using label only', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'figure', label: 'Figure 2' },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('![Figure 2]()');
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

  it('renders blockquote among paragraphs and tables', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Discussion',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Opening statement.' }] },
            {
              type: 'blockquote',
              content: [
                { type: 'text', text: 'A notable ' },
                { type: 'italic', children: [{ type: 'text', text: 'finding' }] },
                { type: 'text', text: ' from the study.' },
              ],
            },
            {
              type: 'table',
              headers: ['Metric', 'Value'],
              rows: [['Accuracy', '95%']],
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'Closing statement.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Opening statement.');
    expect(md).toContain('> A notable *finding* from the study.');
    expect(md).toContain('| Metric | Value |');
    expect(md).toContain('Closing statement.');
  });

  it('skips heading line when section title is empty', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Content without heading.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Content without heading.');
    expect(md).not.toMatch(/^## $/m);
    expect(md).not.toContain('## \n');
  });

  it('skips heading line when section title is whitespace-only', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '   ',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Content here.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('Content here.');
    expect(md).not.toMatch(/^##\s+$/m);
  });

  it('renders section with empty title but with subsections', () => {
    const doc = makeDoc({
      sections: [
        {
          title: '',
          level: 2,
          content: [],
          subsections: [
            {
              title: 'Named Subsection',
              level: 3,
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Sub content.' }] },
              ],
              subsections: [],
            },
          ],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('### Named Subsection');
    expect(md).toContain('Sub content.');
    expect(md).not.toMatch(/^## $/m);
  });

  it('renders boxed-text as blockquote with bold title', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            {
              type: 'boxed-text',
              title: 'Key Points',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Point 1: Important finding.' }] },
                { type: 'paragraph', content: [{ type: 'text', text: 'Point 2: Another finding.' }] },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> **Key Points**');
    expect(md).toContain('> Point 1: Important finding.');
    expect(md).toContain('> Point 2: Another finding.');
  });

  it('renders boxed-text without title', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            {
              type: 'boxed-text',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'Some boxed content.' }] },
              ],
            },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    expect(md).toContain('> Some boxed content.');
    expect(md).not.toContain('> **');
  });

  it('E2E: renders document with table, figure, and empty section correctly', () => {
    const doc = makeDoc({
      sections: [
        {
          title: 'Results',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'See table and figure below.' }] },
            {
              type: 'table',
              caption: 'Table 1. Interview guide',
              headers: ['Topic', 'Prompts'],
              rows: [
                ['Introduction<br>Explain purpose.', 'Welcome participant.'],
              ],
            },
            { type: 'figure', label: 'Fig. 1', caption: 'Score distribution across groups' },
          ],
          subsections: [],
        },
        {
          title: '',
          level: 2,
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Supplementary material.' }] },
          ],
          subsections: [],
        },
      ],
    });
    const md = writeMarkdown(doc);
    // Table renders correctly with <br> in cells
    expect(md).toContain('| Introduction<br>Explain purpose. | Welcome participant. |');
    // Figure caption is in alt text position
    expect(md).toContain('![Fig. 1. Score distribution across groups]()');
    // Empty section title is skipped
    expect(md).not.toMatch(/^## $/m);
    expect(md).toContain('Supplementary material.');
  });
});
