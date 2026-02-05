/**
 * Tests for OA Discovery Aggregator.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverOA, type DiscoveryArticle } from './index';
import type { OALocation } from '../types';
import * as unpaywallModule from './unpaywall';
import * as pmcModule from './pmc';
import * as arxivModule from './arxiv';
import * as coreModule from './core';

// Mock the individual discovery modules
vi.mock('./unpaywall');
vi.mock('./pmc');
vi.mock('./arxiv');
vi.mock('./core');

const mockCheckUnpaywall = vi.mocked(unpaywallModule.checkUnpaywall);
const mockCheckPmc = vi.mocked(pmcModule.checkPmc);
const mockCheckArxiv = vi.mocked(arxivModule.checkArxiv);
const mockCheckCore = vi.mocked(coreModule.checkCore);

describe('discoverOA', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const baseArticle: DiscoveryArticle = {
    doi: '10.1234/example',
    pmid: '12345678',
  };

  const baseConfig = {
    unpaywallEmail: 'test@example.com',
    coreApiKey: '',
    preferSources: ['pmc', 'arxiv', 'unpaywall', 'core'] as string[],
  };

  it('checks all configured sources and aggregates results', async () => {
    const pmcLocations: OALocation[] = [
      { source: 'pmc', url: 'https://pmc.example.com/pdf', urlType: 'pdf', version: 'published' },
    ];
    const unpaywallLocations: OALocation[] = [
      { source: 'unpaywall', url: 'https://unpaywall.example.com/pdf', urlType: 'pdf', version: 'published' },
    ];

    mockCheckPmc.mockResolvedValue(pmcLocations);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue(unpaywallLocations);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    expect(result.oaStatus).toBe('open');
    expect(result.locations).toHaveLength(2);
    expect(result.locations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'pmc' }),
        expect.objectContaining({ source: 'unpaywall' }),
      ])
    );
  });

  it('determines oaStatus as open when locations found', async () => {
    mockCheckPmc.mockResolvedValue([
      { source: 'pmc', url: 'https://pmc.example.com/pdf', urlType: 'pdf', version: 'published' },
    ]);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);
    expect(result.oaStatus).toBe('open');
  });

  it('determines oaStatus as closed when no locations found', async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);
    expect(result.oaStatus).toBe('closed');
    expect(result.locations).toHaveLength(0);
  });

  it('skips unconfigured sources (no Unpaywall email)', async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, {
      ...baseConfig,
      unpaywallEmail: '',
    });

    expect(mockCheckUnpaywall).not.toHaveBeenCalled();
    expect(result.oaStatus).toBe('closed');
  });

  it('skips CORE when no API key', async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue(null);

    await discoverOA(baseArticle, baseConfig);

    expect(mockCheckCore).not.toHaveBeenCalled();
  });

  it('checks CORE when API key is provided', async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    await discoverOA(baseArticle, {
      ...baseConfig,
      coreApiKey: 'test-key',
    });

    expect(mockCheckCore).toHaveBeenCalledWith('10.1234/example', 'test-key');
  });

  it('checks arXiv when arxivId is present', async () => {
    const arxivLocations: OALocation[] = [
      { source: 'arxiv', url: 'https://arxiv.org/pdf/2401.12345.pdf', urlType: 'pdf', version: 'submitted' },
    ];
    mockCheckPmc.mockResolvedValue(null);
    mockCheckArxiv.mockReturnValue(arxivLocations);
    mockCheckUnpaywall.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(
      { ...baseArticle, arxivId: '2401.12345' },
      baseConfig
    );

    expect(mockCheckArxiv).toHaveBeenCalledWith('2401.12345');
    expect(result.oaStatus).toBe('open');
  });

  it('skips arXiv when no arxivId', async () => {
    mockCheckPmc.mockResolvedValue(null);
    mockCheckUnpaywall.mockResolvedValue(null);
    mockCheckCore.mockResolvedValue(null);

    await discoverOA(baseArticle, baseConfig);

    expect(mockCheckArxiv).not.toHaveBeenCalled();
  });

  it('handles errors in individual sources gracefully', async () => {
    mockCheckPmc.mockRejectedValue(new Error('PMC error'));
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockResolvedValue([
      { source: 'unpaywall', url: 'https://example.com/pdf', urlType: 'pdf', version: 'published' },
    ]);
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    // Should still return unpaywall results despite PMC error
    expect(result.oaStatus).toBe('open');
    expect(result.locations).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0 as number]).toEqual(
      expect.objectContaining({ source: 'pmc' })
    );
  });

  it('returns unknown status when all sources error', async () => {
    mockCheckPmc.mockRejectedValue(new Error('PMC error'));
    mockCheckArxiv.mockReturnValue(null);
    mockCheckUnpaywall.mockRejectedValue(new Error('Unpaywall error'));
    mockCheckCore.mockResolvedValue(null);

    const result = await discoverOA(baseArticle, baseConfig);

    expect(result.oaStatus).toBe('unknown');
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
