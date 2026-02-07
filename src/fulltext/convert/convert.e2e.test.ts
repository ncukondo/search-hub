/**
 * E2E Tests for PMC XML to Markdown conversion.
 *
 * Tests the full conversion pipeline with a realistic PMC XML document,
 * verifying Markdown output structure and metadata preservation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { convertPmcXmlToMarkdown } from './index.js';

/**
 * Realistic PMC XML fixture with multiple sections, tables, figures,
 * citations, lists, and inline formatting.
 */
const REALISTIC_PMC_XML = `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink" article-type="research-article">
  <front>
    <article-meta>
      <article-id pub-id-type="doi">10.1038/s41591-024-02890-7</article-id>
      <article-id pub-id-type="pmc">9876543</article-id>
      <article-id pub-id-type="pmid">38654321</article-id>
      <title-group>
        <article-title>Deep Learning Approaches for Early Detection of Alzheimer's Disease: A Systematic Review and Meta-Analysis</article-title>
      </title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Chen</surname><given-names>Wei</given-names></name>
        </contrib>
        <contrib contrib-type="author">
          <name><surname>Müller</surname><given-names>Hans-Peter</given-names></name>
        </contrib>
        <contrib contrib-type="author">
          <name><surname>Tanaka</surname><given-names>Yuki</given-names></name>
        </contrib>
        <contrib contrib-type="editor">
          <name><surname>ReviewEditor</surname><given-names>Jane</given-names></name>
        </contrib>
      </contrib-group>
      <abstract>
        <sec>
          <title>Background</title>
          <p>Early detection of Alzheimer's disease (AD) remains a critical challenge in clinical neuroscience.</p>
        </sec>
        <sec>
          <title>Methods</title>
          <p>We conducted a systematic review of <bold>127 studies</bold> published between 2018 and 2024.</p>
        </sec>
        <sec>
          <title>Results</title>
          <p>Deep learning models achieved a pooled sensitivity of 0.91 (95% CI: 0.88-0.94).</p>
        </sec>
      </abstract>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>Alzheimer's disease (AD) affects approximately 55 million people worldwide <xref ref-type="bibr" rid="ref1">[1]</xref>. Early detection is crucial for intervention <xref ref-type="bibr" rid="ref2">[2]</xref>, yet current diagnostic methods have significant limitations.</p>
      <p>Recent advances in <bold>deep learning</bold> (DL) have shown promising results in medical imaging analysis <xref ref-type="bibr" rid="ref3">[3]</xref>. Convolutional neural networks (CNNs) and transformer architectures can extract subtle patterns from MRI and PET scans that may indicate early-stage neurodegeneration.</p>
      <p>The aim of this systematic review was to:</p>
      <list list-type="order">
        <list-item><p>Evaluate the diagnostic accuracy of DL models for early AD detection</p></list-item>
        <list-item><p>Compare different architectural approaches (CNN, transformer, hybrid)</p></list-item>
        <list-item><p>Assess the methodological quality of included studies</p></list-item>
      </list>
    </sec>
    <sec>
      <title>Methods</title>
      <sec>
        <title>Search Strategy</title>
        <p>We searched PubMed, Scopus, and Web of Science using a structured query combining terms for <italic>Alzheimer's disease</italic>, <italic>deep learning</italic>, and <italic>neuroimaging</italic>.</p>
      </sec>
      <sec>
        <title>Inclusion Criteria</title>
        <p>Studies were included if they met the following criteria:</p>
        <list list-type="bullet">
          <list-item><p>Used deep learning for AD classification or prediction</p></list-item>
          <list-item><p>Reported sensitivity and specificity metrics</p></list-item>
          <list-item><p>Used MRI, PET, or multimodal neuroimaging data</p></list-item>
          <list-item><p>Published in peer-reviewed journals between 2018-2024</p></list-item>
        </list>
      </sec>
      <sec>
        <title>Statistical Analysis</title>
        <p>We used bivariate random-effects models with a significance threshold of <italic>p</italic> &lt; 0.05. Heterogeneity was assessed using the I<sup>2</sup> statistic.</p>
      </sec>
    </sec>
    <sec>
      <title>Results</title>
      <sec>
        <title>Study Characteristics</title>
        <p>Our search identified 2,341 records, of which 127 met inclusion criteria (Figure 1).</p>
        <fig id="fig1">
          <label>Figure 1</label>
          <caption><p>PRISMA flow diagram showing study selection process</p></caption>
        </fig>
        <table-wrap>
          <label>Table 1</label>
          <caption><p>Summary of included studies by architecture type</p></caption>
          <table>
            <thead>
              <tr><th>Architecture</th><th>Studies (n)</th><th>Pooled Sensitivity</th><th>Pooled Specificity</th></tr>
            </thead>
            <tbody>
              <tr><td>CNN</td><td>78</td><td>0.89</td><td>0.87</td></tr>
              <tr><td>Transformer</td><td>31</td><td>0.93</td><td>0.91</td></tr>
              <tr><td>Hybrid</td><td>18</td><td>0.94</td><td>0.90</td></tr>
            </tbody>
          </table>
        </table-wrap>
      </sec>
      <sec>
        <title>Model Performance</title>
        <p>Transformer-based models demonstrated superior performance compared to traditional CNNs (<italic>p</italic> = 0.003). The highest accuracy was achieved by hybrid models combining imaging with clinical features <xref ref-type="bibr" rid="ref4">[4]</xref>.</p>
        <fig id="fig2">
          <label>Figure 2</label>
          <caption><p>Forest plot of sensitivity estimates across DL architectures</p></caption>
        </fig>
      </sec>
    </sec>
    <sec>
      <title>Discussion</title>
      <p>Our findings demonstrate that deep learning approaches have reached clinically meaningful accuracy for early AD detection. The pooled sensitivity of 0.91 exceeds the current clinical standard of 0.85 <xref ref-type="bibr" rid="ref5">[5]</xref>.</p>
      <p>Several limitations should be noted:</p>
      <list list-type="bullet">
        <list-item><p>Most studies used retrospective data from ADNI</p></list-item>
        <list-item><p>External validation was performed in only 23% of studies</p></list-item>
        <list-item><p>Publication bias may inflate reported accuracy</p></list-item>
      </list>
    </sec>
    <sec>
      <title>Conclusions</title>
      <p>Deep learning models show strong potential for early AD detection. Future work should focus on prospective validation, multi-center studies, and integration with clinical workflows.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1">
        <mixed-citation>World Health Organization. Global status report on the public health response to dementia. WHO; 2021.</mixed-citation>
      </ref>
      <ref id="ref2">
        <mixed-citation>Sperling RA, Aisen PS, Beckett LA, et al. Toward defining the preclinical stages of Alzheimer's disease. Alzheimers Dement. 2011;7(3):280-292.</mixed-citation>
      </ref>
      <ref id="ref3">
        <mixed-citation>LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-444.</mixed-citation>
      </ref>
      <ref id="ref4">
        <mixed-citation>Zhang X, Li Y, Wang H. Multimodal deep learning for Alzheimer's disease diagnosis. Med Image Anal. 2024;89:102945.</mixed-citation>
      </ref>
      <ref id="ref5">
        <mixed-citation>Jack CR Jr, Bennett DA, Blennow K, et al. NIA-AA Research Framework. Alzheimers Dement. 2018;14(4):535-562.</mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>`;

describe('PMC XML to Markdown E2E conversion', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'convert-e2e-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('converts a realistic PMC XML file to well-structured Markdown', async () => {
    const xmlPath = join(tmpDir, 'fulltext.xml');
    const mdPath = join(tmpDir, 'fulltext.md');
    await writeFile(xmlPath, REALISTIC_PMC_XML, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);

    expect(result.success).toBe(true);
    expect(result.title).toBe(
      "Deep Learning Approaches for Early Detection of Alzheimer's Disease: A Systematic Review and Meta-Analysis",
    );
    expect(result.sections).toBeGreaterThanOrEqual(5);
    expect(result.references).toBe(5);

    const md = await readFile(mdPath, 'utf-8');

    // Title as H1
    expect(md).toMatch(/^# Deep Learning Approaches for Early Detection/m);

    // Metadata header
    expect(md).toContain('**Authors**: Chen W, Müller H, Tanaka Y');
    expect(md).toContain('**DOI**: 10.1038/s41591-024-02890-7');
    expect(md).toContain('**PMC**: PMC9876543');

    // Structured abstract
    expect(md).toContain('## Abstract');
    expect(md).toContain('Background');
    expect(md).toContain('Early detection of Alzheimer');

    // Body sections as H2
    expect(md).toContain('## Introduction');
    expect(md).toContain('## Methods');
    expect(md).toContain('## Results');
    expect(md).toContain('## Discussion');
    expect(md).toContain('## Conclusions');

    // Nested subsections as H3
    expect(md).toContain('### Search Strategy');
    expect(md).toContain('### Inclusion Criteria');
    expect(md).toContain('### Statistical Analysis');
    expect(md).toContain('### Study Characteristics');
    expect(md).toContain('### Model Performance');

    // Inline formatting preserved (note: fast-xml-parser without preserveOrder
    // groups same-named sibling elements, so interleaved text may shift)
    expect(md).toContain('**deep learning**');
    expect(md).toContain('*p*');

    // Citation markers preserved
    expect(md).toContain('[1]');
    expect(md).toContain('[2]');
    expect(md).toContain('[5]');

    // Ordered list
    expect(md).toContain('1. Evaluate the diagnostic accuracy');
    expect(md).toContain('2. Compare different architectural approaches');
    expect(md).toContain('3. Assess the methodological quality');

    // Unordered list
    expect(md).toContain('- Used deep learning for AD classification');
    expect(md).toContain('- Most studies used retrospective data');

    // Tables
    expect(md).toContain('| Architecture | Studies (n) | Pooled Sensitivity | Pooled Specificity |');
    expect(md).toContain('| CNN | 78 | 0.89 | 0.87 |');
    expect(md).toContain('| Transformer | 31 | 0.93 | 0.91 |');

    // Figures
    expect(md).toContain('![Figure 1. PRISMA flow diagram showing study selection process]()');
    expect(md).toContain('![Figure 2. Forest plot of sensitivity estimates across DL architectures]()');

    // References section
    expect(md).toContain('## References');
    expect(md).toContain('1. World Health Organization');
    expect(md).toContain('5. Jack CR Jr');
  });

  it('verifies Markdown output structure with section ordering', async () => {
    const xmlPath = join(tmpDir, 'fulltext.xml');
    const mdPath = join(tmpDir, 'fulltext.md');
    await writeFile(xmlPath, REALISTIC_PMC_XML, 'utf-8');

    await convertPmcXmlToMarkdown(xmlPath, mdPath);
    const md = await readFile(mdPath, 'utf-8');
    const lines = md.split('\n');

    // Find section positions to verify ordering
    const titleLine = lines.findIndex((l) => l.startsWith('# Deep Learning'));
    const abstractLine = lines.findIndex((l) => l === '## Abstract');
    const introLine = lines.findIndex((l) => l === '## Introduction');
    const methodsLine = lines.findIndex((l) => l === '## Methods');
    const resultsLine = lines.findIndex((l) => l === '## Results');
    const discussionLine = lines.findIndex((l) => l === '## Discussion');
    const conclusionsLine = lines.findIndex((l) => l === '## Conclusions');
    const referencesLine = lines.findIndex((l) => l === '## References');

    // All sections should be present
    expect(titleLine).toBeGreaterThanOrEqual(0);
    expect(abstractLine).toBeGreaterThan(titleLine);
    expect(introLine).toBeGreaterThan(abstractLine);
    expect(methodsLine).toBeGreaterThan(introLine);
    expect(resultsLine).toBeGreaterThan(methodsLine);
    expect(discussionLine).toBeGreaterThan(resultsLine);
    expect(conclusionsLine).toBeGreaterThan(discussionLine);
    expect(referencesLine).toBeGreaterThan(conclusionsLine);
  });

  it('preserves metadata in meta.json after conversion', async () => {
    const articleDir = join(tmpDir, 'article');
    await mkdir(articleDir, { recursive: true });

    const xmlPath = join(articleDir, 'fulltext.xml');
    const mdPath = join(articleDir, 'fulltext.md');
    const metaPath = join(articleDir, 'meta.json');

    await writeFile(xmlPath, REALISTIC_PMC_XML, 'utf-8');
    await writeFile(
      metaPath,
      JSON.stringify(
        {
          dirName: 'chen2024-abc12345',
          citationKey: 'chen2024',
          uuid: 'abc12345-test-uuid',
          title: "Deep Learning Approaches for Early Detection of Alzheimer's Disease",
          oaStatus: 'gold',
          files: {
            xml: {
              filename: 'fulltext.xml',
              source: 'pmc',
              retrievedAt: '2024-06-15T10:00:00.000Z',
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath, metaPath);
    expect(result.success).toBe(true);

    // Verify meta.json was updated
    const metaRaw = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaRaw);

    // Original fields preserved
    expect(meta.dirName).toBe('chen2024-abc12345');
    expect(meta.citationKey).toBe('chen2024');
    expect(meta.uuid).toBe('abc12345-test-uuid');
    expect(meta.files.xml.source).toBe('pmc');

    // Markdown file info added
    expect(meta.files.markdown).toBeDefined();
    expect(meta.files.markdown.filename).toBe('fulltext.md');
    expect(meta.files.markdown.source).toBe('conversion');
    expect(meta.files.markdown.convertedFrom).toBe('fulltext.xml');
    expect(meta.files.markdown.size).toBeGreaterThan(0);
    expect(meta.files.markdown.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('handles XML with minimal content gracefully', async () => {
    const minimalXml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <title-group>
        <article-title>Short Communication</article-title>
      </title-group>
    </article-meta>
  </front>
  <body>
    <p>A single paragraph without any sections.</p>
  </body>
</article>`;

    const xmlPath = join(tmpDir, 'minimal.xml');
    const mdPath = join(tmpDir, 'minimal.md');
    await writeFile(xmlPath, minimalXml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);
    expect(result.title).toBe('Short Communication');

    const md = await readFile(mdPath, 'utf-8');
    expect(md).toContain('# Short Communication');
    expect(md).toContain('A single paragraph without any sections.');
    // Should not have References section since there are none
    expect(md).not.toContain('## References');
  });

  it('preserves interleaved citations and italic text in correct positions', async () => {
    const interleavedXml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <title-group>
        <article-title>Interleaving Test</article-title>
      </title-group>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>The adage [<xref ref-type="bibr" rid="CR1">1</xref>]. Several studies [<xref ref-type="bibr" rid="CR2">2</xref>,<xref ref-type="bibr" rid="CR3">3</xref>].</p>
      <p>this is the <italic>yanegawara</italic> system. Under the <italic>yanegawara</italic> system</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="CR1"><mixed-citation>Author A. Title 1. 2020.</mixed-citation></ref>
      <ref id="CR2"><mixed-citation>Author B. Title 2. 2021.</mixed-citation></ref>
      <ref id="CR3"><mixed-citation>Author C. Title 3. 2022.</mixed-citation></ref>
    </ref-list>
  </back>
</article>`;

    const xmlPath = join(tmpDir, 'interleaved.xml');
    const mdPath = join(tmpDir, 'interleaved.md');
    await writeFile(xmlPath, interleavedXml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);

    const md = await readFile(mdPath, 'utf-8');

    // Citations should appear inline at their correct positions
    expect(md).toContain('The adage [1]. Several studies [2,3].');

    // Italic text should appear at correct positions with proper spacing
    expect(md).toContain('this is the *yanegawara* system. Under the *yanegawara* system');
  });

  it('handles <citation-alternatives> references without duplication', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <title-group>
        <article-title>Citation Alternatives Test</article-title>
      </title-group>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>As shown <xref ref-type="bibr" rid="CR1">[1]</xref>.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="CR1">
        <label>1.</label>
        <citation-alternatives>
          <element-citation publication-type="journal">
            <person-group person-group-type="author">
              <name><surname>Bowyer</surname><given-names>ER</given-names></name>
              <name><surname>Shaw</surname><given-names>SC</given-names></name>
            </person-group>
            <article-title>Informal near-peer teaching</article-title>
            <source>Educ Health</source>
            <year>2021</year><volume>34</volume><fpage>29</fpage>
          </element-citation>
          <mixed-citation publication-type="journal">
            Bowyer ER, Shaw SC. Informal near-peer teaching. Educ Health. 2021;34:29.
          </mixed-citation>
        </citation-alternatives>
      </ref>
    </ref-list>
  </back>
</article>`;

    const xmlPath = join(tmpDir, 'cit-alt.xml');
    const mdPath = join(tmpDir, 'cit-alt.md');
    await writeFile(xmlPath, xml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);
    expect(result.references).toBe(1);

    const md = await readFile(mdPath, 'utf-8');

    // Reference should use mixed-citation text, not duplicated
    expect(md).toContain('Bowyer ER, Shaw SC');
    // Should NOT have concatenated text like "BowyerERShawSC"
    expect(md).not.toMatch(/BowyerER/);
  });

  it('handles <mixed-citation> with <string-name> elements with proper spacing', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<article>
  <front>
    <article-meta>
      <title-group>
        <article-title>String Name Test</article-title>
      </title-group>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Introduction</title>
      <p>See references <xref ref-type="bibr" rid="ref1">[1]</xref>.</p>
    </sec>
  </body>
  <back>
    <ref-list>
      <ref id="ref1">
        <mixed-citation publication-type="journal">
          <string-name><surname>McGuire</surname><given-names>N</given-names></string-name>,
          <string-name><surname>Acai</surname><given-names>A</given-names></string-name>.
          The McMaster tool. Teach Learn Med. 2023;37(1):1-9.
        </mixed-citation>
      </ref>
    </ref-list>
  </back>
</article>`;

    const xmlPath = join(tmpDir, 'string-name.xml');
    const mdPath = join(tmpDir, 'string-name.md');
    await writeFile(xmlPath, xml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);
    expect(result.references).toBe(1);

    const md = await readFile(mdPath, 'utf-8');

    // Author names should have proper spacing
    expect(md).toContain('McGuire N');
    expect(md).toContain('Acai A');
    // Should NOT have concatenated names
    expect(md).not.toContain('McGuireN');
    expect(md).not.toContain('AcaiA');
  });

  it('preserves ext-link, monospace, and inline-formula in Markdown output', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<article xmlns:xlink="http://www.w3.org/1999/xlink">
  <front>
    <article-meta>
      <title-group>
        <article-title>Inline Elements Test</article-title>
      </title-group>
    </article-meta>
  </front>
  <body>
    <sec>
      <title>Methods</title>
      <p>Analysis was performed using R (<ext-link ext-link-type="uri"
        xlink:href="https://www.r-project.org/">https://www.r-project.org/</ext-link>)
        and the <monospace>tidyverse</monospace> package.</p>
      <p>Visit <ext-link ext-link-type="uri"
        xlink:href="https://example.com/data">our data repository</ext-link> for datasets.</p>
      <p>Statistical significance was set at <inline-formula><tex-math>p &lt; 0.05</tex-math></inline-formula>.</p>
      <p>The <underline>primary outcome</underline> was measured using <sc>Smith</sc> criteria.</p>
      <p>Data available at <uri xlink:href="https://doi.org/10.5281/zenodo.123">https://doi.org/10.5281/zenodo.123</uri>.</p>
    </sec>
  </body>
</article>`;

    const xmlPath = join(tmpDir, 'inline.xml');
    const mdPath = join(tmpDir, 'inline.md');
    await writeFile(xmlPath, xml, 'utf-8');

    const result = await convertPmcXmlToMarkdown(xmlPath, mdPath);
    expect(result.success).toBe(true);

    const md = await readFile(mdPath, 'utf-8');

    // ext-link: bare URL when display text matches URL
    expect(md).toContain('https://www.r-project.org/');
    // ext-link: Markdown link when display text differs
    expect(md).toContain('[our data repository](https://example.com/data)');
    // monospace: backtick-quoted
    expect(md).toContain('`tidyverse`');
    // inline-formula: LaTeX notation
    expect(md).toContain('$p < 0.05$');
    // underline: text preserved
    expect(md).toContain('primary outcome');
    // sc: text preserved
    expect(md).toContain('Smith');
    // uri: link preserved
    expect(md).toContain('https://doi.org/10.5281/zenodo.123');
  });
});
