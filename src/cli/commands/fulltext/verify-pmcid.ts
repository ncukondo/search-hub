/**
 * PMCID verification against source article metadata.
 *
 * OA discovery can resolve a PMCID that belongs to a different paper
 * (e.g. a citing article returned by elink). Before attaching PMC
 * locations to an article, cross-check the PMC record's DOI/PMID/title
 * against the source article via NCBI esummary (issue #146).
 */

const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

export interface PmcidVerifyArticle {
  doi?: string;
  pmid?: string;
  title?: string;
}

export type PmcidVerification = 'match' | 'mismatch' | 'unverified';

export interface VerifyPmcidOptions {
  ncbiEmail?: string;
  ncbiTool?: string;
  /** Injectable fetch for testing */
  fetchFn?: typeof fetch;
}

interface EsummaryArticleId {
  idtype?: string;
  value?: string;
}

interface EsummaryRecord {
  title?: string;
  articleids?: EsummaryArticleId[];
}

/** Lowercase a DOI and strip url/prefix decorations for comparison. */
function normalizeDoi(doi: string): string {
  return doi
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    .replace(/^doi:/, '');
}

/** Reduce a title to lowercase alphanumerics for tolerant comparison. */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Fetch the esummary record for a PMC ID. Returns null on any failure. */
async function fetchPmcRecord(
  pmcid: string,
  options: VerifyPmcidOptions,
): Promise<EsummaryRecord | null> {
  const numericId = pmcid.replace(/^PMC/i, '');
  const params = new URLSearchParams({ db: 'pmc', id: numericId, retmode: 'json' });
  if (options.ncbiTool) params.set('tool', options.ncbiTool);
  if (options.ncbiEmail) params.set('email', options.ncbiEmail);

  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(`${ESUMMARY_URL}?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      result?: Record<string, unknown>;
    };
    const record = data.result?.[numericId];
    if (!record || typeof record !== 'object') return null;
    return record as EsummaryRecord;
  } catch {
    return null;
  }
}

function findArticleId(record: EsummaryRecord, idtype: string): string | undefined {
  return record.articleids?.find((id) => id.idtype === idtype)?.value;
}

/**
 * Verify that a PMCID actually refers to the given article.
 * Compares by DOI first, then PMID, then normalized title.
 * Returns 'unverified' when the PMC record cannot be fetched or
 * shares no comparable field with the article.
 */
export async function verifyPmcid(
  pmcid: string,
  article: PmcidVerifyArticle,
  options: VerifyPmcidOptions = {},
): Promise<PmcidVerification> {
  const record = await fetchPmcRecord(pmcid, options);
  if (!record) return 'unverified';

  const recordDoi = findArticleId(record, 'doi');
  if (article.doi && recordDoi) {
    return normalizeDoi(article.doi) === normalizeDoi(recordDoi) ? 'match' : 'mismatch';
  }

  const recordPmid = findArticleId(record, 'pmid');
  if (article.pmid && recordPmid) {
    return article.pmid.trim() === recordPmid.trim() ? 'match' : 'mismatch';
  }

  if (article.title && record.title) {
    const articleTitle = normalizeTitle(article.title);
    const recordTitle = normalizeTitle(record.title);
    if (articleTitle && recordTitle) {
      return articleTitle === recordTitle ? 'match' : 'mismatch';
    }
  }

  return 'unverified';
}
