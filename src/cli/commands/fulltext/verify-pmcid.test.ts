/**
 * Tests for PMCID verification against source article metadata.
 */

import { describe, it, expect, vi } from 'vitest';
import { verifyPmcid } from './verify-pmcid';

/** Build an esummary db=pmc JSON response for a single record. */
function esummaryResponse(record: {
  uid: string;
  title?: string;
  pmid?: string;
  doi?: string;
}): unknown {
  const articleids: Array<{ idtype: string; value: string }> = [
    { idtype: 'pmcid', value: `PMC${record.uid}` },
  ];
  if (record.pmid) articleids.push({ idtype: 'pmid', value: record.pmid });
  if (record.doi) articleids.push({ idtype: 'doi', value: record.doi });
  return {
    header: { type: 'esummary', version: '0.3' },
    result: {
      uids: [record.uid],
      [record.uid]: {
        uid: record.uid,
        title: record.title ?? '',
        articleids,
      },
    },
  };
}

function mockFetchJson(body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;
}

describe('verifyPmcid', () => {
  // The real-world case from issue #146: PMID 29538103 was linked to
  // PMC12928693, which is a different paper.
  it('returns mismatch when the PMC record belongs to a different article', async () => {
    const fetchFn = mockFetchJson(
      esummaryResponse({
        uid: '12928693',
        title:
          'A Log-Level Data-Driven Precision Education Tool for Pediatrics Trainees: Human-Centered Development and Validation Study.',
        pmid: '41730172',
        doi: '10.2196/79952',
      }),
    );

    const result = await verifyPmcid(
      'PMC12928693',
      {
        doi: '10.1097/ACM.0000000000002209',
        pmid: '29538103',
        title:
          'Harnessing the Power of Big Data to Improve Graduate Medical Education: Big Idea or Bust?',
      },
      { fetchFn },
    );

    expect(result).toBe('mismatch');
  });

  it('returns match when DOI matches', async () => {
    const fetchFn = mockFetchJson(
      esummaryResponse({
        uid: '123456',
        title: 'Some Article',
        pmid: '11111111',
        doi: '10.1234/example',
      }),
    );

    const result = await verifyPmcid(
      'PMC123456',
      { doi: '10.1234/example', pmid: '11111111', title: 'Some Article' },
      { fetchFn },
    );

    expect(result).toBe('match');
  });

  it('matches DOI case-insensitively and ignores url prefixes', async () => {
    const fetchFn = mockFetchJson(
      esummaryResponse({ uid: '123456', doi: '10.1097/acm.0000000000002209' }),
    );

    const result = await verifyPmcid(
      'PMC123456',
      { doi: 'https://doi.org/10.1097/ACM.0000000000002209' },
      { fetchFn },
    );

    expect(result).toBe('match');
  });

  it('falls back to PMID comparison when the PMC record has no DOI', async () => {
    const fetchFn = mockFetchJson(esummaryResponse({ uid: '123456', pmid: '29538103' }));

    const result = await verifyPmcid(
      'PMC123456',
      { doi: '10.1097/ACM.0000000000002209', pmid: '29538103' },
      { fetchFn },
    );

    expect(result).toBe('match');
  });

  it('falls back to title comparison when no identifiers overlap', async () => {
    const fetchFn = mockFetchJson(
      esummaryResponse({
        uid: '123456',
        title:
          'Harnessing the power of big data to improve graduate medical education: big idea or bust?',
      }),
    );

    const result = await verifyPmcid(
      'PMC123456',
      {
        title:
          'Harnessing the Power of Big Data to Improve Graduate Medical Education: Big Idea or Bust?',
      },
      { fetchFn },
    );

    expect(result).toBe('match');
  });

  it('returns mismatch when only titles are comparable and they differ', async () => {
    const fetchFn = mockFetchJson(
      esummaryResponse({ uid: '123456', title: 'A Completely Different Paper' }),
    );

    const result = await verifyPmcid(
      'PMC123456',
      { title: 'Harnessing the Power of Big Data' },
      { fetchFn },
    );

    expect(result).toBe('mismatch');
  });

  it('returns unverified when the article has no comparable fields', async () => {
    const fetchFn = mockFetchJson(esummaryResponse({ uid: '123456' }));

    const result = await verifyPmcid('PMC123456', {}, { fetchFn });

    expect(result).toBe('unverified');
  });

  it('returns unverified when the esummary request fails', async () => {
    const fetchFn = vi.fn(
      async () => new Response('server error', { status: 500 }),
    ) as unknown as typeof fetch;

    const result = await verifyPmcid('PMC123456', { doi: '10.1234/example' }, { fetchFn });

    expect(result).toBe('unverified');
  });

  it('returns unverified when fetch throws', async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const result = await verifyPmcid('PMC123456', { doi: '10.1234/example' }, { fetchFn });

    expect(result).toBe('unverified');
  });

  it('accepts a bare numeric PMCID', async () => {
    const fetchFn = mockFetchJson(esummaryResponse({ uid: '123456', doi: '10.1234/example' }));

    const result = await verifyPmcid('123456', { doi: '10.1234/example' }, { fetchFn });

    expect(result).toBe('match');
    const calledUrl = String(vi.mocked(fetchFn).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('id=123456');
    expect(calledUrl).toContain('db=pmc');
  });

  it('passes tool and email params to the esummary request', async () => {
    const fetchFn = mockFetchJson(esummaryResponse({ uid: '123456', doi: '10.1234/example' }));

    await verifyPmcid(
      'PMC123456',
      { doi: '10.1234/example' },
      { fetchFn, ncbiTool: 'search-hub', ncbiEmail: 'test@example.com' },
    );

    const calledUrl = String(vi.mocked(fetchFn).mock.calls[0]?.[0]);
    expect(calledUrl).toContain('tool=search-hub');
    expect(calledUrl).toContain('email=test%40example.com');
  });
});
