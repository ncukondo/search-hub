import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionLogger } from './logger';
import type { LogEvent } from './types';

describe('SessionLogger', () => {
  let testDir: string;
  let logPath: string;
  let logger: SessionLogger;

  beforeEach(async () => {
    testDir = join(tmpdir(), `search-hub-logger-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    logPath = join(testDir, 'log.jsonl');
    logger = new SessionLogger(logPath);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('log', () => {
    it('should log session_created event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'session_created',
        data: { id: 'test-session-id', query: '/path/to/query.yaml' },
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const logged = JSON.parse(lines[0]!);
      expect(logged).toMatchObject({
        event: 'session_created',
        data: { id: 'test-session-id', query: '/path/to/query.yaml' },
      });
    });

    it('should log search_started event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'search_started',
        provider: 'pubmed',
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({ event: 'search_started', provider: 'pubmed' });
    });

    it('should log page_fetched event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'page_fetched',
        provider: 'eric',
        page: 2,
        count: 50,
        cursor: 'cursor-token',
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'page_fetched',
        provider: 'eric',
        page: 2,
        count: 50,
        cursor: 'cursor-token',
      });
    });

    it('should log rate_limited event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'rate_limited',
        provider: 'scopus',
        waitMs: 1000,
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'rate_limited',
        provider: 'scopus',
        waitMs: 1000,
      });
    });

    it('should log retry event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'retry',
        provider: 'arxiv',
        attempt: 2,
        reason: 'Connection timeout',
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'retry',
        provider: 'arxiv',
        attempt: 2,
        reason: 'Connection timeout',
      });
    });

    it('should log search_completed event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'search_completed',
        provider: 'pubmed',
        total: 500,
        duration: 30000,
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'search_completed',
        provider: 'pubmed',
        total: 500,
        duration: 30000,
      });
    });

    it('should log search_failed event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'search_failed',
        provider: 'eric',
        error: 'API key invalid',
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'search_failed',
        provider: 'eric',
        error: 'API key invalid',
      });
    });

    it('should log session_completed event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'session_completed',
        summary: { totalHits: 1500, totalRetrieved: 1500 },
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'session_completed',
        summary: { totalHits: 1500, totalRetrieved: 1500 },
      });
    });

    it('should log session_resumed event', async () => {
      const event: LogEvent = {
        ts: new Date().toISOString(),
        event: 'session_resumed',
        fromProvider: 'pubmed',
        fromPage: 5,
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toMatchObject({
        event: 'session_resumed',
        fromProvider: 'pubmed',
        fromPage: 5,
      });
    });

    it('should have timestamps in ISO 8601 format', async () => {
      const ts = '2024-01-15T10:30:45.123Z';
      const event: LogEvent = {
        ts,
        event: 'session_created',
        data: { id: 'test', query: 'query.yaml' },
      };

      await logger.log(event);

      const content = await readFile(logPath, 'utf-8');
      const logged = JSON.parse(content.trim());
      expect(logged).toHaveProperty('ts', ts);
      expect(logged['ts']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should append to existing log', async () => {
      const event1: LogEvent = {
        ts: '2024-01-15T10:00:00.000Z',
        event: 'session_created',
        data: { id: 'session-1', query: 'query.yaml' },
      };
      const event2: LogEvent = {
        ts: '2024-01-15T10:00:01.000Z',
        event: 'search_started',
        provider: 'pubmed',
      };
      const event3: LogEvent = {
        ts: '2024-01-15T10:00:05.000Z',
        event: 'page_fetched',
        provider: 'pubmed',
        page: 1,
        count: 100,
      };

      await logger.log(event1);
      await logger.log(event2);
      await logger.log(event3);

      const content = await readFile(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const logged1 = JSON.parse(lines[0]!);
      const logged2 = JSON.parse(lines[1]!);
      const logged3 = JSON.parse(lines[2]!);

      expect(logged1).toHaveProperty('event', 'session_created');
      expect(logged2).toHaveProperty('event', 'search_started');
      expect(logged3).toHaveProperty('event', 'page_fetched');
    });
  });
});
