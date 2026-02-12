import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseQueryFile, parseQueryString, detectShortKeywords } from './parser.js';

describe('Query Parser', () => {
  describe('parseQueryString', () => {
    it('should parse simple query YAML with id', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.name).toBe('test_query');
      expect(result.blocks).toHaveLength(1);
      const block = result.blocks[0]!;
      expect(block.id).toBe('population');
      expect(block.field).toBe('title_abstract');
      expect(block.terms.keywords).toEqual(['diabetes']);
      expect(block.operator).toBe('OR');
    });

    it('should parse query with description', () => {
      const yaml = `
name: test_query
description: A test query for diabetes research
query:
  - id: population
    field: title
    terms:
      keywords:
        - test
    operator: AND
`;
      const result = parseQueryString(yaml);
      expect(result.description).toBe('A test query for diabetes research');
    });

    it('should parse complex query with all fields', () => {
      const yaml = `
name: diabetes_ai_scoping
description: AI applications in Type 2 Diabetes management
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - type 2 diabetes
        - diabetes mellitus
        - T2DM
      mesh:
        - Diabetes Mellitus, Type 2
        - Diabetes Mellitus
    operator: OR
  - id: intervention
    field: title_abstract
    terms:
      keywords:
        - artificial intelligence
        - machine learning
        - deep learning
        - neural network
      mesh:
        - Artificial Intelligence
        - Machine Learning
        - Deep Learning
    operator: OR
  - id: outcome
    field: title_abstract
    terms:
      keywords:
        - diagnosis
        - prediction
        - management
        - treatment
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.name).toBe('diabetes_ai_scoping');
      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0]!.terms.mesh).toHaveLength(2);
      expect(result.blocks[1]!.terms.keywords).toHaveLength(4);
    });

    it('should parse query with filters', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
filters:
  year_from: 2020
  year_to: 2024
  language:
    - en
    - ja
  publication_types:
    include:
      - Journal Article
    exclude:
      - Review
      - Meta-Analysis
`;
      const result = parseQueryString(yaml);
      expect(result.filters.yearFrom).toBe(2020);
      expect(result.filters.yearTo).toBe(2024);
      expect(result.filters.languages).toEqual(['en', 'ja']);
      expect(result.filters.publicationTypes?.include).toEqual(['Journal Article']);
      expect(result.filters.publicationTypes?.exclude).toEqual(['Review', 'Meta-Analysis']);
    });

    it('should parse query with providers section', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
providers:
  pubmed:
    adds:
      filters:
        publication_types:
          exclude:
            - Comment
            - Letter
  arxiv:
    replaces:
      population:
        field: all
        terms:
          keywords:
            - arxiv-specific test
        operator: OR
    adds:
      filters:
        categories:
          - cs.AI
          - cs.LG
          - q-bio
  scopus:
    adds:
      filters:
        source_types:
          - journal
          - conference
`;
      const result = parseQueryString(yaml);
      expect(result.providers?.pubmed?.adds?.filters?.publicationTypes?.exclude).toEqual([
        'Comment',
        'Letter',
      ]);
      expect(result.providers?.arxiv?.replaces?.['population']?.field).toBe('all');
      expect(result.providers?.arxiv?.adds?.filters?.categories).toEqual(['cs.AI', 'cs.LG', 'q-bio']);
      expect(result.providers?.scopus?.adds?.filters?.sourceTypes).toEqual(['journal', 'conference']);
    });

    it('should throw for invalid YAML syntax', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
  invalid yaml here
    : missing key
`;
      expect(() => parseQueryString(yaml)).toThrow();
    });

    it('should throw for missing required fields', () => {
      // Missing name
      const yaml1 = `
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - test
    operator: OR
`;
      expect(() => parseQueryString(yaml1)).toThrow();

      // Missing query
      const yaml2 = `
name: test_query
`;
      expect(() => parseQueryString(yaml2)).toThrow();
    });

    it('should throw for empty query blocks', () => {
      const yaml = `
name: test_query
query: []
`;
      expect(() => parseQueryString(yaml)).toThrow();
    });

    it('should throw for invalid field type', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: invalid_field
    terms:
      keywords:
        - test
    operator: OR
`;
      expect(() => parseQueryString(yaml)).toThrow();
    });

    it('should throw for invalid operator', () => {
      const yaml = `
name: test_query
query:
  - id: population
    field: title
    terms:
      keywords:
        - test
    operator: XOR
`;
      expect(() => parseQueryString(yaml)).toThrow();
    });

    it('should parse query with exclude terms', () => {
      const yaml = `
name: epa_query
description: Search for EPA (entrustable professional activities)
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - EPA
        - entrustable professional activities
      exclude:
        - environmental protection
        - pollution
        - agency
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.name).toBe('epa_query');
      expect(result.blocks[0]!.terms.keywords).toEqual(['EPA', 'entrustable professional activities']);
      expect(result.blocks[0]!.terms.exclude).toEqual(['environmental protection', 'pollution', 'agency']);
    });

    it('should parse query with exclude and mesh terms', () => {
      const yaml = `
name: diabetes_exclude
query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes management
      mesh:
        - Diabetes Mellitus
      exclude:
        - animal
        - mice
        - rats
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.blocks[0]!.terms.keywords).toEqual(['diabetes management']);
      expect(result.blocks[0]!.terms.mesh).toEqual(['Diabetes Mellitus']);
      expect(result.blocks[0]!.terms.exclude).toEqual(['animal', 'mice', 'rats']);
    });

    it('should parse query with eric descriptors', () => {
      const yaml = `
name: eric_descriptor_test
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - medical education
      eric:
        - Medical Education
        - Clinical Experience
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.blocks[0]!.terms.keywords).toEqual(['medical education']);
      expect(result.blocks[0]!.terms.eric).toEqual(['Medical Education', 'Clinical Experience']);
    });

    it('should parse eric descriptors with empty array', () => {
      const yaml = `
name: eric_empty_test
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - education
      eric: []
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.blocks[0]!.terms.eric).toEqual([]);
    });

    it('should parse eric with single element', () => {
      const yaml = `
name: eric_single_test
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - learning
      eric:
        - Educational Technology
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.blocks[0]!.terms.eric).toEqual(['Educational Technology']);
    });

    it('should parse query with all vocabulary types including eric', () => {
      const yaml = `
name: all_vocab_test
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - medical education
      mesh:
        - Education, Medical
      emtree:
        - medical education
      eric:
        - Medical Education
        - Competency Based Education
      exclude:
        - veterinary
    operator: OR
`;
      const result = parseQueryString(yaml);
      expect(result.blocks[0]!.terms.keywords).toEqual(['medical education']);
      expect(result.blocks[0]!.terms.mesh).toEqual(['Education, Medical']);
      expect(result.blocks[0]!.terms.emtree).toEqual(['medical education']);
      expect(result.blocks[0]!.terms.eric).toEqual(['Medical Education', 'Competency Based Education']);
      expect(result.blocks[0]!.terms.exclude).toEqual(['veterinary']);
    });

    it('should throw for blocks without id', () => {
      const yaml = `
name: test_query
query:
  - field: title_abstract
    terms:
      keywords:
        - diabetes
    operator: OR
`;
      expect(() => parseQueryString(yaml)).toThrow();
    });
  });

  describe('parseQueryFile', () => {
    let testDir: string;

    beforeAll(async () => {
      testDir = join(tmpdir(), `query-parser-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterAll(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should parse query from file', async () => {
      const filePath = join(testDir, 'test-query.yaml');
      await writeFile(
        filePath,
        `
name: file_test_query
query:
  - id: population
    field: title
    terms:
      keywords:
        - test
    operator: AND
`
      );

      const result = await parseQueryFile(filePath);
      expect(result.name).toBe('file_test_query');
      expect(result.blocks).toHaveLength(1);
    });

    it('should throw for non-existent file', async () => {
      const filePath = join(testDir, 'non-existent.yaml');
      await expect(parseQueryFile(filePath)).rejects.toThrow();
    });

    it('should throw for invalid file content', async () => {
      const filePath = join(testDir, 'invalid-query.yaml');
      await writeFile(filePath, 'invalid: yaml: content: :::');

      await expect(parseQueryFile(filePath)).rejects.toThrow();
    });

    it('should parse complete example with providers', async () => {
      const filePath = join(testDir, 'complete-example.yaml');
      await writeFile(
        filePath,
        `
name: diabetes_ai_scoping
description: AI applications in Type 2 Diabetes management

query:
  - id: population
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - type 2 diabetes
        - diabetes mellitus
        - T2DM
      mesh:
        - Diabetes Mellitus, Type 2
        - Diabetes Mellitus
    operator: OR

  - id: intervention
    field: title_abstract
    terms:
      keywords:
        - artificial intelligence
        - machine learning
        - deep learning
        - neural network
      mesh:
        - Artificial Intelligence
        - Machine Learning
        - Deep Learning
    operator: OR

  - id: outcome
    field: title_abstract
    terms:
      keywords:
        - diagnosis
        - prediction
        - management
        - treatment
    operator: OR

filters:
  year_from: 2018
  year_to: 2024
  language:
    - en

providers:
  pubmed:
    adds:
      filters:
        publication_types:
          exclude:
            - Review
            - Systematic Review
            - Meta-Analysis

  arxiv:
    replaces:
      intervention:
        field: all
        terms:
          keywords:
            - deep learning
            - neural network
        operator: OR
    adds:
      filters:
        categories:
          - cs.AI
          - cs.LG
          - cs.CL
          - q-bio.QM
`
      );

      const result = await parseQueryFile(filePath);
      expect(result.name).toBe('diabetes_ai_scoping');
      expect(result.description).toBe('AI applications in Type 2 Diabetes management');
      expect(result.blocks).toHaveLength(3);
      expect(result.filters.yearFrom).toBe(2018);
      expect(result.providers?.arxiv?.adds?.filters?.categories).toHaveLength(4);
      expect(result.providers?.arxiv?.replaces?.['intervention']?.field).toBe('all');
    });
  });

  describe('detectShortKeywords', () => {
    it('should detect short keywords (3 characters or fewer)', () => {
      const ast = parseQueryString(`
name: test_query
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - EPA
        - OSCE
        - AI
        - machine learning
    operator: OR
`);
      const shortKeywords = detectShortKeywords(ast);
      expect(shortKeywords).toContain('EPA');
      expect(shortKeywords).toContain('AI');
      expect(shortKeywords).not.toContain('OSCE');
      expect(shortKeywords).not.toContain('machine learning');
    });

    it('should return empty array when no short keywords', () => {
      const ast = parseQueryString(`
name: test_query
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - diabetes
        - artificial intelligence
    operator: OR
`);
      const shortKeywords = detectShortKeywords(ast);
      expect(shortKeywords).toHaveLength(0);
    });

    it('should detect short keywords from multiple blocks', () => {
      const ast = parseQueryString(`
name: test_query
query:
  - id: block1
    field: title_abstract
    terms:
      keywords:
        - EPA
    operator: OR
  - id: block2
    field: title_abstract
    terms:
      keywords:
        - CBE
    operator: OR
`);
      const shortKeywords = detectShortKeywords(ast);
      expect(shortKeywords).toContain('EPA');
      expect(shortKeywords).toContain('CBE');
      expect(shortKeywords).toHaveLength(2);
    });

    it('should not include duplicates', () => {
      const ast = parseQueryString(`
name: test_query
query:
  - id: block1
    field: title_abstract
    terms:
      keywords:
        - EPA
    operator: OR
  - id: block2
    field: title
    terms:
      keywords:
        - EPA
    operator: OR
`);
      const shortKeywords = detectShortKeywords(ast);
      expect(shortKeywords).toEqual(['EPA']);
    });

    it('should use custom threshold if provided', () => {
      const ast = parseQueryString(`
name: test_query
query:
  - id: concept
    field: title_abstract
    terms:
      keywords:
        - OSCE
        - EPA
        - test
    operator: OR
`);
      const shortKeywords = detectShortKeywords(ast, 4);
      expect(shortKeywords).toContain('OSCE');
      expect(shortKeywords).toContain('EPA');
      expect(shortKeywords).toContain('test');
    });
  });
});
