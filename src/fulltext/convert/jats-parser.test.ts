import { describe, it, expect } from 'vitest';
import { parseJatsMetadata, parseJatsBody, parseJatsTable, parseJatsReferences } from './jats-parser.js';

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

describe('parseJatsTable', () => {
  it('converts <table-wrap> to table structure', () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th>Name</th><th>Value</th></tr>
          </thead>
          <tbody>
            <tr><td>A</td><td>1</td></tr>
            <tr><td>B</td><td>2</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toEqual(['Name', 'Value']);
    expect(table.rows).toEqual([
      ['A', '1'],
      ['B', '2'],
    ]);
  });

  it('handles <thead>, <tbody>, <tr>, <td>, <th>', () => {
    const xml = `
      <table-wrap>
        <table>
          <thead>
            <tr><th>Col1</th><th>Col2</th><th>Col3</th></tr>
          </thead>
          <tbody>
            <tr><td>a</td><td>b</td><td>c</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toHaveLength(3);
    expect(table.rows[0]).toHaveLength(3);
  });

  it('extracts table caption', () => {
    const xml = `
      <table-wrap>
        <label>Table 1</label>
        <caption><p>Demographic characteristics</p></caption>
        <table>
          <thead><tr><th>Age</th></tr></thead>
          <tbody><tr><td>25</td></tr></tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.caption).toContain('Table 1');
    expect(table.caption).toContain('Demographic characteristics');
  });

  it('handles table without thead (all rows)', () => {
    const xml = `
      <table-wrap>
        <table>
          <tbody>
            <tr><td>A</td><td>1</td></tr>
            <tr><td>B</td><td>2</td></tr>
          </tbody>
        </table>
      </table-wrap>
    `;
    const table = parseJatsTable(xml);
    expect(table.headers).toEqual([]);
    expect(table.rows).toHaveLength(2);
  });

  it('handles tables in body sections', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>See the table below.</p>
            <table-wrap>
              <table>
                <thead><tr><th>Item</th><th>Count</th></tr></thead>
                <tbody><tr><td>X</td><td>10</td></tr></tbody>
              </table>
            </table-wrap>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]!.content;
    expect(content).toHaveLength(2);
    expect(content[0]!.type).toBe('paragraph');
    expect(content[1]!.type).toBe('table');
    if (content[1]!.type === 'table') {
      expect(content[1]!.headers).toEqual(['Item', 'Count']);
    }
  });
});

describe('parseJatsBody - figures', () => {
  it('extracts <fig> with caption', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>See Figure 1.</p>
            <fig id="fig1">
              <label>Figure 1</label>
              <caption><p>Distribution of scores</p></caption>
            </fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]!.content;
    expect(content).toHaveLength(2);
    expect(content[1]!.type).toBe('figure');
    if (content[1]!.type === 'figure') {
      expect(content[1]!.label).toBe('Figure 1');
      expect(content[1]!.caption).toBe('Distribution of scores');
    }
  });

  it('handles figure without caption', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <fig id="fig2">
              <label>Figure 2</label>
            </fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]!.content;
    const fig = content[0]!;
    expect(fig.type).toBe('figure');
    if (fig.type === 'figure') {
      expect(fig.label).toBe('Figure 2');
      expect(fig.caption).toBeUndefined();
    }
  });
});

describe('parseJatsBody - citations', () => {
  it('converts <xref ref-type="bibr"> to citation markers', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>As shown previously <xref ref-type="bibr" rid="ref1">[1]</xref>, the method works.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]!.content[0]!;
    if (para.type === 'paragraph') {
      const citation = para.content.find((c) => c.type === 'citation');
      expect(citation).toBeDefined();
      if (citation?.type === 'citation') {
        expect(citation.refId).toBe('ref1');
        expect(citation.text).toBe('[1]');
      }
    }
  });
});

describe('parseJatsBody - preserveOrder inline interleaving', () => {
  it('preserves order of interleaved text and <xref> citations', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>The adage [<xref ref-type="bibr" rid="CR1">1</xref>]. Several studies
[<xref ref-type="bibr" rid="CR2">2</xref>,<xref ref-type="bibr" rid="CR3">3</xref>].</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]!.content[0]!;
    expect(para.type).toBe('paragraph');
    if (para.type === 'paragraph') {
      const types = para.content.map((c) => c.type);
      // Must be interleaved: text, citation, text, citation, text, citation, text
      expect(types).toEqual(['text', 'citation', 'text', 'citation', 'text', 'citation', 'text']);

      // Verify text positions
      expect(para.content[0]).toEqual({ type: 'text', text: 'The adage [' });
      expect(para.content[1]).toEqual({ type: 'citation', refId: 'CR1', text: '1' });
      expect(para.content[2]).toEqual({ type: 'text', text: ']. Several studies\n[' });
      expect(para.content[3]).toEqual({ type: 'citation', refId: 'CR2', text: '2' });
      expect(para.content[4]).toEqual({ type: 'text', text: ',' });
      expect(para.content[5]).toEqual({ type: 'citation', refId: 'CR3', text: '3' });
      expect(para.content[6]).toEqual({ type: 'text', text: '].' });
    }
  });

  it('preserves order of interleaved text and <italic> formatting', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Test</title>
            <p>this is the <italic>yanegawara</italic> system. Under the <italic>yanegawara</italic> system</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]!.content[0]!;
    expect(para.type).toBe('paragraph');
    if (para.type === 'paragraph') {
      expect(para.content).toEqual([
        { type: 'text', text: 'this is the ' },
        { type: 'italic', children: [{ type: 'text', text: 'yanegawara' }] },
        { type: 'text', text: ' system. Under the ' },
        { type: 'italic', children: [{ type: 'text', text: 'yanegawara' }] },
        { type: 'text', text: ' system' },
      ]);
    }
  });

  it('preserves block element ordering (p, list, table-wrap, fig)', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Results</title>
            <p>First paragraph.</p>
            <table-wrap>
              <table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
            </table-wrap>
            <p>Second paragraph.</p>
            <list list-type="bullet">
              <list-item><p>Item one</p></list-item>
            </list>
            <fig id="fig1"><label>Figure 1</label></fig>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const content = sections[0]!.content;
    expect(content.map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph', 'list', 'figure']);
  });
});

describe('parseJatsReferences', () => {
  it('extracts <ref-list> references', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. Title of paper. Journal. 2024;1:1-10.</mixed-citation>
            </ref>
            <ref id="ref2">
              <mixed-citation>Jones A. Another paper. Nature. 2023;5:20-30.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(2);
    expect(refs[0]!.id).toBe('ref1');
    expect(refs[0]!.text).toContain('Smith J');
    expect(refs[1]!.id).toBe('ref2');
    expect(refs[1]!.text).toContain('Jones A');
  });

  it('handles empty ref-list', () => {
    const xml = `
      <article>
        <back>
          <ref-list></ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toEqual([]);
  });

  it('handles missing back section', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group><article-title>Test</article-title></title-group>
          </article-meta>
        </front>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toEqual([]);
  });
});

describe('pmc-articleset wrapper handling', () => {
  it('extracts metadata from efetch-wrapped XML (pmc-articleset)', () => {
    const xml = `
      <pmc-articleset>
        <article>
          <front>
            <article-meta>
              <article-id pub-id-type="pmc">9876543</article-id>
              <article-id pub-id-type="doi">10.1234/test</article-id>
              <title-group>
                <article-title>Wrapped Article</article-title>
              </title-group>
            </article-meta>
          </front>
        </article>
      </pmc-articleset>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe('Wrapped Article');
    expect(metadata.pmcid).toBe('9876543');
    expect(metadata.doi).toBe('10.1234/test');
  });

  it('extracts body sections from efetch-wrapped XML', () => {
    const xml = `
      <pmc-articleset>
        <article>
          <body>
            <sec>
              <title>Introduction</title>
              <p>Some text.</p>
            </sec>
          </body>
        </article>
      </pmc-articleset>
    `;
    const sections = parseJatsBody(xml);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe('Introduction');
  });

  it('extracts references from efetch-wrapped XML', () => {
    const xml = `
      <pmc-articleset>
        <article>
          <back>
            <ref-list>
              <ref id="ref1">
                <mixed-citation>Smith J. A study. Nature. 2024.</mixed-citation>
              </ref>
            </ref-list>
          </back>
        </article>
      </pmc-articleset>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('ref1');
  });

  it('still works with direct article XML (no wrapper)', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <article-id pub-id-type="pmc">1234567</article-id>
            <title-group>
              <article-title>Direct Article</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe('Direct Article');
    expect(metadata.pmcid).toBe('1234567');
  });
});

describe('parseJatsReferences - element-citation formatting', () => {
  it('formats element-citation with structured children and proper spacing', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <label>1</label>
              <element-citation publication-type="journal-article">
                <person-group><name><surname>Bowyer</surname><given-names>ER</given-names></name></person-group>
                <article-title>Informal near-peer teaching</article-title>
                <source>Educ Health</source>
                <year>2021</year>
                <volume>34</volume>
                <fpage>29</fpage>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.id).toBe('CR1');
    // Should have proper spacing between elements
    expect(refs[0]!.text).toBe('Bowyer ER. Informal near-peer teaching. Educ Health. 2021;34:29.');
  });

  it('formats element-citation with multiple authors', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR2">
              <label>2</label>
              <element-citation publication-type="journal-article">
                <person-group>
                  <name><surname>Smith</surname><given-names>J</given-names></name>
                  <name><surname>Jones</surname><given-names>AB</given-names></name>
                </person-group>
                <article-title>Some title</article-title>
                <source>Nature</source>
                <year>2023</year>
                <volume>10</volume>
                <fpage>100</fpage>
                <lpage>110</lpage>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]!.text).toBe('Smith J, Jones AB. Some title. Nature. 2023;10:100-110.');
  });

  it('does not duplicate label numbers in reference text', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="CR1">
              <label>1</label>
              <element-citation publication-type="journal-article">
                <person-group><name><surname>Test</surname><given-names>A</given-names></name></person-group>
                <article-title>Title</article-title>
                <source>J Test</source>
                <year>2020</year>
              </element-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    // Label "1" should not appear in the text
    expect(refs[0]!.text).not.toMatch(/^1/);
    expect(refs[0]!.text).toBe('Test A. Title. J Test. 2020.');
  });

  it('falls back to extractAllText for mixed-citation', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. Title of paper. Journal. 2024;1:1-10.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]!.text).toBe('Smith J. Title of paper. Journal. 2024;1:1-10.');
  });
});

describe('HTML numeric character reference decoding', () => {
  it('decodes numeric entities in title text', () => {
    const xml = `
      <article>
        <front>
          <article-meta>
            <title-group>
              <article-title>The &#8216;smart&#8217; approach &#8211; a new &#8212; method</article-title>
            </title-group>
          </article-meta>
        </front>
      </article>
    `;
    const metadata = parseJatsMetadata(xml);
    expect(metadata.title).toBe('The \u2018smart\u2019 approach \u2013 a new \u2014 method');
  });

  it('decodes numeric entities in body text', () => {
    const xml = `
      <article>
        <body>
          <sec>
            <title>Introduction</title>
            <p>The patient&#8217;s condition improved &#8212; significantly.</p>
          </sec>
        </body>
      </article>
    `;
    const sections = parseJatsBody(xml);
    const para = sections[0]!.content[0]!;
    expect(para.type).toBe('paragraph');
    if (para.type === 'paragraph') {
      const text = para.content.map(c => c.type === 'text' ? c.text : '').join('');
      expect(text).toContain('\u2019');
      expect(text).toContain('\u2014');
      expect(text).not.toContain('&#8217;');
      expect(text).not.toContain('&#8212;');
    }
  });

  it('decodes numeric entities in reference text', () => {
    const xml = `
      <article>
        <back>
          <ref-list>
            <ref id="ref1">
              <mixed-citation>Smith J. The patient&#8217;s guide. 2024.</mixed-citation>
            </ref>
          </ref-list>
        </back>
      </article>
    `;
    const refs = parseJatsReferences(xml);
    expect(refs[0]!.text).toContain('\u2019');
    expect(refs[0]!.text).not.toContain('&#8217;');
  });
});
