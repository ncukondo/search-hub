import { describe, it, expect } from 'vitest';
import {
  parseIdentifierFile,
  type ParsedIdentifier,
} from './check.js';

describe('parseIdentifierFile', () => {
  it('parses DOIs starting with 10.', () => {
    const result = parseIdentifierFile('10.1001/jama.2023.12345\n10.1016/j.lancet.2022.01234');
    expect(result).toEqual([
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'doi', value: '10.1016/j.lancet.2022.01234', raw: '10.1016/j.lancet.2022.01234' },
    ]);
  });

  it('parses PMIDs (numeric only)', () => {
    const result = parseIdentifierFile('37654321\n36543210');
    expect(result).toEqual([
      { type: 'pmid', value: '37654321', raw: '37654321' },
      { type: 'pmid', value: '36543210', raw: '36543210' },
    ]);
  });

  it('parses prefixed DOIs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('DOI:10.1038/s41586-023-xxxxx\ndoi:10.1002/abc');
    expect(result).toEqual([
      { type: 'doi', value: '10.1038/s41586-023-xxxxx', raw: 'DOI:10.1038/s41586-023-xxxxx' },
      { type: 'doi', value: '10.1002/abc', raw: 'doi:10.1002/abc' },
    ]);
  });

  it('parses prefixed PMIDs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('PMID:36543210\npmid:12345678');
    expect(result).toEqual([
      { type: 'pmid', value: '36543210', raw: 'PMID:36543210' },
      { type: 'pmid', value: '12345678', raw: 'pmid:12345678' },
    ]);
  });

  it('parses prefixed arXiv IDs (case-insensitive prefix)', () => {
    const result = parseIdentifierFile('arxiv:2301.12345\nARXIV:2305.67890');
    expect(result).toEqual([
      { type: 'arxiv', value: '2301.12345', raw: 'arxiv:2301.12345' },
      { type: 'arxiv', value: '2305.67890', raw: 'ARXIV:2305.67890' },
    ]);
  });

  it('skips comments and empty lines', () => {
    const input = `# This is a comment
10.1001/jama.2023.12345

# Another comment
37654321
`;
    const result = parseIdentifierFile(input);
    expect(result).toHaveLength(2);
    expect(result[0]!.type).toBe('doi');
    expect(result[1]!.type).toBe('pmid');
  });

  it('trims whitespace', () => {
    const result = parseIdentifierFile('  10.1001/jama.2023.12345  \n  37654321  ');
    expect(result).toEqual([
      { type: 'doi', value: '10.1001/jama.2023.12345', raw: '10.1001/jama.2023.12345' },
      { type: 'pmid', value: '37654321', raw: '37654321' },
    ]);
  });

  it('throws on unrecognizable lines with line number', () => {
    const input = `10.1001/jama.2023.12345
not-a-valid-id
37654321`;
    expect(() => parseIdentifierFile(input)).toThrow(/line 2/i);
    expect(() => parseIdentifierFile(input)).toThrow(/not-a-valid-id/);
  });

  it('handles mixed identifier types', () => {
    const input = `10.1001/jama.2023.12345
37654321
DOI:10.1038/s41586-023-xxxxx
PMID:36543210
arxiv:2301.12345`;
    const result = parseIdentifierFile(input);
    expect(result).toHaveLength(5);
    expect(result.map(r => r.type)).toEqual(['doi', 'pmid', 'doi', 'pmid', 'arxiv']);
  });

  it('returns empty array for empty input', () => {
    expect(parseIdentifierFile('')).toEqual([]);
    expect(parseIdentifierFile('# only comments\n\n')).toEqual([]);
  });
});
