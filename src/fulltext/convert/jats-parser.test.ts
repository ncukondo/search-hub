import { describe, it, expect } from 'vitest';
import { parseJatsMetadata } from './jats-parser.js';

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
