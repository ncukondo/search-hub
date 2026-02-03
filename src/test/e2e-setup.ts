/**
 * E2E test setup - runs before all e2e tests
 *
 * Verifies that the build exists before running e2e tests.
 * E2E tests execute the compiled CLI binary, so a fresh build is required.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';

const distPath = resolve(__dirname, '../../dist/cli/index.js');

if (!existsSync(distPath)) {
  const message = `
============================================================
ERROR: Build not found!
============================================================

E2E tests require a compiled build.
Run the following command first:

  npm run build

============================================================
`;
  throw new Error(message);
}
