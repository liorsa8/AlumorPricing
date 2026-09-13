// Dexie needs a real IndexedDB implementation; this polyfills the browser API in Node so
// web/src/db/* can be exercised directly in tests.
import 'fake-indexeddb/auto';
