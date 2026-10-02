# Running locally for manual QA

## Safer path (isolated, local emulator — good for testing edge cases like the fork/delete fixes)

Since `VITE_USE_FIREBASE_EMULATOR` is currently blank in `web/.env` (so it defaults to the real project), to test against the emulator instead:

1. Start the emulators (separate terminal, leave it running):

   ```
   npm run emulators
   ```

   This also opens an Emulator UI at `http://localhost:4000` where you can browse/edit Firestore documents directly and see exactly what each action writes.

2. Point the dev server at the emulator — edit `web/.env` and set:

   ```
   VITE_USE_FIREBASE_EMULATOR=true
   ```

3. Run the dev server:

   ```
   npm run dev
   ```

4. Sign in — clicking "sign in with Google" against the emulator shows a fake account picker (not real Google), so you can create a throwaway test user instantly with no real credentials.

5. Seed the catalog (otherwise the emulator's global catalog is empty and dropdowns will be blank):

   ```
   cd scripts/firebase-admin
   node seedCatalog.js --emulator
   ```

6. Make your test user an admin (needed to test global-catalog editing, not just per-business overrides):

   ```
   node setAdminClaim.js <the-fake-email-you-signed-in-with> --emulator
   ```

   You'll need to sign out/in once afterward for the new claim to take effect.
