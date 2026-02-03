import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadNotes,
  addNote,
  addAssessment,
  formatNotesList,
  formatAllSessionNotes,
  type NoteEntry,
  type AssessmentEntry,
} from './notes.js';

let testDir: string;
let sessionDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'notes-test-'));
  sessionDir = join(testDir, 'test-session');
  await mkdir(sessionDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe('loadNotes', () => {
  it('should return empty array when notes.yaml does not exist', async () => {
    const notes = await loadNotes(sessionDir);
    expect(notes).toEqual([]);
  });

  it('should parse notes from existing notes.yaml', async () => {
    const yaml = `- date: "2026-02-03 10:30"
  text: "First note"

- date: "2026-02-03 10:45"
  text: "Second note"
`;
    await writeFile(join(sessionDir, 'notes.yaml'), yaml, 'utf-8');

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.date).toBe('2026-02-03 10:30');
    expect(notes[0]!.text).toBe('First note');
    expect(notes[1]!.text).toBe('Second note');
  });

  it('should parse assessment entries with structured fields', async () => {
    const yaml = `- date: "2026-02-03 10:45"
  type: assessment
  precision: "~54%"
  verdict: good
  text: "Core papers captured"
`;
    await writeFile(join(sessionDir, 'notes.yaml'), yaml, 'utf-8');

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);
    const entry = notes[0] as AssessmentEntry;
    expect(entry.type).toBe('assessment');
    expect(entry.precision).toBe('~54%');
    expect(entry.verdict).toBe('good');
    expect(entry.text).toBe('Core papers captured');
  });

  it('should handle empty notes.yaml file', async () => {
    await writeFile(join(sessionDir, 'notes.yaml'), '', 'utf-8');
    const notes = await loadNotes(sessionDir);
    expect(notes).toEqual([]);
  });

  it('should handle notes.yaml with only comments', async () => {
    await writeFile(
      join(sessionDir, 'notes.yaml'),
      '# Notes for session\n# No entries yet\n',
      'utf-8'
    );
    const notes = await loadNotes(sessionDir);
    expect(notes).toEqual([]);
  });
});

describe('addNote', () => {
  it('should create notes.yaml with header comment when file does not exist', async () => {
    await addNote(sessionDir, 'My first note');

    const content = await readFile(join(sessionDir, 'notes.yaml'), 'utf-8');
    expect(content).toContain('# Notes for session');
    expect(content).toContain('My first note');

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.text).toBe('My first note');
    expect(notes[0]!.date).toBeTruthy();
  });

  it('should append to existing notes.yaml', async () => {
    const existingYaml = `# Notes for session
- date: "2026-02-03 10:30"
  text: "First note"
`;
    await writeFile(join(sessionDir, 'notes.yaml'), existingYaml, 'utf-8');

    await addNote(sessionDir, 'Second note');

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.text).toBe('First note');
    expect(notes[1]!.text).toBe('Second note');
  });

  it('should preserve existing comments in notes.yaml', async () => {
    const existingYaml = `# Notes for session: wba-genai-v6
# Manual comment here
- date: "2026-02-03 10:30"
  text: "First note"
`;
    await writeFile(join(sessionDir, 'notes.yaml'), existingYaml, 'utf-8');

    await addNote(sessionDir, 'Second note');

    const content = await readFile(join(sessionDir, 'notes.yaml'), 'utf-8');
    expect(content).toContain('# Notes for session: wba-genai-v6');
    expect(content).toContain('# Manual comment here');
  });

  it('should auto-populate date field', async () => {
    const before = new Date();
    await addNote(sessionDir, 'Timestamped note');
    const after = new Date();

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);

    // date should be in "YYYY-MM-DD HH:mm" format
    const dateStr = notes[0]!.date;
    expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

    // Parse the date and check it's in range
    const parts = dateStr.split(/[-: ]/);
    const parsedDate = new Date(
      parseInt(parts[0]!, 10),
      parseInt(parts[1]!, 10) - 1,
      parseInt(parts[2]!, 10),
      parseInt(parts[3]!, 10),
      parseInt(parts[4]!, 10)
    );
    expect(parsedDate.getTime()).toBeGreaterThanOrEqual(before.getTime() - 60000);
    expect(parsedDate.getTime()).toBeLessThanOrEqual(after.getTime() + 60000);
  });
});

describe('addAssessment', () => {
  it('should add structured assessment entry', async () => {
    await addAssessment(sessionDir, {
      precision: '~54%',
      verdict: 'good',
      comment: 'Core WBA papers captured',
    });

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);

    const entry = notes[0] as AssessmentEntry;
    expect(entry.type).toBe('assessment');
    expect(entry.precision).toBe('~54%');
    expect(entry.verdict).toBe('good');
    expect(entry.text).toBe('Core WBA papers captured');
    expect(entry.date).toBeTruthy();
  });

  it('should add assessment with only comment', async () => {
    await addAssessment(sessionDir, {
      comment: 'Needs refinement',
    });

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);
    const entry = notes[0] as AssessmentEntry;
    expect(entry.type).toBe('assessment');
    expect(entry.text).toBe('Needs refinement');
    expect(entry.precision).toBeUndefined();
    expect(entry.verdict).toBeUndefined();
  });

  it('should add assessment with precision and verdict but no comment', async () => {
    await addAssessment(sessionDir, {
      precision: '15/28',
      verdict: 'refine',
    });

    const notes = await loadNotes(sessionDir);
    expect(notes).toHaveLength(1);
    const entry = notes[0] as AssessmentEntry;
    expect(entry.type).toBe('assessment');
    expect(entry.precision).toBe('15/28');
    expect(entry.verdict).toBe('refine');
  });
});

describe('formatNotesList', () => {
  it('should format plain notes with timestamp', () => {
    const notes: NoteEntry[] = [
      { date: '2026-02-03 10:30', text: 'First note' },
      { date: '2026-02-03 10:45', text: 'Second note' },
    ];

    const output = formatNotesList(notes);
    expect(output).toContain('[2026-02-03 10:30]');
    expect(output).toContain('First note');
    expect(output).toContain('[2026-02-03 10:45]');
    expect(output).toContain('Second note');
  });

  it('should format assessment entries with structured fields', () => {
    const notes: NoteEntry[] = [
      {
        date: '2026-02-03 10:45',
        type: 'assessment',
        precision: '~54%',
        verdict: 'good',
        text: 'Core WBA papers captured',
      } as AssessmentEntry,
    ];

    const output = formatNotesList(notes);
    expect(output).toContain('[2026-02-03 10:45]');
    expect(output).toContain('Assessment');
    expect(output).toContain('precision ~54%');
    expect(output).toContain('verdict: good');
    expect(output).toContain('Core WBA papers captured');
  });

  it('should return message when no notes exist', () => {
    const output = formatNotesList([]);
    expect(output).toContain('No notes');
  });

  it('should format as JSON when json option is true', () => {
    const notes: NoteEntry[] = [
      { date: '2026-02-03 10:30', text: 'First note' },
    ];

    const output = formatNotesList(notes, { json: true });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].text).toBe('First note');
  });
});

describe('formatAllSessionNotes', () => {
  it('should group notes by session', () => {
    const sessions = [
      {
        sessionId: 'session-1',
        sessionName: 'First Search',
        notes: [
          { date: '2026-02-03 10:30', text: 'Note A' } as NoteEntry,
        ],
      },
      {
        sessionId: 'session-2',
        sessionName: 'Second Search',
        notes: [
          { date: '2026-02-03 11:00', text: 'Note B' } as NoteEntry,
        ],
      },
    ];

    const output = formatAllSessionNotes(sessions);
    expect(output).toContain('session-1');
    expect(output).toContain('First Search');
    expect(output).toContain('Note A');
    expect(output).toContain('session-2');
    expect(output).toContain('Second Search');
    expect(output).toContain('Note B');
  });

  it('should skip sessions with no notes', () => {
    const sessions = [
      {
        sessionId: 'session-1',
        sessionName: 'First Search',
        notes: [
          { date: '2026-02-03 10:30', text: 'Note A' } as NoteEntry,
        ],
      },
      {
        sessionId: 'session-2',
        sessionName: 'Empty Session',
        notes: [],
      },
    ];

    const output = formatAllSessionNotes(sessions);
    expect(output).toContain('session-1');
    expect(output).not.toContain('Empty Session');
  });

  it('should return message when no sessions have notes', () => {
    const output = formatAllSessionNotes([]);
    expect(output).toContain('No notes found');
  });

  it('should format as JSON when json option is true', () => {
    const sessions = [
      {
        sessionId: 'session-1',
        sessionName: 'First Search',
        notes: [
          { date: '2026-02-03 10:30', text: 'Note A' } as NoteEntry,
        ],
      },
    ];

    const output = formatAllSessionNotes(sessions, { json: true });
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].sessionId).toBe('session-1');
    expect(parsed[0].notes).toHaveLength(1);
  });
});
