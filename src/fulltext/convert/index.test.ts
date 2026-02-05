import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertPmcXmlToMarkdown } from './index.js';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <article-id pub-id-type="doi">10.1234/example</article-id>
      <article-id pub-id-type="pmc">1234567</article-id>
      <title-group>
        <article-title>Machine Learning in Healthcare</article-title>
      </title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Smith</surname><given-names>John</given-names></name>
        </contrib>
        <contrib contrib-type="author">
          <name><surname>Jones</surname><given-names>Alice</given-names></name>
        </contrib>
      </contrib-group>
      <abstract><p>This study examines ML applications.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>Machine learning has been widely adopted.</p>
    </sec>
    <sec>
      <title>Methods</title>
      <p>We conducted a systematic review.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1">
        <mixed-citation>Smith J. Previous work. Journal. 2023.</mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>`;

describe('convertPmcXmlToMarkdown', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'convert-test-'));
    await mkdir(join(tmpDir, 'article'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('converts XML file to Markdown end-to-end', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    const md = await readFile(mdPath, 'utf-8');
    expect(md).toContain('# Machine Learning in Healthcare');
    expect(md).toContain('**Authors**: Smith J, Jones A');
    expect(md).toContain('**DOI**: 10.1234/example');
    expect(md).toContain('## Introduction');
    expect(md).toContain('## Methods');
    expect(md).toContain('## References');
  });

  it('handles malformed XML gracefully', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, '<article><invalid><broken', 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('updates meta.json with conversion info', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    const metaPath = join(tmpDir, 'article', 'meta.json');

    // Create a minimal meta.json
    const meta = {
      dirName: 'smith2024-a1b2c3d4',
      citationKey: 'smith2024',
      uuid: 'a1b2c3d4-test',
      title: 'Test',
      oaStatus: 'unchecked',
      files: {
        xml: {
          filename: 'fulltext.xml',
          source: 'pmc',
          retrievedAt: '2024-01-01T00:00:00.000Z',
        },
      },
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath, metaPath);

    expect(result.success).toBe(true);

    const updatedMeta = JSON.parse(await readFile(metaPath, 'utf-8'));
    expect(updatedMeta.files.markdown).toBeDefined();
    expect(updatedMeta.files.markdown.filename).toBe('fulltext.md');
    expect(updatedMeta.files.markdown.source).toBe('conversion');
    expect(updatedMeta.files.markdown.convertedFrom).toBe('fulltext.xml');
  });

  it('returns metadata about the converted document', async () => {
    const xmlPath = join(tmpDir, 'article', 'fulltext.xml');
    const mdPath = join(tmpDir, 'article', 'fulltext.md');
    await writeFile(xmlPath, SAMPLE_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.title).toBe('Machine Learning in Healthcare');
      expect(result.sections).toBe(2);
      expect(result.references).toBe(1);
    }
  });
});
