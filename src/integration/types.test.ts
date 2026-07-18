import { describe, it, expect } from 'vitest';
import {
  RegistrationRecordSchema,
  RefAddOutputSchema,
  type RegistrationRecord,
  type RefAddOutput,
} from './types.js';

describe('Integration Types', () => {
  describe('RefAddOutputSchema', () => {
    it('validates valid ref add output', () => {
      const validOutput: RefAddOutput = {
        summary: { total: 3, added: 2, skipped: 1, failed: 0 },
        added: [{ source: '10.1234/example', id: 'smith2024', title: 'Example Article' }],
        skipped: [{ source: '10.5678/existing', existingId: 'jones2023', duplicateType: 'doi' }],
        failed: [],
      };

      const result = RefAddOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('validates output with failed items', () => {
      const output: RefAddOutput = {
        summary: { total: 2, added: 0, skipped: 0, failed: 2 },
        added: [],
        skipped: [],
        failed: [
          { source: '10.1234/notfound', reason: 'not_found' },
          { source: '10.5678/error', reason: 'fetch_error', error: 'Network timeout' },
        ],
      };

      const result = RefAddOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('rejects invalid summary structure', () => {
      const invalid = {
        summary: { total: 1 }, // missing fields
        added: [],
        skipped: [],
        failed: [],
      };

      const result = RefAddOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid added item', () => {
      const invalid = {
        summary: { total: 1, added: 1, skipped: 0, failed: 0 },
        added: [{ source: '10.1234/test' }], // missing id and title
        skipped: [],
        failed: [],
      };

      const result = RefAddOutputSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('RegistrationRecordSchema', () => {
    it('validates valid registration record', () => {
      const record: RegistrationRecord = {
        sessionId: '20240115_diabetes-ai_a3f2c1',
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 100, added: 95, skipped: 4, failed: 0, noId: 1 },
        added: [{ source: 'pmid:12345678', id: 'smith2024', title: 'Test Article' }],
        duplicates: [{ source: '10.1234/existing', existingId: 'jones2023', duplicateType: 'doi' }],
        failed: [],
      };

      const result = RegistrationRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
    });

    it('validates record with noId count', () => {
      const record: RegistrationRecord = {
        sessionId: 'test_session_123',
        timestamp: new Date().toISOString(),
        summary: { total: 10, added: 5, skipped: 2, failed: 1, noId: 2 },
        added: [],
        duplicates: [],
        failed: [{ source: '10.1234/fail', reason: 'not_found' }],
      };

      const result = RegistrationRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.summary.noId).toBe(2);
      }
    });

    it('rejects missing sessionId', () => {
      const invalid = {
        timestamp: '2024-01-15T10:30:00Z',
        summary: { total: 0, added: 0, skipped: 0, failed: 0, noId: 0 },
        added: [],
        duplicates: [],
        failed: [],
      };

      const result = RegistrationRecordSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects invalid timestamp format', () => {
      const invalid = {
        sessionId: 'test',
        timestamp: 'not-a-date',
        summary: { total: 0, added: 0, skipped: 0, failed: 0, noId: 0 },
        added: [],
        duplicates: [],
        failed: [],
      };

      const result = RegistrationRecordSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('validates empty record', () => {
      const record: RegistrationRecord = {
        sessionId: 'empty_session',
        timestamp: '2024-01-01T00:00:00Z',
        summary: { total: 0, added: 0, skipped: 0, failed: 0, noId: 0 },
        added: [],
        duplicates: [],
        failed: [],
      };

      const result = RegistrationRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
    });
  });
});
