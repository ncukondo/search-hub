import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecException } from 'node:child_process';
import {
  checkRefAvailable,
  checkNpmAvailable,
  installRefManager,
  refAdd,
  refAddBulk,
  refUpdate,
  refExport,
  RefCliError,
} from './ref-cli.js';

// Type for exec callback
type ExecCallback = (error: ExecException | null, stdout: string, stderr: string) => void;

// Create mock using vi.hoisted to ensure it's available during module mock
const mockExecFn = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  exec: mockExecFn,
}));

describe('ref-cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkRefAvailable', () => {
    it('returns true when ref command exists', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          callback(null, 'ref 1.0.0', '');
        }
      });

      const result = await checkRefAvailable();
      expect(result).toBe(true);
      expect(mockExecFn).toHaveBeenCalledWith(
        'ref --version',
        expect.any(Function)
      );
    });

    it('returns false when ref command does not exist', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          const error = new Error('command not found: ref') as ExecException;
          error.code = 127;
          callback(error, '', '');
        }
      });

      const result = await checkRefAvailable();
      expect(result).toBe(false);
    });
  });

  describe('checkNpmAvailable', () => {
    it('returns true when npm command exists', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          callback(null, '10.0.0', '');
        }
      });

      const result = await checkNpmAvailable();
      expect(result).toBe(true);
      expect(mockExecFn).toHaveBeenCalledWith(
        'npm --version',
        expect.any(Function)
      );
    });

    it('returns false when npm command does not exist', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          const error = new Error('command not found: npm') as ExecException;
          error.code = 127;
          callback(error, '', '');
        }
      });

      const result = await checkNpmAvailable();
      expect(result).toBe(false);
    });
  });

  describe('installRefManager', () => {
    it('executes npm install command', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          callback(null, 'added 1 package', '');
        }
      });

      await installRefManager();
      expect(mockExecFn).toHaveBeenCalledWith(
        'npm i -g @ncukondo/reference-manager',
        expect.any(Function)
      );
    });

    it('throws RefCliError when installation fails', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        optsOrCallback: Record<string, unknown> | ExecCallback
      ) => {
        const callback = typeof optsOrCallback === 'function' ? optsOrCallback : undefined;
        if (callback) {
          callback(new Error('Permission denied') as ExecException, '', 'Permission denied');
        }
      });

      await expect(installRefManager()).rejects.toThrow(RefCliError);
    });
  });

  describe('refAdd', () => {
    it('executes ref add with JSON output', async () => {
      const mockOutput = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [{ source: 'pmid:12345678', id: 'smith2024', title: 'Test Article' }],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const result = await refAdd('pmid:12345678');
      expect(result).toEqual(mockOutput);
      expect(mockExecFn).toHaveBeenCalledWith(
        'ref add "pmid:12345678" -o json',
        expect.any(Function)
      );
    });

    it('executes ref add with libraryPath option', async () => {
      const mockOutput = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [{ source: '10.1234/test', id: 'test2024', title: 'Test' }],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const libraryPath = '/path/to/library.json';
      await refAdd('10.1234/test', { libraryPath });

      expect(mockExecFn).toHaveBeenCalledWith(
        'ref --library "/path/to/library.json" add "10.1234/test" -o json',
        expect.any(Function)
      );
    });

    it('throws RefCliError when ref add fails', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(new Error('Network error') as ExecException, '', 'Network error');
      });

      await expect(refAdd('pmid:12345678')).rejects.toThrow(RefCliError);
    });

    it('throws RefCliError when output is not valid JSON', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, 'not valid json', '');
      });

      await expect(refAdd('pmid:12345678')).rejects.toThrow(RefCliError);
    });

    it('escapes special characters in identifier', async () => {
      const mockOutput = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      await refAdd('10.1234/test$pecial');
      expect(mockExecFn).toHaveBeenCalledWith(
        expect.stringContaining('ref add'),
        expect.any(Function)
      );
    });

    it('parses JSON output even when exit code is 1 (partial failure)', async () => {
      // ref add returns exit code 1 when there are failures, but still outputs valid JSON
      const mockOutput = {
        summary: { total: 1, added: 0, skipped: 0, failed: 1 },
        added: [],
        skipped: [],
        failed: [{ source: '10.9999/nonexistent', reason: 'fetch_error', error: 'Not found' }],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        // Simulate exit code 1 with valid JSON output
        const error = new Error('Command failed') as ExecException;
        error.code = 1;
        callback(error, JSON.stringify(mockOutput), '');
      });

      const result = await refAdd('10.9999/nonexistent');
      expect(result.summary.failed).toBe(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0]!.source).toBe('10.9999/nonexistent');
    });

    it('includes uuid field when present in output', async () => {
      const mockOutput = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [{ source: 'pmid:12345678', id: 'smith2024', title: 'Test', uuid: 'abc-123' }],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const result = await refAdd('pmid:12345678');
      expect(result.added[0]!.uuid).toBe('abc-123');
    });

    it('includes reason field in skipped items when present', async () => {
      const mockOutput = {
        summary: { total: 1, added: 0, skipped: 1, failed: 0 },
        added: [],
        skipped: [{ source: '10.1234/test', existingId: 'test2024', duplicateType: 'doi', reason: 'duplicate' }],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const result = await refAdd('10.1234/test');
      expect(result.skipped[0]!.reason).toBe('duplicate');
    });

    it('throws RefCliError when no stdout and exec error', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(new Error('Command not found') as ExecException, '', 'ref: command not found');
      });

      await expect(refAdd('pmid:12345678')).rejects.toThrow(RefCliError);
    });
  });

  describe('refUpdate', () => {
    it('executes ref update with field and value', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, '', '');
      });

      await refUpdate('smith2024', 'abstract', 'This is an abstract.');
      expect(mockExecFn).toHaveBeenCalledWith(
        expect.stringMatching(/ref update "smith2024" --set "abstract=This is an abstract\."/),
        expect.any(Function)
      );
    });

    it('escapes special characters in value', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, '', '');
      });

      await refUpdate('test2024', 'abstract', 'Contains "quotes" and $pecial chars');
      expect(mockExecFn).toHaveBeenCalled();
    });

    it('throws RefCliError when update fails', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(new Error('Entry not found') as ExecException, '', 'Entry not found');
      });

      await expect(refUpdate('nonexistent', 'abstract', 'value')).rejects.toThrow(RefCliError);
    });
  });

  describe('refExport', () => {
    it('executes ref export and returns parsed JSON', async () => {
      const mockEntry = {
        id: 'smith2024',
        type: 'article',
        title: 'Test Article',
        author: [{ family: 'Smith', given: 'John' }],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockEntry), '');
      });

      const result = await refExport('smith2024');
      expect(result).toEqual(mockEntry);
      expect(mockExecFn).toHaveBeenCalledWith(
        'ref export "smith2024"',
        expect.any(Function)
      );
    });

    it('throws RefCliError when export fails', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(new Error('Entry not found') as ExecException, '', '');
      });

      await expect(refExport('nonexistent')).rejects.toThrow(RefCliError);
    });
  });

  describe('refAddBulk', () => {
    it('executes ref add -i json with file path and -o json', async () => {
      const mockOutput = {
        summary: { total: 2, added: 2, skipped: 0, failed: 0 },
        added: [
          { source: 'smith-2024', id: 'smith-2024', title: 'Article 1' },
          { source: 'jones-2023', id: 'jones-2023', title: 'Article 2' },
        ],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const result = await refAddBulk('/path/to/import.json');
      expect(result).toEqual(mockOutput);
      expect(mockExecFn).toHaveBeenCalledWith(
        'ref add -i json "/path/to/import.json" -o json',
        expect.any(Function)
      );
    });

    it('passes library path option correctly', async () => {
      const mockOutput = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [{ source: 'test-2024', id: 'test-2024', title: 'Test' }],
        skipped: [],
        failed: [],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const libraryPath = '/path/to/library.json';
      await refAddBulk('/path/to/import.json', { libraryPath });

      expect(mockExecFn).toHaveBeenCalledWith(
        'ref --library "/path/to/library.json" add -i json "/path/to/import.json" -o json',
        expect.any(Function)
      );
    });

    it('parses output via RefAddOutputSchema', async () => {
      const mockOutput = {
        summary: { total: 3, added: 1, skipped: 1, failed: 1 },
        added: [{ source: 'new-2024', id: 'new-2024', title: 'New Article' }],
        skipped: [{ source: 'dup-2024', existingId: 'existing-2024', duplicateType: 'doi' }],
        failed: [{ source: 'bad-2024', reason: 'fetch_error', error: 'Not found' }],
      };

      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(null, JSON.stringify(mockOutput), '');
      });

      const result = await refAddBulk('/path/to/import.json');
      expect(result.summary.total).toBe(3);
      expect(result.added).toHaveLength(1);
      expect(result.skipped).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });

    it('throws RefCliError when ref add fails', async () => {
      mockExecFn.mockImplementation((
        _cmd: string,
        callback: ExecCallback
      ) => {
        callback(new Error('Command failed') as ExecException, '', 'Error');
      });

      await expect(refAddBulk('/path/to/import.json')).rejects.toThrow(RefCliError);
    });
  });

  describe('RefCliError', () => {
    it('has correct properties', () => {
      const error = new RefCliError('test error', 'TEST_CODE');
      expect(error.message).toBe('test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('RefCliError');
    });

    it('includes cause when provided', () => {
      const cause = new Error('original');
      const error = new RefCliError('wrapped', 'WRAP_CODE', cause);
      expect(error.cause).toBe(cause);
    });
  });
});
