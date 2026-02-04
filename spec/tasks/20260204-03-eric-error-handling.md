# Task: Improve ERIC API Error Handling

## Purpose

ERIC API sometimes returns unexpected responses, causing cryptic errors like:
```
Cannot destructure property 'numFound' of 'response.response' as it is undefined
```

This task improves error handling to provide clear, actionable error messages when the ERIC API returns unexpected responses.

## Related Specs

- [spec/providers/eric.md](../providers/eric.md) - ERIC provider specification
- [spec/providers/_interface.md](../providers/_interface.md) - Provider interface

## Related Source Files

- `src/providers/eric/provider.ts` - ERIC provider implementation
- `src/providers/eric/client.ts` - ERIC API client
- `src/providers/eric/provider.test.ts` - Unit tests
- `src/providers/eric/eric.e2e.test.ts` - E2E tests

## Implementation Steps

### Step 1: Add defensive response validation in ERIC client

- [x] Step 1: Validate API response structure before accessing properties
  - [x] Write test: `src/providers/eric/client.test.ts` - test with malformed responses
  - [x] Create stub: Add validation function
  - [x] Verify test fails (Red)
  - [x] Implement: Add response validation with clear error messages
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Malformed responses throw descriptive errors

Test cases:
- [x] Response is null/undefined
- [x] Response.response is missing
- [x] Response.response.numFound is missing
- [x] Response.response.docs is not an array

### Step 2: Improve error messages for common failure modes

- [x] Step 2: Provide actionable error messages
  - [x] Write test: Verify error messages include troubleshooting hints
  - [x] Implement: Add context to error messages (e.g., "ERIC API returned unexpected format")
  - [x] Verify test passes (Green)
  - [x] Run `npm run lint && npm run typecheck`
  - [x] Acceptance: Errors include what happened and potential causes

Expected error format:
```
ERIC API error: Unexpected response format (missing 'numFound').
This may indicate an API change or service issue.
Response received: { ... truncated ... }
```

### Step 3: Handle network and timeout errors gracefully

- [ ] Step 3: Wrap network errors with ERIC-specific context
  - [ ] Write test: `src/providers/eric/provider.test.ts` - test network error handling
  - [ ] Implement: Catch and wrap network errors
  - [ ] Verify test passes (Green)
  - [ ] Run `npm run lint && npm run typecheck`
  - [ ] Acceptance: Network errors show ERIC-specific context

### Final Step: E2E Integration Tests

- [ ] Write E2E test: `src/providers/eric/eric.e2e.test.ts`
  - Test error handling with mocked malformed responses
  - Verify error messages are user-friendly
- [ ] Verify all E2E tests pass
- [ ] Run full test suite: `npm test`
- [ ] Manual verification: Test with intentionally broken queries
- [ ] Acceptance: All error scenarios produce clear, actionable messages

## Notes

- Be careful not to leak sensitive information in error messages
- Truncate large response bodies in error messages
- Consider logging full response at debug level for troubleshooting
