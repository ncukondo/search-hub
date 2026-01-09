# Task: [Feature Name]

## Purpose

Why this task is needed and what problem it solves.

## Related Specs

- [spec/xxx.md](../xxx.md) - relevant section
- [spec/models/yyy.md](../models/yyy.md) - if schema changes needed

## Related Source Files

- `src/xxx/feature.ts`
- `src/xxx/feature.test.ts` (co-located)

## Implementation Steps

Each step follows the TDD cycle:

1. **Red**: Write failing test
2. **Green**: Write minimal implementation to pass
3. **Refactor**: Clean up, pass lint/typecheck, verify tests still pass

### Step Format

- [ ] Step N: Description
  - [ ] Write test: `src/xxx/feature.test.ts`
  - [ ] Create stub: `src/xxx/feature.ts` (empty implementation)
  - [ ] Verify test fails (Red)
  - [ ] Implement feature
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Refactor if needed
  - [ ] Verify test still passes
  - [ ] Acceptance: (specific criteria)

### Final Step: E2E Integration Tests (MANDATORY)

**This step is required before marking the task complete.** Unit tests with mocks often pass while real usage fails.

- [ ] Write E2E test: `src/xxx/feature.e2e.test.ts`
  - **Minimize mocks** - Only mock external services when absolutely necessary
  - **Follow user flows** - Test the same paths users will take
  - **Use real file I/O** - Test actual file operations with temp directories
  - **Execute real commands** - Test actual CLI execution where possible
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] **Manual verification**: Test the feature manually as a user would
- [ ] Acceptance: All tests pass, feature works in real usage

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
- **E2E integration tests are critical** - Mock-based unit tests often miss real-world issues
- Always complete the Final Step (E2E tests) before marking the task complete
- Any additional context or considerations
