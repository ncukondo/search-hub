# Task: Session Manager

## Purpose

Manage search sessions including creation, persistence, loading, and resume functionality. Sessions enable tracking search progress, resuming interrupted searches, and providing audit trails for PRISMA reporting.

## Related Specs

- [spec/models/session.md](../models/session.md) - Session specification and file formats
- [spec/architecture.md](../architecture.md) - Session layer architecture

## Related Source Files

- `src/session/types.ts` - Session type definitions
- `src/session/manager.ts` - Session CRUD operations
- `src/session/logger.ts` - Event logging
- `src/session/index.ts` - Module exports
- `src/session/*.test.ts` (co-located tests)

## Implementation Steps

### Step 1: Define Session Types

- [x] Write test: `src/session/types.test.ts`
  - Test that types compile correctly with valid data
  - Test TypeScript type inference
- [x] Create types: `src/session/types.ts`
  - Define `SessionStatus` type
  - Define `DatabaseStatus` interface
  - Define `SessionFile` interface
  - Define `LogEvent` types
  - Define `PaginationState` interface
- [x] Verify types work with test data
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: All types match spec/models/session.md

### Step 2: Implement Session ID Generation

- [x] Write test: `src/session/manager.test.ts`
  - Test ID format: `{date}_{name}_{hash}`
  - Test name sanitization (lowercase, alphanumeric, dashes)
  - Test hash is 6 characters
  - Test unique IDs for different queries
- [x] Create stub: `src/session/manager.ts`
- [x] Verify tests fail (Red)
- [x] Implement:
  - `generateSessionId(queryName: string, queryHash: string): string`
  - `sanitizeName(name: string): string`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: IDs match format like `20240115_diabetes-ai-scoping_a3f2c1`

### Step 3: Implement Session Creation

- [x] Write test: `src/session/manager.test.ts` (additional tests)
  - Test creates session directory
  - Test creates session.json with correct initial state
  - Test copies query file to session directory
  - Test initializes database statuses as 'pending'
- [x] Verify tests fail (Red)
- [x] Implement:
  - `createSession(options: CreateSessionOptions): Promise<Session>`
  - Create `~/.search-hub/sessions/{session-id}/` directory
  - Create `session.json` with initial state
  - Copy query file as `query_common.yaml`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: New session directory matches spec structure

### Step 4: Implement Session Loading

- [x] Write test: `src/session/manager.test.ts` (additional tests)
  - Test loads existing session by ID
  - Test throws on non-existent session
  - Test validates session schema on load
  - Test lists all sessions
- [x] Verify tests fail (Red)
- [x] Implement:
  - `loadSession(sessionId: string): Promise<Session>`
  - `listSessions(): Promise<SessionSummary[]>`
  - `sessionExists(sessionId: string): Promise<boolean>`
- [x] Verify tests pass (Green)
- [x] Run `npm run lint && npm run typecheck`
- [x] Acceptance: Can load and list sessions correctly

### Step 5: Implement Session Updates

- [ ] Write test: `src/session/manager.test.ts` (additional tests)
  - Test updates database status
  - Test updates pagination state
  - Test updates summary totals
  - Test handles concurrent updates safely
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `updateDatabaseStatus(sessionId: string, provider: string, status: DatabaseStatus): Promise<void>`
  - `updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void>`
  - `saveSession(session: Session): Promise<void>`
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Session state persists correctly across updates

### Step 6: Implement Event Logger

- [ ] Write test: `src/session/logger.test.ts`
  - Test logs events to log.jsonl
  - Test each event type logs correctly
  - Test timestamps are ISO 8601
  - Test appends to existing log
- [ ] Create stub: `src/session/logger.ts`
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `SessionLogger` class
  - `log(event: LogEvent): Promise<void>`
  - Support all event types from spec
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Log file matches format in session.md

### Step 7: Implement Resume Logic

- [ ] Write test: `src/session/manager.test.ts` (additional tests)
  - Test finds DBs needing resume
  - Test identifies retryable failed DBs
  - Test identifies in-progress DBs with pagination state
  - Test skips completed DBs
- [ ] Verify tests fail (Red)
- [ ] Implement:
  - `getResumableProviders(session: Session): ResumableProvider[]`
  - Return provider name, resume strategy, and cursor if available
- [ ] Verify tests pass (Green)
- [ ] Run `npm run lint && npm run typecheck`
- [ ] Acceptance: Resume logic handles all states from lifecycle diagram

### Step 8: Create Module Index & Integration

- [ ] Write test: `src/session/index.test.ts`
  - Test exports are correct
  - Test end-to-end: create -> update -> load
- [ ] Create `src/session/index.ts`
  - Export types
  - Export SessionManager class/functions
  - Export SessionLogger
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

- Session directory is under `~/.search-hub/sessions/`
- Use config system to get data directory path
- Results files use JSON Lines format (append-only, streamable)
- Test with mock file system or temp directories
- Session manager depends on Config System (Task 2)
