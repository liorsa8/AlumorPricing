import { QueryClient, hashKey, QueryKey } from '@tanstack/react-query';

// Every screen's first Firestore round trip can take seconds on a phone. This keeps the last
// successful result of every query on the device (localStorage, per user) and puts it back into
// the React Query cache at sign-in, marked stale: pages render it instantly and the normal
// refetch replaces it. It holds nothing Firestore's own offline cache doesn't already store on
// the device, and it is removed on sign-out.
const storageKey = (uid: string) => `alumor:query-cache:${uid}`;
const MAX_BYTES = 3_000_000; // localStorage is ~5MB per origin; skip persisting rather than fail
const SAVE_DELAY_MS = 500;

type Entries = Record<string, { queryKey: QueryKey; data: unknown }>;

let activeUid: string | null = null;
let entries: Entries = {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function readEntries(uid: string): Entries {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? (JSON.parse(raw) as Entries) : {};
  } catch {
    return {};
  }
}

function save() {
  saveTimer = undefined;
  if (!activeUid) return;
  try {
    const json = JSON.stringify(entries);
    if (json.length <= MAX_BYTES) localStorage.setItem(storageKey(activeUid), json);
  } catch {
    // storage blocked/full: just lose the speed-up
  }
}

// Put `uid`'s remembered results into the query cache (stale, so they still refetch) and start
// remembering new ones for them. Pass null when nobody is signed in.
export function switchPersistedUser(queryClient: QueryClient, uid: string | null) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  activeUid = uid;
  entries = uid ? readEntries(uid) : {};
  for (const { queryKey, data } of Object.values(entries)) {
    queryClient.setQueryData(queryKey, data, { updatedAt: 0 });
  }
}

// Sign-out: forget this user's remembered results entirely.
export function forgetPersistedUser(uid: string) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (activeUid === uid) entries = {};
  try {
    localStorage.removeItem(storageKey(uid));
  } catch {
    // ignore
  }
}

export function startPersistingQueries(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    if (!activeUid || event.type !== 'updated' || event.action.type !== 'success') return;
    entries[hashKey(event.query.queryKey)] = { queryKey: event.query.queryKey, data: event.query.state.data };
    saveTimer ??= setTimeout(save, SAVE_DELAY_MS);
  });
}
