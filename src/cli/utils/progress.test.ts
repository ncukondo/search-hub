import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MultiProviderProgress } from './progress.js';

// Mock cli-progress module
vi.mock('cli-progress', () => {
  const mockBar = {
    update: vi.fn(),
    stop: vi.fn(),
    setTotal: vi.fn(),
  };

  const mockMultiBar = {
    create: vi.fn(() => mockBar),
    stop: vi.fn(),
    remove: vi.fn(),
  };

  return {
    MultiBar: vi.fn(() => mockMultiBar),
    Presets: {
      shades_classic: {},
    },
  };
});

describe('MultiProviderProgress', () => {
  let progress: MultiProviderProgress;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create progress bars for each provider', () => {
      progress = new MultiProviderProgress(['pubmed', 'eric', 'arxiv']);

      expect(progress).toBeDefined();
    });

    it('should handle empty provider list', () => {
      progress = new MultiProviderProgress([]);

      expect(progress).toBeDefined();
    });

    it('should create bars in pending state', () => {
      progress = new MultiProviderProgress(['pubmed']);

      const state = progress.getState('pubmed');
      expect(state?.status).toBe('pending');
    });
  });

  describe('update', () => {
    it('should update progress for specified provider', () => {
      progress = new MultiProviderProgress(['pubmed']);

      progress.update('pubmed', 100, 500, 'in_progress');

      const state = progress.getState('pubmed');
      expect(state?.current).toBe(100);
      expect(state?.total).toBe(500);
      expect(state?.status).toBe('in_progress');
    });

    it('should handle update for non-existent provider gracefully', () => {
      progress = new MultiProviderProgress(['pubmed']);

      expect(() => {
        progress.update('unknown', 100, 500, 'in_progress');
      }).not.toThrow();
    });

    it('should track status changes', () => {
      progress = new MultiProviderProgress(['pubmed']);

      progress.update('pubmed', 0, 500, 'in_progress');
      expect(progress.getState('pubmed')?.status).toBe('in_progress');

      progress.update('pubmed', 500, 500, 'completed');
      expect(progress.getState('pubmed')?.status).toBe('completed');
    });
  });

  describe('complete', () => {
    it('should mark provider as completed', () => {
      progress = new MultiProviderProgress(['pubmed']);
      progress.update('pubmed', 500, 500, 'in_progress');

      progress.complete('pubmed');

      const state = progress.getState('pubmed');
      expect(state?.status).toBe('completed');
    });

    it('should handle complete for non-existent provider gracefully', () => {
      progress = new MultiProviderProgress(['pubmed']);

      expect(() => {
        progress.complete('unknown');
      }).not.toThrow();
    });
  });

  describe('fail', () => {
    it('should mark provider as failed with error message', () => {
      progress = new MultiProviderProgress(['pubmed']);
      progress.update('pubmed', 100, 500, 'in_progress');

      progress.fail('pubmed', 'Network error');

      const state = progress.getState('pubmed');
      expect(state?.status).toBe('failed');
      expect(state?.error).toBe('Network error');
    });

    it('should handle fail for non-existent provider gracefully', () => {
      progress = new MultiProviderProgress(['pubmed']);

      expect(() => {
        progress.fail('unknown', 'Error');
      }).not.toThrow();
    });
  });

  describe('partial', () => {
    it('should mark provider as partial', () => {
      progress = new MultiProviderProgress(['pubmed']);
      progress.update('pubmed', 300, 500, 'in_progress');

      progress.partial('pubmed');

      const state = progress.getState('pubmed');
      expect(state?.status).toBe('partial');
    });
  });

  describe('stop', () => {
    it('should stop all progress bars', () => {
      progress = new MultiProviderProgress(['pubmed', 'eric']);

      expect(() => {
        progress.stop();
      }).not.toThrow();
    });
  });

  describe('getIcon', () => {
    it('should return correct icon for completed status', () => {
      expect(MultiProviderProgress.getIcon('completed')).toBe('\u2713');
    });

    it('should return correct icon for failed status', () => {
      expect(MultiProviderProgress.getIcon('failed')).toBe('\u2717');
    });

    it('should return correct icon for in_progress status', () => {
      expect(MultiProviderProgress.getIcon('in_progress')).toBe('\u280B');
    });

    it('should return correct icon for pending status', () => {
      expect(MultiProviderProgress.getIcon('pending')).toBe('\u25FC');
    });

    it('should return correct icon for partial status', () => {
      expect(MultiProviderProgress.getIcon('partial')).toBe('\u26A0');
    });
  });

  describe('getAllStates', () => {
    it('should return states for all providers', () => {
      progress = new MultiProviderProgress(['pubmed', 'eric']);
      progress.update('pubmed', 100, 500, 'in_progress');
      progress.complete('eric');

      const states = progress.getAllStates();

      expect(states).toHaveLength(2);
      expect(states.find((s) => s.provider === 'pubmed')?.status).toBe('in_progress');
      expect(states.find((s) => s.provider === 'eric')?.status).toBe('completed');
    });
  });
});
