/**
 * Fulltext index management (fulltext-index.json).
 */

import { readFile, writeFile } from 'node:fs/promises';
import type { FulltextIndex, FulltextIndexEntry } from './types.js';

/** Create an empty fulltext index. */
export function createIndex(sessionId: string): FulltextIndex {
  return {
    sessionId,
    updatedAt: new Date().toISOString(),
    entries: {},
  };
}

/** Load and parse a fulltext-index.json file. */
export async function loadIndex(path: string): Promise<FulltextIndex> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as FulltextIndex;
}

/** Save a FulltextIndex to a JSON file with 2-space indentation. */
export async function saveIndex(path: string, index: FulltextIndex): Promise<void> {
  const updated: FulltextIndex = { ...index, updatedAt: new Date().toISOString() };
  const json = JSON.stringify(updated, null, 2);
  await writeFile(path, json + '\n', 'utf-8');
}

/** Add a new entry to the index. Returns a new index object. */
export function addEntry(index: FulltextIndex, entry: FulltextIndexEntry): FulltextIndex {
  return {
    ...index,
    updatedAt: new Date().toISOString(),
    entries: {
      ...index.entries,
      [entry.dirName]: entry,
    },
  };
}

/** Update an existing entry in the index. Throws if entry not found. */
export function updateEntry(
  index: FulltextIndex,
  dirName: string,
  update: Partial<FulltextIndexEntry>,
): FulltextIndex {
  const existing = index.entries[dirName];
  if (!existing) {
    throw new Error(`Entry not found: ${dirName}`);
  }

  return {
    ...index,
    updatedAt: new Date().toISOString(),
    entries: {
      ...index.entries,
      [dirName]: { ...existing, ...update },
    },
  };
}

/** Find an entry by DOI. */
export function findByDoi(
  index: FulltextIndex,
  doi: string,
): FulltextIndexEntry | undefined {
  return Object.values(index.entries).find((entry) => entry.doi === doi);
}

/** Find an entry by PMID. */
export function findByPmid(
  index: FulltextIndex,
  pmid: string,
): FulltextIndexEntry | undefined {
  return Object.values(index.entries).find((entry) => entry.pmid === pmid);
}
