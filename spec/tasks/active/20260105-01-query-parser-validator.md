# Task: Query Parser & Validator

## Purpose

Parse YAML query files into Query AST and validate against the query DSL schema. This enables the common query format to be translated into database-specific syntaxes.

## Related Specs

- [spec/models/query-dsl.md](../models/query-dsl.md) - Query DSL specification and AST structure
- [spec/architecture.md](../architecture.md) - Query layer architecture

## Related Source Files

- `src/query/types.ts` - Query AST type definitions
- `src/query/parser.ts` - YAML to AST parser
- `src/query/validator.ts` - Schema validation
- `src/query/index.ts` - Module exports
- `src/query/*.test.ts` (co-located tests)

## Implementation Steps

### Step 1: Define Query AST Types

- [x] Write test: `src/query/types.test.ts`
  - Test that types compile correctly with valid data
  - Test TypeScript type inference
- [x] Create types: `src/query/types.ts`
  - Define `FieldType` enum/union
  - Define `TermBlock` interface
  - Define `QueryBlock` interface
  - Define `Filters` interface
  - Define `OverrideBlock` interface
  - Define `QueryAST` interface
- [x] Verify types work with test data
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All types match spec/models/query-dsl.md

### Step 2: Create Query Schema with Zod

- [ ] Write test: `src/query/validator.test.ts`
  - Test valid query passes validation
  - Test missing required fields fails
  - Test invalid field types fails
  - Test invalid operators fails
  - Test optional fields work correctly
- [ ] Create stub: `src/query/validator.ts` (empty schema)
- [ ] Verify tests fail (Red)
- [ ] Implement Zod schemas:
  - `fieldTypeSchema`
  - `termBlockSchema`
  - `queryBlockSchema`
  - `filtersSchema`
  - `overrideBlockSchema`
  - `queryFileSchema`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Schema validates all examples from query-dsl.md

### Step 3: Implement YAML Parser

- [ ] Write test: `src/query/parser.test.ts`
  - Test parsing simple query YAML
  - Test parsing complex query with all fields
  - Test parsing query with filters
  - Test parsing query with overrides
  - Test parse error handling (invalid YAML)
  - Test parse error handling (missing required fields)
- [ ] Create stub: `src/query/parser.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement parser:
  - `parseQueryFile(filePath: string): Promise<QueryAST>`
  - `parseQueryString(yaml: string): QueryAST`
  - Use `yaml` package for YAML parsing
  - Validate parsed data against schema
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Acceptance: Parser handles all examples from query-dsl.md

### Step 4: Add Validation Error Messages

- [ ] Write test: `src/query/validator.test.ts` (additional tests)
  - Test error messages are descriptive
  - Test error paths are included
  - Test multiple errors are reported
- [ ] Verify tests fail (Red)
- [ ] Implement custom error formatting:
  - `ValidationError` class with path and message
  - `formatValidationErrors(errors: z.ZodError): ValidationError[]`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Error messages help users fix their query files

### Step 5: Create Module Index & Integration

- [ ] Write test: `src/query/index.test.ts`
  - Test exports are correct
  - Test end-to-end: file path -> validated AST
- [ ] Create `src/query/index.ts`
  - Export types
  - Export parser functions
  - Export validator functions
- [ ] Verify tests pass
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Module can be imported and used from other modules

## TDD Cycle Reference

```
+-----------------------------------------------------+
|  1. Write Test (Red)                                |
|     - Write test that describes expected behavior   |
|     - Run test -> should FAIL                       |
+-----------------------------------------------------+
|  2. Implement (Green)                               |
|     - Write minimal code to pass test               |
|     - Run test -> should PASS                       |
+-----------------------------------------------------+
|  3. Refactor                                        |
|     - npm run lint                                  |
|     - npm run typecheck                             |
|     - Clean up code if needed                       |
|     - Run test -> should still PASS                 |
+-----------------------------------------------------+
```

## Notes

- Use `yaml` package for YAML parsing
- Use `zod` for schema validation (already in project for config)
- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- Query translation to DB-specific syntax is handled by providers (not this task)
