import { describe, it, expect } from 'vitest';
import { generateSessionId, sanitizeName } from './manager';

describe('Session Manager', () => {
  describe('sanitizeName', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeName('TestName')).toBe('testname');
    });

    it('should replace spaces with dashes', () => {
      expect(sanitizeName('test name')).toBe('test-name');
    });

    it('should remove non-alphanumeric characters except dashes', () => {
      expect(sanitizeName('test@name#123!')).toBe('testname123');
    });

    it('should collapse multiple dashes into one', () => {
      expect(sanitizeName('test--name')).toBe('test-name');
      expect(sanitizeName('test  name')).toBe('test-name');
    });

    it('should trim dashes from start and end', () => {
      expect(sanitizeName('-test-name-')).toBe('test-name');
      expect(sanitizeName('  test name  ')).toBe('test-name');
    });

    it('should handle complex names', () => {
      expect(sanitizeName('Diabetes & AI - Scoping Review 2024')).toBe(
        'diabetes-ai-scoping-review-2024'
      );
    });
  });

  describe('generateSessionId', () => {
    it('should generate ID in format {date}_{name}_{hash}', () => {
      const id = generateSessionId('test-query', 'abc123def456');
      const pattern = /^\d{8}_[a-z0-9-]+_[a-f0-9]{6}$/;
      expect(id).toMatch(pattern);
    });

    it('should use first 6 characters of hash', () => {
      const id = generateSessionId(
        'test',
        'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      );
      expect(id).toContain('_abcdef');
    });

    it('should use current date in YYYYMMDD format', () => {
      const id = generateSessionId('test', 'abc123');
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      expect(id.startsWith(today)).toBe(true);
    });

    it('should sanitize the query name', () => {
      const id = generateSessionId('Test Query Name!', 'abc123');
      expect(id).toContain('_test-query-name_');
    });

    it('should generate unique IDs for different queries', () => {
      const id1 = generateSessionId('query1', 'hash1abc');
      const id2 = generateSessionId('query2', 'hash2def');
      expect(id1).not.toBe(id2);
    });

    it('should generate unique IDs for same name but different hash', () => {
      const id1 = generateSessionId('same-name', 'hash1abc');
      const id2 = generateSessionId('same-name', 'hash2def');
      expect(id1).not.toBe(id2);
    });

    it('should produce ID like example: 20240115_diabetes-ai-scoping_a3f2c1', () => {
      const id = generateSessionId('Diabetes AI Scoping', 'a3f2c1d4e5f6');
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toMatch(/^\d{8}$/);
      expect(parts[1]).toBe('diabetes-ai-scoping');
      expect(parts[2]).toBe('a3f2c1');
    });
  });
});
