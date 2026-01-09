# Task: Reference Manager Integration

## Purpose

Integrate with [reference-manager](https://github.com/ncukondo/reference-manager) CLI to register search results as references. This enables systematic literature search workflows where results can be directly added to a citation management library.

## Related Specs

- [spec/integration/reference-manager.md](../integration/reference-manager.md) - Full integration specification
- [spec/cli/commands.md](../cli/commands.md) - CLI command definitions (register command)
- [spec/models/config.md](../models/config.md) - Configuration schema

## Related Source Files

- `src/integration/types.ts` - Registration record types
- `src/integration/types.test.ts`
- `src/integration/ref-cli.ts` - ref CLI wrapper
- `src/integration/ref-cli.test.ts`
- `src/integration/register.ts` - Registration logic
- `src/integration/register.test.ts`
- `src/cli/commands/register.ts` - CLI command
- `src/cli/commands/register.test.ts`

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

---

### Step 1: Define Registration Record Types

- [x] Write test: `src/integration/types.test.ts`
  - Test RegistrationRecord schema validation with zod
  - Test RefAddOutput schema (JSON output from `ref add -o json`)
- [x] Create stub: `src/integration/types.ts`
- [x] Verify test fails (Red)
- [x] Implement types and zod schemas
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Types exported and validated with zod

```typescript
// Key types to define:
interface RegistrationRecord {
  sessionId: string;
  timestamp: string;
  summary: { total: number; added: number; skipped: number; failed: number; noId: number; };
  added: Array<{ source: string; id: string; title: string; }>;
  duplicates: Array<{ source: string; existingId: string; duplicateType: string; }>;
  failed: Array<{ source: string; reason: string; error?: string; }>;
}

// Schema for ref add -o json output
interface RefAddOutput {
  summary: { total: number; added: number; skipped: number; failed: number; };
  added: Array<{ source: string; id: string; title: string; }>;
  skipped: Array<{ source: string; existingId: string; duplicateType: string; }>;
  failed: Array<{ source: string; reason: string; error?: string; }>;
}
```

---

### Step 2: Implement ref CLI Wrapper

- [x] Write test: `src/integration/ref-cli.test.ts`
  - Test `checkRefAvailable()` - detects if ref command exists
  - Test `checkNpmAvailable()` - detects if npm command exists
  - Test `installRefManager()` - executes `npm i -g @ncukondo/reference-manager`
  - Test `refAdd(id, options)` - executes ref add with JSON output
  - Test `refUpdate(id, field, value)` - executes ref update
  - Test `refExport(id)` - executes ref export
  - Test error handling (command not found, execution error)
  - Mock child_process.exec for unit tests
- [x] Create stub: `src/integration/ref-cli.ts`
- [x] Verify test fails (Red)
- [x] Implement ref CLI wrapper
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Can execute ref commands and parse JSON output

```typescript
// Key functions:
async function checkRefAvailable(): Promise<boolean>
async function checkNpmAvailable(): Promise<boolean>
async function installRefManager(): Promise<void>  // npm i -g @ncukondo/reference-manager
async function refAdd(id: string, options?: { env?: NodeJS.ProcessEnv }): Promise<RefAddOutput>
async function refUpdate(id: string, field: string, value: string, options?: { env?: NodeJS.ProcessEnv }): Promise<void>
async function refExport(id: string, options?: { env?: NodeJS.ProcessEnv }): Promise<unknown>
```

---

### Step 3: Implement Registration Logic

- [x] Write test: `src/integration/register.test.ts`
  - Test ID selection (PMID preferred over DOI)
  - Test articles without identifiers (noId count)
  - Test aggregation of results from multiple ref add calls
  - Test duplicate handling
  - Test failure handling
  - Test session-specific library path (REFERENCE_MANAGER_LIBRARY env)
  - Mock ref-cli functions for unit tests
- [x] Create stub: `src/integration/register.ts`
- [x] Verify test fails (Red)
- [x] Implement registration logic
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Can register articles and aggregate results

```typescript
// Key function:
async function registerArticles(
  articles: Article[],
  options: {
    sessionDir: string;
    withAbstracts?: boolean;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<RegistrationRecord>
```

---

### Step 4: Implement Abstract Update

- [x] Write test: `src/integration/register.test.ts` (add to existing)
  - Test withAbstracts option triggers ref update
  - Test abstract escaping (special characters)
  - Test skips update if article has no abstract
  - Test skips update if ref entry already has abstract
- [x] Implement abstract update in register.ts
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Abstracts are updated when option is enabled

---

### Step 5: Implement Registration Record Storage

- [x] Write test: `src/integration/register.test.ts` (add to existing)
  - Test `saveRegistrationRecord()` saves to session directory
  - Test `loadRegistrationRecord()` loads from session directory
  - Test file path: `{sessionDir}/registration.json`
- [x] Implement record storage functions
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Registration records are persisted

---

### Step 6: Implement register CLI Command

- [x] Write test: `src/cli/commands/register.test.ts`
  - Test command parses session-id argument
  - Test --db option filters databases
  - Test --dry-run shows what would be registered
  - Test --with-abstracts option
  - Test error when ref not available:
    - Prompt user to install via npm
    - If user confirms, run `npm i -g @ncukondo/reference-manager`
    - If npm not available, prompt to install Node.js
  - Test error when session not found
  - Test output formatting (summary, duplicates list, etc.)
- [x] Create stub: `src/cli/commands/register.ts`
- [x] Verify test fails (Red)
- [x] Implement register command
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: `search-hub register <session-id>` works

#### ref Not Found Flow

```
$ search-hub register 20240115_diabetes-ai_a3f2c1

Error: reference-manager (ref) command not found.

reference-manager is required to register search results.
Would you like to install it now? (npm i -g @ncukondo/reference-manager) [Y/n]: y

Installing reference-manager...
✓ reference-manager installed successfully.

Registering 100 references...
```

#### npm Not Found Flow

```
$ search-hub register 20240115_diabetes-ai_a3f2c1

Error: reference-manager (ref) command not found.

reference-manager is required to register search results.
Would you like to install it now? (npm i -g @ncukondo/reference-manager) [Y/n]: y

Error: npm command not found.
Please install Node.js first: https://nodejs.org/
```

---

### Step 7: Add Configuration Support

- [ ] Write test: `src/config/schema.test.ts` (add to existing)
  - Test integration.reference_manager config section
  - Test enabled, command, auto_register options
- [ ] Update config schema in `src/config/schema.ts`
- [ ] Update defaults in `src/config/defaults.ts`
- [ ] Verify test passes (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Refactor if needed
- [ ] Verify test still passes
- [ ] Acceptance: Config supports reference_manager settings

```toml
[integration.reference_manager]
enabled = true
command = "ref"
auto_register = false
```

---

### Step 8: Integrate into CLI

- [x] Write test: `src/cli/index.test.ts` (add to existing)
  - Test register command is registered
- [x] Add register command to CLI in `src/cli/index.ts`
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Verify all tests pass
- [x] Acceptance: `search-hub register --help` shows usage

---

### Step 9: Progress Display

- [x] Write test: `src/cli/commands/register.test.ts` (add to existing)
  - Test progress callback updates display
  - Test final summary output format
- [x] Implement progress display using existing progress utilities
- [x] Verify test passes (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Refactor if needed
- [x] Verify test still passes
- [x] Acceptance: Progress bar shows during registration

---

### Step 10: End-to-End Integration Tests (CRITICAL)

**This step is MANDATORY before completion.** Unit tests with mocks often pass while real usage fails. Minimize mocks and test real user flows.

- [x] Write test: `src/integration/register.e2e.test.ts`
  - **Real CLI execution** - Execute `search-hub register` as subprocess
  - **Real session data** - Create actual session directory with results
  - **Real ref execution** - Execute actual ref commands (skip if ref not installed)
  - **Real file I/O** - Verify registration.json is created correctly

#### E2E Test Scenarios

```typescript
describe('register command e2e', () => {
  let tempDir: string;
  let sessionId: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'search-hub-test-'));
    sessionId = '20240115_test-session_abc123';
    await createTestSession(tempDir, sessionId, [
      { pmid: '12345678', title: 'Test Article 1', abstract: 'Abstract 1' },
      { doi: '10.1234/test', title: 'Test Article 2' },
      { pmid: '87654321', doi: '10.5678/test', title: 'Test Article 3' },
      { title: 'Article without IDs' },
    ]);
  });

  it('should register articles with real file I/O', async () => {
    const result = await execAsync(
      `npx search-hub register ${sessionId} --session-dir ${tempDir}`
    );
    const recordPath = path.join(tempDir, sessionId, 'registration.json');
    expect(await fs.pathExists(recordPath)).toBe(true);
    const record = JSON.parse(await fs.readFile(recordPath, 'utf-8'));
    expect(record.summary.total).toBe(4);
    expect(record.summary.noId).toBe(1);
  });

  it('should handle --dry-run without executing ref commands', async () => {
    const result = await execAsync(
      `npx search-hub register ${sessionId} --session-dir ${tempDir} --dry-run`
    );
    expect(result.stdout).toContain('Would register 3 references');
    const recordPath = path.join(tempDir, sessionId, 'registration.json');
    expect(await fs.pathExists(recordPath)).toBe(false);
  });
});

// Test with real ref command (skip if not installed)
describe('register with real ref command', () => {
  const refAvailable = await checkRefAvailable();

  (refAvailable ? it : it.skip)('should register to real reference-manager', async () => {
    const libraryPath = path.join(tempDir, 'test-library.json');
    const result = await execAsync(
      `npx search-hub register ${sessionId} --session-dir ${tempDir}`,
      { env: { ...process.env, REFERENCE_MANAGER_LIBRARY: libraryPath } }
    );
    expect(result.stdout).toContain('added');
    expect(await fs.pathExists(libraryPath)).toBe(true);
  });
});
```

- [x] Verify all e2e tests pass
- [x] Run full test suite: `npm test`
- [ ] **Manual verification**: Run `search-hub register` with real session
- [x] Acceptance: All tests pass, feature works in real usage

## TDD Cycle Reference

```
┌─────────────────────────────────────────────────────┐
│  1. Write Test (Red)                                │
│     - Write test that describes expected behavior   │
│     - Run test → should FAIL                        │
├─────────────────────────────────────────────────────┤
│  2. Implement (Green)                               │
│     - Write minimal code to pass test               │
│     - Run test → should PASS                        │
├─────────────────────────────────────────────────────┤
│  3. Refactor                                        │
│     - npm run lint                                  │
│     - npm run typecheck                             │
│     - Clean up code if needed                       │
│     - Run test → should still PASS                  │
└─────────────────────────────────────────────────────┘
```

## Notes

- Test files are co-located with source files (`*.test.ts` next to `*.ts`)
- Use zod for runtime validation of ref command JSON output (format may change between versions)
- PMID is preferred over DOI for better metadata quality from PubMed
- Session-specific library (`REFERENCE_MANAGER_LIBRARY` env) ensures accurate duplicate detection
- Error handling: log warnings for individual failures, continue with remaining articles
- When ref command is not found, offer to install via npm (`npm i -g @ncukondo/reference-manager`)
- When npm is not available, prompt user to install Node.js from https://nodejs.org/
