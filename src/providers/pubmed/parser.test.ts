/**
 * Tests for PubMed XML response parser.
 */

import { describe, it, expect } from 'vitest';
import { parseESearchResponse, parseEFetchResponse, parseELinkResponse } from './parser';

describe('PubMed Parser', () => {
  describe('parseESearchResponse', () => {
    it('should parse esearch XML with PMID list and count', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE eSearchResult PUBLIC "-//NLM//DTD esearch 20060628//EN" "https://eutils.ncbi.nlm.nih.gov/eutils/dtd/20060628/esearch.dtd">
<eSearchResult>
  <Count>1234</Count>
  <RetMax>100</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>12345678</Id>
    <Id>23456789</Id>
    <Id>34567890</Id>
  </IdList>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(1234);
      expect(result.retmax).toBe(100);
      expect(result.retstart).toBe(0);
      expect(result.idlist).toEqual(['12345678', '23456789', '34567890']);
    });

    it('should parse esearch XML with webenv and querykey', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eSearchResult>
  <Count>5000</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>11111111</Id>
  </IdList>
  <WebEnv>MCID_abc123def456</WebEnv>
  <QueryKey>1</QueryKey>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(5000);
      expect(result.webenv).toBe('MCID_abc123def456');
      expect(result.querykey).toBe('1');
    });

    it('should handle empty result set', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eSearchResult>
  <Count>0</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList></IdList>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(0);
      expect(result.idlist).toEqual([]);
    });

    it('should parse WarningList with OutputMessage entries', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eSearchResult>
  <Count>0</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList></IdList>
  <WarningList>
    <OutputMessage>NOT is not a recognized operator</OutputMessage>
    <OutputMessage>Query syntax error detected</OutputMessage>
  </WarningList>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(0);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings![0]).toContain('NOT is not a recognized operator');
      expect(result.warnings![1]).toContain('Query syntax error detected');
    });

    it('should parse WarningList with QuotedPhraseNotFound entries', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eSearchResult>
  <Count>5</Count>
  <RetMax>5</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>12345</Id>
  </IdList>
  <WarningList>
    <QuotedPhraseNotFound>"nonexistent phrase"</QuotedPhraseNotFound>
    <QuotedPhraseNotFound>"another missing term"</QuotedPhraseNotFound>
  </WarningList>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(5);
      expect(result.warnings).toBeDefined();
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings![0]).toContain('"nonexistent phrase"');
      expect(result.warnings![1]).toContain('"another missing term"');
    });

    it('should handle esearch response with no WarningList', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eSearchResult>
  <Count>100</Count>
  <RetMax>20</RetMax>
  <RetStart>0</RetStart>
  <IdList>
    <Id>11111111</Id>
  </IdList>
</eSearchResult>`;

      const result = parseESearchResponse(xml);

      expect(result.count).toBe(100);
      expect(result.warnings).toBeUndefined();
    });
  });

  describe('parseEFetchResponse', () => {
    it('should parse efetch XML with full article data', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2024//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_240101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">12345678</PMID>
      <Article PubModel="Print">
        <Journal>
          <ISSN IssnType="Electronic">1234-5678</ISSN>
          <Title>Test Journal</Title>
          <ISOAbbreviation>Test J</ISOAbbreviation>
          <JournalIssue CitedMedium="Internet">
            <Volume>10</Volume>
            <Issue>5</Issue>
            <PubDate>
              <Year>2024</Year>
              <Month>Mar</Month>
            </PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Test Article Title About Diabetes</ArticleTitle>
        <Pagination>
          <MedlinePgn>123-145</MedlinePgn>
        </Pagination>
        <Abstract>
          <AbstractText>This is the abstract text for the test article.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Smith</LastName>
            <ForeName>John</ForeName>
            <Initials>J</Initials>
            <AffiliationInfo>
              <Affiliation>University of Testing</Affiliation>
            </AffiliationInfo>
          </Author>
          <Author ValidYN="Y">
            <LastName>Doe</LastName>
            <ForeName>Jane</ForeName>
            <Initials>J</Initials>
          </Author>
        </AuthorList>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName UI="D003920" MajorTopicYN="N">Diabetes Mellitus</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName UI="D006801" MajorTopicYN="N">Humans</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">12345678</ArticleId>
        <ArticleId IdType="doi">10.1234/test.2024.001</ArticleId>
        <ArticleId IdType="pmc">PMC9876543</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);

      expect(result.articles).toHaveLength(1);
      const article = result.articles[0]!;
      expect(article.pmid).toBe('12345678');
      expect(article.title).toBe('Test Article Title About Diabetes');
      expect(article.abstract).toBe('This is the abstract text for the test article.');
      expect(article.doi).toBe('10.1234/test.2024.001');
      expect(article.pmc).toBe('PMC9876543');
      expect(article.journal).toBe('Test Journal');
      expect(article.volume).toBe('10');
      expect(article.issue).toBe('5');
      expect(article.pages).toBe('123-145');
      expect(article.publicationDate).toBe('2024-03');
      expect(article.source).toBe('pubmed');
    });

    it('should parse authors correctly', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">11111111</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Author Test Article</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Smith</LastName>
            <ForeName>John Robert</ForeName>
            <AffiliationInfo>
              <Affiliation>University of Testing</Affiliation>
            </AffiliationInfo>
            <Identifier Source="ORCID">0000-0001-2345-6789</Identifier>
          </Author>
          <Author ValidYN="Y">
            <LastName>Doe</LastName>
            <ForeName>Jane</ForeName>
          </Author>
          <Author ValidYN="Y">
            <CollectiveName>Research Consortium</CollectiveName>
          </Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">11111111</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.authors).toHaveLength(3);
      expect(article.authors[0]).toEqual({
        family: 'Smith',
        given: 'John Robert',
        affiliation: 'University of Testing',
        orcid: '0000-0001-2345-6789',
      });
      expect(article.authors[1]).toEqual({
        family: 'Doe',
        given: 'Jane',
      });
      expect(article.authors[2]).toEqual({
        family: 'Research Consortium',
      });
    });

    it('should parse MeSH terms correctly', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">22222222</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>MeSH Test Article</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Test</LastName>
          </Author>
        </AuthorList>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName UI="D003920" MajorTopicYN="Y">Diabetes Mellitus, Type 2</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName UI="D006801" MajorTopicYN="N">Humans</DescriptorName>
        </MeshHeading>
        <MeshHeading>
          <DescriptorName UI="D000818" MajorTopicYN="N">Animals</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">22222222</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.meshTerms).toEqual([
        'Diabetes Mellitus, Type 2',
        'Humans',
        'Animals',
      ]);
    });

    it('should parse publication types correctly', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">33333333</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Publication Type Test</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y"><LastName>Test</LastName></Author>
        </AuthorList>
        <PublicationTypeList>
          <PublicationType UI="D016428">Journal Article</PublicationType>
          <PublicationType UI="D016454">Review</PublicationType>
          <PublicationType UI="D013485">Research Support, Non-U.S. Gov't</PublicationType>
        </PublicationTypeList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">33333333</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.pubTypes).toEqual([
        'Journal Article',
        'Review',
        'Research Support, Non-U.S. Gov\'t',
      ]);
    });

    it('should handle missing optional fields', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">44444444</PMID>
      <Article PubModel="Print">
        <Journal><Title>Minimal Journal</Title></Journal>
        <ArticleTitle>Minimal Article</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y"><LastName>Author</LastName></Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">44444444</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.pmid).toBe('44444444');
      expect(article.title).toBe('Minimal Article');
      expect(article.abstract).toBeUndefined();
      expect(article.doi).toBeUndefined();
      expect(article.meshTerms).toBeUndefined();
      expect(article.pubTypes).toBeUndefined();
      expect(article.volume).toBeUndefined();
      expect(article.issue).toBeUndefined();
      expect(article.pages).toBeUndefined();
    });

    it('should parse multiple articles', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">55555555</PMID>
      <Article PubModel="Print">
        <Journal><Title>Journal 1</Title></Journal>
        <ArticleTitle>Article One</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y"><LastName>One</LastName></Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">55555555</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">66666666</PMID>
      <Article PubModel="Print">
        <Journal><Title>Journal 2</Title></Journal>
        <ArticleTitle>Article Two</ArticleTitle>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y"><LastName>Two</LastName></Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">66666666</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);

      expect(result.articles).toHaveLength(2);
      expect(result.articles[0]!.pmid).toBe('55555555');
      expect(result.articles[0]!.title).toBe('Article One');
      expect(result.articles[1]!.pmid).toBe('66666666');
      expect(result.articles[1]!.title).toBe('Article Two');
    });

    it('should parse various date formats', () => {
      // Year and Month only
      const xmlYearMonth = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">77777777</PMID>
      <Article PubModel="Print">
        <Journal>
          <Title>Test Journal</Title>
          <JournalIssue CitedMedium="Internet">
            <PubDate>
              <Year>2024</Year>
              <Month>Jan</Month>
            </PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Date Test</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">77777777</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const resultYearMonth = parseEFetchResponse(xmlYearMonth);
      expect(resultYearMonth.articles[0]!.publicationDate).toBe('2024-01');

      // Year, Month, Day
      const xmlFull = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">88888888</PMID>
      <Article PubModel="Print">
        <Journal>
          <Title>Test Journal</Title>
          <JournalIssue CitedMedium="Internet">
            <PubDate>
              <Year>2024</Year>
              <Month>03</Month>
              <Day>15</Day>
            </PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Date Test 2</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">88888888</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const resultFull = parseEFetchResponse(xmlFull);
      expect(resultFull.articles[0]!.publicationDate).toBe('2024-03-15');

      // Year only
      const xmlYearOnly = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">99999999</PMID>
      <Article PubModel="Print">
        <Journal>
          <Title>Test Journal</Title>
          <JournalIssue CitedMedium="Internet">
            <PubDate>
              <Year>2024</Year>
            </PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Date Test 3</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">99999999</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const resultYearOnly = parseEFetchResponse(xmlYearOnly);
      expect(resultYearOnly.articles[0]!.publicationDate).toBe('2024');
    });

    it('should handle structured abstract', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">10101010</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Structured Abstract Test</ArticleTitle>
        <Abstract>
          <AbstractText Label="BACKGROUND">Background text here.</AbstractText>
          <AbstractText Label="METHODS">Methods text here.</AbstractText>
          <AbstractText Label="RESULTS">Results text here.</AbstractText>
          <AbstractText Label="CONCLUSIONS">Conclusions text here.</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">10101010</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.abstract).toContain('BACKGROUND: Background text here.');
      expect(article.abstract).toContain('METHODS: Methods text here.');
      expect(article.abstract).toContain('RESULTS: Results text here.');
      expect(article.abstract).toContain('CONCLUSIONS: Conclusions text here.');
    });

    it('should skip malformed articles missing MedlineCitation', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">11111111</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">22222222</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Valid Article</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">22222222</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);

      // Should only contain the valid article, malformed one is skipped
      expect(result.articles).toHaveLength(1);
      expect(result.articles[0]!.pmid).toBe('22222222');
      expect(result.articles[0]!.title).toBe('Valid Article');
    });

    it('should flatten inline XML elements in article titles', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">40000001</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Effect of <i>Pseudomonas aeruginosa</i> on mortality</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">40000001</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(typeof article.title).toBe('string');
      expect(article.title).toBe('Effect of Pseudomonas aeruginosa on mortality');
    });

    it('should flatten <sub> elements in article titles', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">40000002</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle><sub>β</sub>-lactam resistance</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">40000002</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(typeof article.title).toBe('string');
      expect(article.title).toBe('β-lactam resistance');
    });

    it('should handle deeply nested inline XML in titles', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">40000003</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Study of <i><sub>x</sub> and <sup>y</sup></i> values</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">40000003</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(typeof article.title).toBe('string');
      expect(article.title).toBe('Study of x and y values');
    });

    it('should leave titles without inline XML unchanged', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">40000004</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Simple title without any markup</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">40000004</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(typeof article.title).toBe('string');
      expect(article.title).toBe('Simple title without any markup');
    });

    it('should decode numeric HTML entities in abstracts', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000001</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Entity Test</ArticleTitle>
        <Abstract>
          <AbstractText>Value &#x2264; 5 mg/dL</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000001</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.abstract).toBe('Value ≤ 5 mg/dL');
    });

    it('should decode hair space entity to regular space', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000002</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Space Test</ArticleTitle>
        <Abstract>
          <AbstractText>10&#x200a;mg treatment</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000002</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      // Hair space (U+200A) should be decoded to the Unicode character
      expect(article.abstract).toBe('10\u200amg treatment');
    });

    it('should decode &amp; entity in abstracts', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000003</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Ampersand Test</ArticleTitle>
        <Abstract>
          <AbstractText>Salt &amp; pepper treatment</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000003</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.abstract).toBe('Salt & pepper treatment');
    });

    it('should flatten inline XML in abstract text', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000005</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Abstract Inline XML Test</ArticleTitle>
        <Abstract>
          <AbstractText>The bacterium <i>Escherichia coli</i> was studied with <sub>x</sub> controls.</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000005</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(typeof article.abstract).toBe('string');
      expect(article.abstract).toBe('The bacterium Escherichia coli was studied with x controls.');
    });

    it('should flatten inline XML in structured abstract text', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000006</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>Structured Abstract Inline Test</ArticleTitle>
        <Abstract>
          <AbstractText Label="METHODS">We used <b>bold</b> technique with <i>in vitro</i> models.</AbstractText>
          <AbstractText Label="RESULTS">Concentration was &#x2264; 5 <sup>mg</sup>/dL.</AbstractText>
        </Abstract>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000006</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.abstract).toContain('METHODS: We used bold technique with in vitro models.');
      expect(article.abstract).toContain('RESULTS: Concentration was ≤ 5 mg/dL.');
    });

    it('should decode HTML entities in article titles', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">50000004</PMID>
      <Article PubModel="Print">
        <Journal><Title>Test Journal</Title></Journal>
        <ArticleTitle>CO&#x2082; emissions &amp; climate</ArticleTitle>
        <AuthorList><Author ValidYN="Y"><LastName>Test</LastName></Author></AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">50000004</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);
      const article = result.articles[0]!;

      expect(article.title).toBe('CO₂ emissions & climate');
    });

    it('should handle realistic PubMed XML with mixed inline elements and entities', () => {
      // Simulates a real PubMed response with multiple articles containing
      // inline XML elements and HTML entities
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2024//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_240101.dtd">
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">39000001</PMID>
      <Article PubModel="Print">
        <Journal>
          <ISSN IssnType="Electronic">1234-5678</ISSN>
          <Title>Journal of Infectious Diseases</Title>
          <JournalIssue CitedMedium="Internet">
            <Volume>45</Volume>
            <Issue>3</Issue>
            <PubDate><Year>2024</Year><Month>Jun</Month></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Predictors of Mortality in <i>Pseudomonas aeruginosa</i> Bloodstream Infections Caused by <b>NDM-1</b>-Producing Strains</ArticleTitle>
        <Pagination><MedlinePgn>234-245</MedlinePgn></Pagination>
        <Abstract>
          <AbstractText Label="BACKGROUND"><i>Pseudomonas aeruginosa</i> is a leading cause of nosocomial infections. Mortality rates are &#x2265; 30% in ICU patients.</AbstractText>
          <AbstractText Label="METHODS">We analyzed 150 blood cultures from patients with <i>P. aeruginosa</i> bacteremia. MIC values were &#x2264; 2 &#x03BC;g/mL for susceptible strains.</AbstractText>
          <AbstractText Label="RESULTS">CO<sub>2</sub> levels correlated with severity (p &lt; 0.001). The HR was 2.3 (95% CI: 1.5&#x2013;3.4).</AbstractText>
          <AbstractText Label="CONCLUSIONS">Early identification of <i>P. aeruginosa</i> NDM-1 producers is critical for patient outcomes.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Tanaka</LastName>
            <ForeName>Yuki</ForeName>
          </Author>
        </AuthorList>
      </Article>
      <MeshHeadingList>
        <MeshHeading>
          <DescriptorName UI="D011550" MajorTopicYN="Y">Pseudomonas aeruginosa</DescriptorName>
        </MeshHeading>
      </MeshHeadingList>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">39000001</ArticleId>
        <ArticleId IdType="doi">10.1234/jid.2024.001</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">39000002</PMID>
      <Article PubModel="Print">
        <Journal>
          <Title>Chemistry Letters</Title>
          <JournalIssue CitedMedium="Internet">
            <Volume>12</Volume>
            <PubDate><Year>2024</Year><Month>01</Month><Day>15</Day></PubDate>
          </JournalIssue>
        </Journal>
        <ArticleTitle>Synthesis of <sub>&#x03B2;</sub>-lactam derivatives via <sup>13</sup>C-labeled intermediates</ArticleTitle>
        <Abstract>
          <AbstractText>We describe a novel route to <sub>&#x03B2;</sub>-lactam compounds using <sup>13</sup>C NMR&#x200a;spectroscopy. Yields ranged from 45% to 92% with ee &#x2265; 95%.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y">
            <LastName>Kim</LastName>
            <ForeName>Soo-Jin</ForeName>
          </Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">39000002</ArticleId>
        <ArticleId IdType="doi">10.5678/chem.2024.015</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">39000003</PMID>
      <Article PubModel="Print">
        <Journal><Title>Simple Journal</Title></Journal>
        <ArticleTitle>A plain title with no markup at all</ArticleTitle>
        <Abstract>
          <AbstractText>A plain abstract with no special characters.</AbstractText>
        </Abstract>
        <AuthorList CompleteYN="Y">
          <Author ValidYN="Y"><LastName>Plain</LastName></Author>
        </AuthorList>
      </Article>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList>
        <ArticleId IdType="pubmed">39000003</ArticleId>
      </ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);

      expect(result.articles).toHaveLength(3);

      // Article 1: Italic species names and bold in title, structured abstract with entities
      const art1 = result.articles[0]!;
      expect(typeof art1.title).toBe('string');
      expect(art1.title).toBe('Predictors of Mortality in Pseudomonas aeruginosa Bloodstream Infections Caused by NDM-1-Producing Strains');
      expect(art1.abstract).toContain('BACKGROUND: Pseudomonas aeruginosa is a leading cause');
      expect(art1.abstract).toContain('≥ 30%');
      expect(art1.abstract).toContain('≤ 2 μg/mL');
      expect(art1.abstract).toContain('RESULTS: CO2 levels');
      expect(art1.abstract).toContain('< 0.001');
      expect(art1.abstract).toContain('1.5\u20133.4');
      expect(art1.doi).toBe('10.1234/jid.2024.001');
      expect(art1.meshTerms).toEqual(['Pseudomonas aeruginosa']);

      // Article 2: Sub/sup in title, entities in abstract
      const art2 = result.articles[1]!;
      expect(typeof art2.title).toBe('string');
      expect(art2.title).toBe('Synthesis of β-lactam derivatives via 13C-labeled intermediates');
      expect(art2.abstract).toContain('β-lactam compounds');
      expect(art2.abstract).toContain('13C NMR');
      expect(art2.abstract).toContain('≥ 95%');

      // Article 3: Plain text should remain unchanged
      const art3 = result.articles[2]!;
      expect(art3.title).toBe('A plain title with no markup at all');
      expect(art3.abstract).toBe('A plain abstract with no special characters.');
    });

    it('should skip malformed articles missing Article element', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<PubmedArticleSet>
  <PubmedArticle>
    <MedlineCitation Status="MEDLINE" Owner="NLM">
      <PMID Version="1">33333333</PMID>
    </MedlineCitation>
    <PubmedData>
      <ArticleIdList><ArticleId IdType="pubmed">33333333</ArticleId></ArticleIdList>
    </PubmedData>
  </PubmedArticle>
</PubmedArticleSet>`;

      const result = parseEFetchResponse(xml);

      // Should be empty as the article is malformed
      expect(result.articles).toHaveLength(0);
    });
  });

  describe('parseELinkResponse', () => {
    it('should parse elink XML with related PMIDs and scores', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE eLinkResult PUBLIC "-//NLM//DTD elink 20101123//EN" "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/dtd/20101123/elink.dtd">
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList>
      <Id>12345678</Id>
    </IdList>
    <LinkSetDb>
      <DbTo>pubmed</DbTo>
      <LinkName>pubmed_pubmed</LinkName>
      <Link>
        <Id>11111111</Id>
        <Score>98765432</Score>
      </Link>
      <Link>
        <Id>22222222</Id>
        <Score>87654321</Score>
      </Link>
      <Link>
        <Id>33333333</Id>
        <Score>76543210</Score>
      </Link>
    </LinkSetDb>
  </LinkSet>
</eLinkResult>`;

      const result = parseELinkResponse(xml);

      expect(result.links).toHaveLength(3);
      expect(result.links[0]).toEqual({ id: '11111111', score: 98765432 });
      expect(result.links[1]).toEqual({ id: '22222222', score: 87654321 });
      expect(result.links[2]).toEqual({ id: '33333333', score: 76543210 });
    });

    it('should handle empty link results', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList>
      <Id>99999999</Id>
    </IdList>
  </LinkSet>
</eLinkResult>`;

      const result = parseELinkResponse(xml);

      expect(result.links).toHaveLength(0);
    });

    it('should handle multiple seed PMIDs', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<eLinkResult>
  <LinkSet>
    <DbFrom>pubmed</DbFrom>
    <IdList>
      <Id>12345678</Id>
      <Id>23456789</Id>
    </IdList>
    <LinkSetDb>
      <DbTo>pubmed</DbTo>
      <LinkName>pubmed_pubmed</LinkName>
      <Link>
        <Id>44444444</Id>
        <Score>50000000</Score>
      </Link>
    </LinkSetDb>
  </LinkSet>
</eLinkResult>`;

      const result = parseELinkResponse(xml);

      expect(result.links).toHaveLength(1);
      expect(result.links[0]!.id).toBe('44444444');
    });
  });
});
