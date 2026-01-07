/**
 * Tests for sessions-dir utility.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSessionsDir } from './sessions-dir.js';
import type { GlobalOptions } from '../index.js';

// Mock the config module
vi.mock('../../config/index.js', () => ({
  loadConfig: vi.fn(),
  getDefaultConfig: vi.fn().mockReturnValue({
    session: { directory: '~/.search-hub/sessions' },
  }),
}));

import { loadConfig, getDefaultConfig } from '../../config/index.js';

describe('getSessionsDir', () => {
  const mockLoadConfig = vi.mocked(loadConfig);
  const mockGetDefaultConfig = vi.mocked(getDefaultConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDefaultConfig.mockReturnValue({
      session: { directory: '~/.search-hub/sessions' },
      providers: {},
    } as ReturnType<typeof getDefaultConfig>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return sessionDir from options if provided', async () => {
    const options: GlobalOptions = {
      sessionDir: '/custom/sessions',
      verbose: false,
      quiet: false,
      color: true,
    };

    const result = await getSessionsDir(options);
    expect(result).toBe('/custom/sessions');
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });

  it('should return session.directory from config if no sessionDir option', async () => {
    mockLoadConfig.mockResolvedValue({
      session: { directory: '/config/sessions' },
      providers: {},
    } as Awaited<ReturnType<typeof loadConfig>>);

    const options: GlobalOptions = {
      verbose: false,
      quiet: false,
      color: true,
    };

    const result = await getSessionsDir(options);
    expect(result).toBe('/config/sessions');
    expect(mockLoadConfig).toHaveBeenCalledWith({});
  });

  it('should pass globalConfigPath when config option is provided', async () => {
    mockLoadConfig.mockResolvedValue({
      session: { directory: '/config/sessions' },
      providers: {},
    } as Awaited<ReturnType<typeof loadConfig>>);

    const options: GlobalOptions = {
      config: '/custom/config.toml',
      verbose: false,
      quiet: false,
      color: true,
    };

    const result = await getSessionsDir(options);
    expect(result).toBe('/config/sessions');
    expect(mockLoadConfig).toHaveBeenCalledWith({
      globalConfigPath: '/custom/config.toml',
    });
  });

  it('should return default config value if loadConfig fails', async () => {
    mockLoadConfig.mockRejectedValue(new Error('Config not found'));

    const options: GlobalOptions = {
      verbose: false,
      quiet: false,
      color: true,
    };

    const result = await getSessionsDir(options);
    expect(result).toBe('~/.search-hub/sessions');
    expect(mockGetDefaultConfig).toHaveBeenCalled();
  });

  it('should prioritize sessionDir option over config file', async () => {
    mockLoadConfig.mockResolvedValue({
      session: { directory: '/config/sessions' },
      providers: {},
    } as Awaited<ReturnType<typeof loadConfig>>);

    const options: GlobalOptions = {
      sessionDir: '/override/sessions',
      verbose: false,
      quiet: false,
      color: true,
    };

    const result = await getSessionsDir(options);
    expect(result).toBe('/override/sessions');
    // loadConfig should not be called since sessionDir is provided
    expect(mockLoadConfig).not.toHaveBeenCalled();
  });
});
