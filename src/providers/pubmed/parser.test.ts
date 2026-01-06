/**
 * Tests for PubMed XML response parser.
 */

import { describe, it, expect } from 'vitest';
import { parseESearchResponse, parseEFetchResponse } from './parser';

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
});
