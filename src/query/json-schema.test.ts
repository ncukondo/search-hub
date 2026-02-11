import { describe, it, expect } from 'vitest';
import { generateQueryJSONSchema } from './json-schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JSONSchema = Record<string, any>;

describe('generateQueryJSONSchema', () => {
  it('should generate a valid JSON Schema draft', () => {
    const schema = generateQueryJSONSchema();
    expect(schema['$schema']).toContain('json-schema.org');
  });

  it('should include name as required string', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    expect(schema['required']).toContain('name');
    expect(schema['properties']['name']).toMatchObject({
      type: 'string',
      minLength: 1,
    });
  });

  it('should include query as required array', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    expect(schema['required']).toContain('query');
    expect(schema['properties']['query']).toMatchObject({
      type: 'array',
      minItems: 1,
    });
  });

  it('should reflect field enum values', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    const fieldProp = schema['properties']['query']['items']['properties']['field'];
    expect(fieldProp['enum']).toContain('title');
    expect(fieldProp['enum']).toContain('abstract');
    expect(fieldProp['enum']).toContain('title_abstract');
    expect(fieldProp['enum']).toContain('author');
    expect(fieldProp['enum']).toContain('keyword');
    expect(fieldProp['enum']).toContain('all');
  });

  it('should reflect operator enum values', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    const operatorProp = schema['properties']['query']['items']['properties']['operator'];
    expect(operatorProp['enum']).toEqual(['AND', 'OR']);
  });

  it('should include description as optional', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('description');
    expect(schema['properties']['description']).toMatchObject({
      type: 'string',
    });
  });

  it('should include filters as optional', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('filters');
    expect(schema['properties']['filters']).toBeDefined();
  });

  it('should include overrides as optional', () => {
    const schema = generateQueryJSONSchema() as JSONSchema;
    expect(schema['required']).not.toContain('overrides');
    expect(schema['properties']['overrides']).toBeDefined();
  });
});
