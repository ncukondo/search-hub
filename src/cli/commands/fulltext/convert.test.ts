import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeFulltextConvert } from './convert.js';

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
      </contrib-group>
      <abstract><p>This study examines ML applications.</p></abstract>
    </article-meta>
  </front>
  <body>
    <sec><title>Introduction</title><p>ML is widely used.</p></sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1"><mixed-citation>Smith J. Previous work. 2023.</mixed-citation></ref>
    </ref-list>
  </back>
</article>`;

async function setupSession(sessionsDir: string, sessionId: string) {
  const sessionDir = join(sessionsDir, sessionId);
  const fulltextDir = join(sessionDir, 'fulltext');

  // Create article directory with XML and meta.json
  const articleDir = join(fulltextDir, 'smith2024-a1b2c3d4');
  await mkdir(articleDir, { recursive: true });

  await writeFile(join(articleDir, 'fulltext.xml'), SAMPLE_XML, 'utf-8');
  await writeFile(
    join(articleDir, 'meta.json'),
    JSON.stringify(
      {
        dirName: 'smith2024-a1b2c3d4',
        citationKey: 'smith2024',
        uuid: 'a1b2c3d4-test-uuid',
        title: 'Machine Learning in Healthcare',
        oaStatus: 'unchecked',
        files: {
          xml: {
            filename: 'fulltext.xml',
            source: 'pmc',
            retrievedAt: '2024-01-01T00:00:00.000Z',
          },
        },
      },
      null,
      2,
    ),
    'utf-8',
  );

  return { sessionDir, fulltextDir, articleDir };
}

describe('executeFulltextConvert', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'convert-cmd-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('converts all XML files in session', async () => {
    await setupSession(tmpDir, 'test-session');

    const result = await executeFulltextConvert(
      { sessionId: 'test-session' },
      tmpDir,
    );

    expect(result.success).toBe(true);
    expect(result.converted).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);

    // Verify markdown was created
    const mdPath = join(tmpDir, 'test-session', 'fulltext', 'smith2024-a1b2c3d4', 'fulltext.md');
    const md = await readFile(mdPath, 'utf-8');
    expect(md).toContain('# Machine Learning in Healthcare');
  });

  it('--article filters to specific article', async () => {
    const { fulltextDir } = await setupSession(tmpDir, 'test-session');

    // Create a second article without XML
    const article2Dir = join(fulltextDir, 'jones2023-e5f6g7h8');
    await mkdir(article2Dir, { recursive: true });
    await writeFile(
      join(article2Dir, 'meta.json'),
      JSON.stringify({
        dirName: 'jones2023-e5f6g7h8',
        citationKey: 'jones2023',
        uuid: 'e5f6g7h8-test',
        title: 'Other Article',
        oaStatus: 'unchecked',
        files: {},
      }),
      'utf-8',
    );

    const result = await executeFulltextConvert(
      { sessionId: 'test-session', article: 'smith2024-a1b2c3d4' },
      tmpDir,
    );

    expect(result.success).toBe(true);
    expect(result.converted).toBe(1);
  });

  it('skips already-converted files', async () => {
    const { fulltextDir } = await setupSession(tmpDir, 'test-session');

    // Create existing markdown file
    const mdPath = join(fulltextDir, 'smith2024-a1b2c3d4', 'fulltext.md');
    await writeFile(mdPath, '# Already converted\n', 'utf-8');

    const result = await executeFulltextConvert(
      { sessionId: 'test-session' },
      tmpDir,
    );

    expect(result.success).toBe(true);
    expect(result.converted).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('shows progress and summary', async () => {
    await setupSession(tmpDir, 'test-session');

    const result = await executeFulltextConvert(
      { sessionId: 'test-session' },
      tmpDir,
    );

    expect(result.success).toBe(true);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0]!.dirName).toBe('smith2024-a1b2c3d4');
    expect(result.articles[0]!.title).toBe('Machine Learning in Healthcare');
  });
});
