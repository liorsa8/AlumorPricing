import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // firestoreApi.test.ts and firestoreApi.catalog.test.ts both wipe the ENTIRE emulator
    // database in beforeEach — running test files in parallel workers (Vitest's default) would
    // let one file's wipe nuke the other's in-progress test data. Both share one Firestore
    // emulator instance with no per-file isolation, so files must run sequentially.
    fileParallelism: false,
  },
});
