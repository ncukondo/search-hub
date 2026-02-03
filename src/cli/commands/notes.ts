/**
 * Session notes CRUD operations and formatting.
 *
 * Notes are stored as `notes.yaml` in the session directory.
 * YAML is chosen for human readability and ease of manual editing.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

/**
 * A plain note entry.
 */
export interface NoteEntry {
  date: string;
  text: string;
  type?: string;
}

/**
 * A structured assessment entry.
 */
export interface AssessmentEntry extends NoteEntry {
  type: 'assessment';
  precision?: string;
  verdict?: string;
}

/**
 * Options for adding an assessment.
 */
export interface AssessmentOptions {
  precision?: string | undefined;
  verdict?: string | undefined;
  comment?: string | undefined;
}

/**
 * Session notes for cross-session display.
 */
export interface SessionNotes {
  sessionId: string;
  sessionName: string;
  notes: NoteEntry[];
}

const NOTES_FILE = 'notes.yaml';
const HEADER_COMMENT = '# Notes for session\n# Add entries manually or via: search-hub notes <session-id> add "..."\n\n';

/**
 * Generate a timestamp in "YYYY-MM-DD HH:mm" format.
 */
function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

/**
 * Load notes from a session directory.
 * Returns an empty array if notes.yaml doesn't exist or is empty.
 */
export async function loadNotes(sessionDir: string): Promise<NoteEntry[]> {
  const notesPath = join(sessionDir, NOTES_FILE);

  let content: string;
  try {
    content = await readFile(notesPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  if (!content.trim()) {
    return [];
  }

  const parsed = parse(content);

  // YAML with only comments parses to null
  if (parsed === null || parsed === undefined) {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as NoteEntry[];
}

/**
 * Read the raw content of notes.yaml, preserving comments.
 * Returns null if file doesn't exist.
 */
async function readRawNotes(sessionDir: string): Promise<string | null> {
  const notesPath = join(sessionDir, NOTES_FILE);
  try {
    return await readFile(notesPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Append a note entry to notes.yaml using text-append strategy.
 * This preserves any existing comments in the file.
 */
async function appendEntry(sessionDir: string, entry: Record<string, unknown>): Promise<void> {
  const notesPath = join(sessionDir, NOTES_FILE);
  const existing = await readRawNotes(sessionDir);

  // Stringify the single entry as a YAML sequence item
  const entryYaml = stringify([entry], { lineWidth: 0 }).trimEnd();

  let content: string;
  if (existing === null) {
    // New file: add header comment + entry
    content = HEADER_COMMENT + entryYaml + '\n';
  } else {
    // Append to existing file
    const trimmed = existing.trimEnd();
    content = trimmed + '\n\n' + entryYaml + '\n';
  }

  await writeFile(notesPath, content, 'utf-8');
}

/**
 * Add a plain text note to a session.
 */
export async function addNote(sessionDir: string, text: string): Promise<void> {
  const entry: Record<string, unknown> = {
    date: formatTimestamp(),
    text,
  };

  await appendEntry(sessionDir, entry);
}

/**
 * Add a structured assessment to a session.
 */
export async function addAssessment(
  sessionDir: string,
  options: AssessmentOptions
): Promise<void> {
  const entry: Record<string, unknown> = {
    date: formatTimestamp(),
    type: 'assessment',
  };

  if (options.precision) {
    entry['precision'] = options.precision;
  }
  if (options.verdict) {
    entry['verdict'] = options.verdict;
  }
  if (options.comment) {
    entry['text'] = options.comment;
  }

  await appendEntry(sessionDir, entry);
}

/**
 * Format notes list for display.
 */
export function formatNotesList(
  notes: NoteEntry[],
  options?: { json?: boolean }
): string {
  if (options?.json) {
    return JSON.stringify(notes, null, 2);
  }

  if (notes.length === 0) {
    return 'No notes for this session.';
  }

  const lines: string[] = [];

  for (const note of notes) {
    if (note.type === 'assessment') {
      const assessment = note as AssessmentEntry;
      const parts: string[] = [];
      if (assessment.precision) {
        parts.push(`precision ${assessment.precision}`);
      }
      if (assessment.verdict) {
        parts.push(`verdict: ${assessment.verdict}`);
      }
      const metaLine = parts.length > 0 ? ` ${parts.join(', ')}` : '';
      lines.push(`[${note.date}] Assessment:${metaLine}`);
      if (assessment.text) {
        lines.push(`${''.padEnd(note.date.length + 3)}${assessment.text}`);
      }
    } else {
      lines.push(`[${note.date}] ${note.text}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format notes from all sessions for display.
 */
export function formatAllSessionNotes(
  sessions: SessionNotes[],
  options?: { json?: boolean }
): string {
  if (options?.json) {
    const filtered = sessions.filter((s) => s.notes.length > 0);
    return JSON.stringify(filtered, null, 2);
  }

  const withNotes = sessions.filter((s) => s.notes.length > 0);

  if (withNotes.length === 0) {
    return 'No notes found across sessions.';
  }

  const lines: string[] = [];

  for (const session of withNotes) {
    lines.push(`--- ${session.sessionName} (${session.sessionId}) ---`);
    lines.push(formatNotesList(session.notes));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
