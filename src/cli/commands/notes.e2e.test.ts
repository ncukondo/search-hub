/**
 * E2E Tests for `search-hub notes` command
 *
 * Tests the full notes lifecycle:
 * - Add notes and verify persistence
 * - Add assessments with structured fields
 * - List notes for a session
 * - Cross-session notes view
 * - Notes display in status command
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { setupE2EContext, type E2EContext } from '../e2e-helpers.js';
import { loadNotes, addNote, addAssessment, formatAllSessionNotes, type SessionNotes } from './notes.js';
import { getSessionDetails, formatSessionDetails } from './status.js';

describe('search-hub notes E2E', () => {
  let ctx: E2EContext;

  beforeEach(async () => {
    ctx = await setupE2EContext();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  async function createTestSession(
    id: string,
    options: { name?: string; status?: string } = {}
  ): Promise<string> {
    const sessionDir = join(ctx.sessionsDir, id);
    await mkdir(sessionDir, { recursive: true });

    const session = {
      version: 1,
      id,
      name: options.name ?? 'Test Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      query: { file: 'test-query.yaml', hash: 'abc123', targets: ['pubmed'] },
      databases: {
        pubmed: { status: 'completed', totalHits: 100, retrievedCount: 50, files: { query: 'query_pubmed.txt', results: 'results_pubmed.jsonl' } },
      },
      summary: { status: options.status ?? 'completed', totalHits: 100, totalRetrieved: 50 },
    };

    await writeFile(join(sessionDir, 'session.yaml'), stringifyYaml(session), 'utf-8');
    return id;
  }

  describe('notes lifecycle', () => {
    it('should create, persist, and load notes', async () => {
      const sessionId = await createTestSession('test-session-1', { name: 'Test Search' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      // Add a note
      await addNote(sessionDir, 'MeSH terms too broad, removing in next iteration');

      // Verify file was created
      const content = await readFile(join(sessionDir, 'notes.yaml'), 'utf-8');
      expect(content).toContain('# Notes for session');
      expect(content).toContain('MeSH terms too broad');

      // Load and verify
      const notes = await loadNotes(sessionDir);
      expect(notes).toHaveLength(1);
      expect(notes[0]!.text).toBe('MeSH terms too broad, removing in next iteration');
      expect(notes[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    });

    it('should add multiple notes and preserve order', async () => {
      const sessionId = await createTestSession('test-session-2', { name: 'Multi Note Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      await addNote(sessionDir, 'First note');
      await addNote(sessionDir, 'Second note');
      await addNote(sessionDir, 'Third note');

      const notes = await loadNotes(sessionDir);
      expect(notes).toHaveLength(3);
      expect(notes[0]!.text).toBe('First note');
      expect(notes[1]!.text).toBe('Second note');
      expect(notes[2]!.text).toBe('Third note');
    });

    it('should add structured assessment and verify fields', async () => {
      const sessionId = await createTestSession('test-session-3', { name: 'Assessment Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      await addAssessment(sessionDir, {
        precision: '~54%',
        verdict: 'good',
        comment: 'Core WBA papers captured, some OSCE noise remains',
      });

      const notes = await loadNotes(sessionDir);
      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('assessment');
      expect((notes[0] as { precision?: string }).precision).toBe('~54%');
      expect((notes[0] as { verdict?: string }).verdict).toBe('good');
      expect(notes[0]!.text).toBe('Core WBA papers captured, some OSCE noise remains');
    });

    it('should mix notes and assessments in the same session', async () => {
      const sessionId = await createTestSession('test-session-4', { name: 'Mixed Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      await addNote(sessionDir, 'Starting search iteration v6');
      await addAssessment(sessionDir, {
        precision: '15/28',
        verdict: 'refine',
        comment: 'Too many false positives from OSCE terms',
      });
      await addNote(sessionDir, 'Final version - accepted as search strategy for PubMed');

      const notes = await loadNotes(sessionDir);
      expect(notes).toHaveLength(3);
      expect(notes[0]!.type).toBeUndefined();
      expect(notes[1]!.type).toBe('assessment');
      expect(notes[2]!.type).toBeUndefined();
    });
  });

  describe('status command shows notes', () => {
    it('should include notes in status details', async () => {
      const sessionId = await createTestSession('status-notes-test', { name: 'Status Notes Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      await addNote(sessionDir, 'A note for status display');
      await addAssessment(sessionDir, {
        precision: '~54%',
        verdict: 'good',
        comment: 'Core papers captured',
      });

      const result = await getSessionDetails(sessionId, ctx.sessionsDir);
      expect(result.success).toBe(true);
      expect(result.session!.notes).toBeDefined();
      expect(result.session!.notes).toHaveLength(2);

      const output = formatSessionDetails(result.session!, { json: false });
      expect(output).toContain('Notes:');
      expect(output).toContain('A note for status display');
      expect(output).toContain('Assessment');
      expect(output).toContain('precision ~54%');
    });

    it('should not show notes section when no notes exist', async () => {
      const sessionId = await createTestSession('no-notes-test', { name: 'No Notes Test' });

      const result = await getSessionDetails(sessionId, ctx.sessionsDir);
      expect(result.success).toBe(true);
      expect(result.session!.notes).toBeUndefined();

      const output = formatSessionDetails(result.session!, { json: false });
      expect(output).not.toContain('Notes:');
    });
  });

  describe('cross-session notes view', () => {
    it('should aggregate notes from multiple sessions', async () => {
      const session1 = await createTestSession('cross-session-1', { name: 'Search v1' });
      const session2 = await createTestSession('cross-session-2', { name: 'Search v2' });

      await addNote(join(ctx.sessionsDir, session1), 'Note from v1');
      await addNote(join(ctx.sessionsDir, session2), 'Note from v2');
      await addAssessment(join(ctx.sessionsDir, session2), {
        verdict: 'good',
        comment: 'Final version accepted',
      });

      // Simulate what the CLI does for --all
      const { listSessions } = await import('../../session/manager.js');
      const summaries = await listSessions(ctx.sessionsDir);
      const allNotes: SessionNotes[] = [];

      for (const summary of summaries) {
        const notes = await loadNotes(join(ctx.sessionsDir, summary.id));
        allNotes.push({
          sessionId: summary.id,
          sessionName: summary.name,
          notes,
        });
      }

      const output = formatAllSessionNotes(allNotes);
      expect(output).toContain('Search v1');
      expect(output).toContain('Note from v1');
      expect(output).toContain('Search v2');
      expect(output).toContain('Note from v2');
      expect(output).toContain('Final version accepted');
    });

    it('should skip sessions without notes in --all view', async () => {
      await createTestSession('has-notes', { name: 'Has Notes' });
      await createTestSession('no-notes', { name: 'No Notes' });

      await addNote(join(ctx.sessionsDir, 'has-notes'), 'This session has a note');

      const { listSessions } = await import('../../session/manager.js');
      const summaries = await listSessions(ctx.sessionsDir);
      const allNotes: SessionNotes[] = [];

      for (const summary of summaries) {
        const notes = await loadNotes(join(ctx.sessionsDir, summary.id));
        allNotes.push({
          sessionId: summary.id,
          sessionName: summary.name,
          notes,
        });
      }

      const output = formatAllSessionNotes(allNotes);
      expect(output).toContain('Has Notes');
      expect(output).not.toContain('No Notes');
    });
  });

  describe('YAML format preservation', () => {
    it('should preserve user comments when adding notes', async () => {
      const sessionId = await createTestSession('comment-test', { name: 'Comment Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      // Create a notes.yaml with user comments
      const manualContent = `# Notes for wba-genai-v6
# Search strategy documentation
# This is my personal note

- date: "2026-02-03 10:30"
  text: "Manual entry"
`;
      await writeFile(join(sessionDir, 'notes.yaml'), manualContent, 'utf-8');

      // Add a note via CLI function
      await addNote(sessionDir, 'CLI-added note');

      // Verify comments are preserved
      const content = await readFile(join(sessionDir, 'notes.yaml'), 'utf-8');
      expect(content).toContain('# Notes for wba-genai-v6');
      expect(content).toContain('# Search strategy documentation');
      expect(content).toContain('# This is my personal note');
      expect(content).toContain('Manual entry');
      expect(content).toContain('CLI-added note');

      // Verify both entries are parseable
      const notes = await loadNotes(sessionDir);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.text).toBe('Manual entry');
      expect(notes[1]!.text).toBe('CLI-added note');
    });

    it('should produce human-readable YAML format', async () => {
      const sessionId = await createTestSession('format-test', { name: 'Format Test' });
      const sessionDir = join(ctx.sessionsDir, sessionId);

      await addNote(sessionDir, 'A simple note');
      await addAssessment(sessionDir, {
        precision: '~54%',
        verdict: 'good',
        comment: 'Core papers captured',
      });

      const content = await readFile(join(sessionDir, 'notes.yaml'), 'utf-8');

      // Should be readable YAML with proper indentation
      expect(content).toContain('- date:');
      expect(content).toContain('  text:');
      // Assessment should have type field
      expect(content).toContain('  type: assessment');
      expect(content).toContain('  precision:');
      expect(content).toContain('  verdict:');
    });
  });
});
