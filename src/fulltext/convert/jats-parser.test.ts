import { describe, it, expect } from 'vitest';
import { parseJatsMetadata, parseJatsBody } from './jats-parser.js';

describe('parseJatsMetadata', () => {
  it('extracts title from <article-title>', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Machine Learning in Healthcare</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe('Machine Learning in Healthcare');
  });

  it('extracts authors from <contrib-group>', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <contrib-group>
              <contrib contrib-type="author">
                <name><surname>Smith</surname><given-names>John A.</given-names></name>
              </contrib>
              <contrib contrib-type="author">
                <name><surname>Jones</surname><given-names>Alice</given-names></name>
              </contrib>
            </contrib-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.authors).toEqual([
      { surname: 'Smith', givenNames: 'John A.' },
      { surname: 'Jones', givenNames: 'Alice' },
    ]);
  });

  it('extracts DOI from <article-id pub-id-type="doi">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="doi">10.1234/example</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.doi).toBe('10.1234/example');
  });

  it('extracts PMCID from <article-id pub-id-type="pmc">', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmc">1234567</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.pmcid).toBe('1234567');
  });

  it('extracts abstract from <abstract>', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <abstract><p>This is the abstract text.</p></abstract>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.abstract).toBe('This is the abstract text.');
  });

  it('handles structured abstract with multiple sections', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <abstract>
              <sec>
                <title>Background</title>
                <p>Background text.</p>
              </sec>
              <sec>
                <title>Methods</title>
                <p>Methods text.</p>
              </sec>
            </abstract>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.abstract).toContain('Background');
    expect(metadata.abstract).toContain('Background text.');
    expect(metadata.abstract).toContain('Methods');
    expect(metadata.abstract).toContain('Methods text.');
  });

  it('handles missing optional fields gracefully', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Minimal Article</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe('Minimal Article');
    expect(metadata.authors).toEqual([]);
    expect(metadata.doi).toBeUndefined();
    expect(metadata.pmcid).toBeUndefined();
    expect(metadata.abstract).toBeUndefined();
  });

  it('handles multiple article-id elements', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="doi">10.1234/example</article-id>
            <article-id pub-id-type="pmc">7654321</article-id>
            <article-id pub-id-type="pmid">12345678</article-id>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.doi).toBe('10.1234/example');
    expect(metadata.pmcid).toBe('7654321');
  });

  it('skips non-author contributors', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>Test</article-title>
            </title-group>
            <contrib-group>
              <contrib contrib-type="author">
                <name><surname>Smith</surname><given-names>John</given-names></name>
              </contrib>
              <contrib contrib-type="editor">
                <name><surname>Editor</surname><given-names>Jane</given-names></name>
              </contrib>
            </contrib-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.authors).toHaveLength(1);
    expect(metadata.authors[0]!.surname).toBe('Smith');
  });
});

describe('parseJatsBody', () => {
  it('extracts sections from <body><sec>', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>Intro paragraph.</p>
          </sec>
          <sec>
            <title>Methods</title>
            <p>Methods paragraph.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.title).toBe('Introduction');
    expect(sections[1]!.title).toBe('Methods');
    expect(sections[0]!.level).toBe(2);
  });

  it('handles nested sections (h2, h3, h4)', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Methods</title>
            <p>Methods intro.</p>
            <sec>
              <title>Participants</title>
              <p>Participant details.</p>
              <sec>
                <title>Inclusion Criteria</title>
                <p>Criteria text.</p>
              </sec>
            </sec>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe('Methods');
    expect(sections[0]!.level).toBe(2);
    expect(sections[0]!.subsections).toHaveLength(1);
    expect(sections[0]!.subsections[0]!.title).toBe('Participants');
    expect(sections[0]!.subsections[0]!.level).toBe(3);
    expect(sections[0]!.subsections[0]!.subsections[0]!.title).toBe('Inclusion Criteria');
    expect(sections[0]!.subsections[0]!.subsections[0]!.level).toBe(4);
  });

  it('extracts paragraphs <p>', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>First paragraph.</p>
            <p>Second paragraph.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections[0]!.content).toHaveLength(2);
    expect(sections[0]!.content[0]!.type).toBe('paragraph');
  });

  it('handles lists <list> as bullet/numbered lists', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Points</title>
            <list list-type="bullet">
              <list-item><p>Item one</p></list-item>
              <list-item><p>Item two</p></list-item>
            </list>
            <list list-type="order">
              <list-item><p>First step</p></list-item>
              <list-item><p>Second step</p></list-item>
            </list>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]!.content;
    expect(content).toHaveLength(2);

    const bulletList = content[0]!;
    expect(bulletList.type).toBe('list');
    if (bulletList.type === 'list') {
      expect(bulletList.ordered).toBe(false);
      expect(bulletList.items).toHaveLength(2);
    }

    const orderedList = content[1]!;
    expect(orderedList.type).toBe('list');
    if (orderedList.type === 'list') {
      expect(orderedList.ordered).toBe(true);
      expect(orderedList.items).toHaveLength(2);
    }
  });

  it('handles inline elements (bold, italic, superscript)', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Formatting</title>
            <p>This has <bold>bold</bold> and <italic>italic</italic> and <sup>2</sup> text.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]!.content[0]!;
    expect(para.type).toBe('paragraph');
    if (para.type === 'paragraph') {
      const types = para.content.map((c) => c.type);
      expect(types).toContain('text');
      expect(types).toContain('bold');
      expect(types).toContain('italic');
      expect(types).toContain('superscript');
    }
  });

  it('handles body with no sections (just paragraphs)', () => {
    const xml = `
      <article>
        <body>
          <p>Just a paragraph without sections.</p>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe('');
    expect(sections[0]!.content).toHaveLength(1);
  });
});
