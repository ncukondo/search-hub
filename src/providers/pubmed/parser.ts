/**
 * PubMed XML response parser using fast-xml-parser.
 *
 * Parses esearch and efetch XML responses from PubMed E-utilities API.
 */

import { XMLParser } from 'fast-xml-parser';
import type { Author } from '../base/types.js';
import type { ESearchResponse, PubMedArticle } from './types.js';

/**
 * Response structure for efetch parsing.
 */
export interface EFetchResult {
  articles: PubMedArticle[];
}

/**
 * Named XML entity map for the five predefined XML entities.
 */
const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Decode XML/HTML entities and strip inline markup tags from a string.
 *
 * Handles:
 * - Hex numeric entities: `&#x2264;` → `≤`
 * - Decimal numeric entities: `&#8804;` → `≤`
 * - Named XML entities: `&amp;` → `&`, `&lt;` → `<`, etc.
 * - Inline markup tags: `<i>`, `<sub>`, `<sup>`, `<b>`, `<u>` → stripped
 */
export function cleanXmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => XML_ENTITIES[name] ?? match);
}

/**
 * XML Parser configured for PubMed responses.
 *
 * `stopNodes` prevents the parser from interpreting inline markup within
 * `ArticleTitle` and `AbstractText`, preserving them as raw strings
 * that can be cleaned via `stripXmlTags`.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  stopNodes: ['*.ArticleTitle', '*.AbstractText'],
  isArray: (name) => {
    // These elements should always be arrays
    const arrayElements = [
      'Id',
      'PubmedArticle',
      'Author',
      'MeshHeading',
      'PublicationType',
      'AbstractText',
      'ArticleId',
      'AffiliationInfo',
      'OutputMessage',
      'QuotedPhraseNotFound',
    ];
    return arrayElements.includes(name);
  },
});

/**
 * Parse esearch XML response from PubMed.
 *
 * @param xml - Raw XML string from esearch endpoint
 * @returns Parsed ESearchResponse with PMID list and metadata
 */
export function parseESearchResponse(xml: string): ESearchResponse {
  const parsed = parser.parse(xml);
  const result = parsed.eSearchResult;

  const idList = result.IdList?.Id ?? [];

  const response: ESearchResponse = {
    count: Number(result.Count) || 0,
    retmax: Number(result.RetMax) || 0,
    retstart: Number(result.RetStart) || 0,
    idlist: idList.map((id: string | number) => String(id)),
  };

  if (result.WebEnv) {
    response.webenv = String(result.WebEnv);
  }
  if (result.QueryKey) {
    response.querykey = String(result.QueryKey);
  }

  const warningList = result.WarningList;
  if (warningList) {
    const warnings: string[] = [];
    const outputMessages = warningList.OutputMessage ?? [];
    for (const msg of outputMessages) {
      warnings.push(`PubMed warning: ${String(msg)}`);
    }
    const notFoundPhrases = warningList.QuotedPhraseNotFound ?? [];
    for (const phrase of notFoundPhrases) {
      warnings.push(`Quoted phrase not found: ${String(phrase)}`);
    }
    if (warnings.length > 0) {
      response.warnings = warnings;
    }
  }

  return response;
}

/**
 * Month name to number mapping.
 */
const MONTH_MAP: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

/**
 * Parse a PubMed date element into ISO format.
 */
function parseDate(pubDate: {
  Year?: string;
  Month?: string;
  Day?: string;
}): string | undefined {
  if (!pubDate?.Year) return undefined;

  const year = String(pubDate.Year);
  if (!pubDate.Month) return year;

  // Month can be numeric or name (Jan, Feb, etc.)
  let month = String(pubDate.Month);
  if (MONTH_MAP[month]) {
    month = MONTH_MAP[month]!;
  } else if (month.length === 1) {
    month = `0${month}`;
  }

  if (!pubDate.Day) return `${year}-${month}`;

  const dayStr = String(pubDate.Day);
  const day = dayStr.length === 1 ? `0${dayStr}` : dayStr;
  return `${year}-${month}-${day}`;
}

/**
 * Parse author information from PubMed Author element.
 */
function parseAuthor(authorData: {
  LastName?: string;
  ForeName?: string;
  CollectiveName?: string;
  AffiliationInfo?: Array<{ Affiliation?: string }>;
  Identifier?: { '#text'?: string; '@_Source'?: string };
}): Author {
  const author: Author = {
    family: authorData.LastName ?? authorData.CollectiveName ?? '',
  };

  if (authorData.ForeName) {
    author.given = authorData.ForeName;
  }

  if (authorData.AffiliationInfo?.[0]?.Affiliation) {
    author.affiliation = authorData.AffiliationInfo[0].Affiliation;
  }

  // Extract ORCID from Identifier
  if (
    authorData.Identifier &&
    authorData.Identifier['@_Source'] === 'ORCID' &&
    authorData.Identifier['#text']
  ) {
    author.orcid = authorData.Identifier['#text'];
  }

  return author;
}

/**
 * Parse abstract text which may be structured or simple.
 */
function parseAbstract(
  abstractData: { AbstractText?: Array<{ '#text'?: string; '@_Label'?: string } | string> } | undefined
): string | undefined {
  if (!abstractData?.AbstractText) return undefined;

  const texts = abstractData.AbstractText;
  if (!Array.isArray(texts)) {
    return cleanXmlText(String(texts));
  }

  // Check if structured abstract (has labels)
  if (texts.length > 0 && typeof texts[0] === 'object' && texts[0]['@_Label']) {
    return texts
      .map((section) => {
        if (typeof section === 'string') return cleanXmlText(section);
        const label = section['@_Label'];
        const text = cleanXmlText(section['#text'] ?? '');
        return `${label}: ${text}`;
      })
      .join('\n\n');
  }

  // Simple abstract
  return texts
    .map((t) => cleanXmlText(typeof t === 'string' ? t : t['#text'] ?? ''))
    .join(' ');
}

/**
 * Extract article ID by type from ArticleIdList.
 */
function getArticleId(
  idList: Array<{ '#text'?: string; '@_IdType'?: string }> | undefined,
  idType: string
): string | undefined {
  if (!idList) return undefined;
  const found = idList.find((id) => id['@_IdType'] === idType);
  return found?.['#text'];
}

/**
 * Parse a single PubMed article from efetch response.
 * Returns null if required fields are missing.
 */
function parsePubMedArticle(articleData: {
  MedlineCitation?: {
    PMID?: { '#text'?: string } | string;
    Article?: {
      Journal?: {
        Title?: string;
        ISSN?: { '#text'?: string };
        JournalIssue?: {
          Volume?: string;
          Issue?: string;
          PubDate?: { Year?: string; Month?: string; Day?: string };
        };
      };
      ArticleTitle?: string;
      Pagination?: { MedlinePgn?: string };
      Abstract?: { AbstractText?: unknown[] };
      AuthorList?: { Author?: unknown[] };
      PublicationTypeList?: { PublicationType?: unknown[] };
    };
    MeshHeadingList?: { MeshHeading?: unknown[] };
  };
  PubmedData?: {
    ArticleIdList?: { ArticleId?: unknown[] };
  };
}): PubMedArticle | null {
  const citation = articleData.MedlineCitation;
  if (!citation?.Article) {
    // Skip malformed article data missing required fields
    return null;
  }
  const articleContent = citation.Article;
  const journalIssue = articleContent.Journal?.JournalIssue;

  // Extract PMID (can be object with #text or direct value)
  const pmidData = citation.PMID;
  const pmid =
    typeof pmidData === 'object'
      ? String(pmidData['#text'] ?? '')
      : String(pmidData ?? '');

  // Parse authors
  const authorList = articleContent.AuthorList?.Author ?? [];
  const authors: Author[] = authorList.map((a: unknown) => parseAuthor(a as Parameters<typeof parseAuthor>[0]));

  // Parse MeSH terms
  const meshList = citation.MeshHeadingList?.MeshHeading ?? [];
  const meshTerms =
    meshList.length > 0
      ? meshList.map((mh: unknown) => {
          const meshHeading = mh as { DescriptorName?: { '#text'?: string } | string };
          if (typeof meshHeading.DescriptorName === 'object') {
            return meshHeading.DescriptorName['#text'] ?? '';
          }
          return String(meshHeading.DescriptorName ?? '');
        })
      : undefined;

  // Parse publication types
  const pubTypeList = articleContent.PublicationTypeList?.PublicationType ?? [];
  const pubTypes =
    pubTypeList.length > 0
      ? pubTypeList.map((pt: unknown) => {
          if (typeof pt === 'object' && pt !== null) {
            return (pt as { '#text'?: string })['#text'] ?? '';
          }
          return String(pt);
        })
      : undefined;

  // Get article IDs
  const articleIdList = articleData.PubmedData?.ArticleIdList?.ArticleId as Array<{ '#text'?: string; '@_IdType'?: string }> | undefined;
  const doi = getArticleId(articleIdList, 'doi');
  const pmc = getArticleId(articleIdList, 'pmc');

  const article: PubMedArticle = {
    pmid,
    source: 'pubmed',
    title: cleanXmlText(String(articleContent.ArticleTitle ?? '')),
    authors,
    retrievedAt: new Date().toISOString(),
  };

  // Optional fields
  const abstract = parseAbstract(articleContent.Abstract as Parameters<typeof parseAbstract>[0]);
  if (abstract) article.abstract = abstract;

  if (doi) article.doi = doi;
  if (pmc) article.pmc = pmc;

  if (articleContent.Journal?.Title) {
    article.journal = articleContent.Journal.Title;
  }

  if (journalIssue?.Volume) article.volume = String(journalIssue.Volume);
  if (journalIssue?.Issue) article.issue = String(journalIssue.Issue);

  if (articleContent.Pagination?.MedlinePgn) {
    article.pages = articleContent.Pagination.MedlinePgn;
  }

  const pubDate = parseDate(journalIssue?.PubDate ?? {});
  if (pubDate) article.publicationDate = pubDate;

  if (meshTerms) article.meshTerms = meshTerms;
  if (pubTypes) article.pubTypes = pubTypes;

  if (articleContent.Journal?.ISSN?.['#text']) {
    article.journalIssn = articleContent.Journal.ISSN['#text'];
  }

  return article;
}

/**
 * Parse efetch XML response from PubMed.
 *
 * @param xml - Raw XML string from efetch endpoint
 * @returns Parsed result containing PubMedArticle array
 */
export function parseEFetchResponse(xml: string): EFetchResult {
  const parsed = parser.parse(xml);
  const articleSet = parsed.PubmedArticleSet?.PubmedArticle ?? [];

  const articles = articleSet
    .map((article: unknown) =>
      parsePubMedArticle(article as Parameters<typeof parsePubMedArticle>[0])
    )
    .filter(
      (article: PubMedArticle | null): article is PubMedArticle =>
        article !== null
    );

  return { articles };
}
