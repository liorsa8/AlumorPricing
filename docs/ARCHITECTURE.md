# AlumorPricing — Architecture

A price-quoting tool for aluminum/PVC window & door fabrication shops. Hebrew, right-to-left, multi-business — a catalog-driven quote builder with a printable/shareable output, backed by Firebase (Auth + Firestore).

## Tech stack

- **Frontend** — React + TypeScript + Vite, [TanStack Query](https://tanstack.com/query) for data access, React Router (`HashRouter`). No UI framework — plain CSS with RTL-aware logical properties.
- **Backend** — [Firebase](https://firebase.google.com/): Google sign-in via Firebase Auth, all data in Firestore, access control enforced by `firestore.rules`. There is no custom server — the built app is still static files (deployable anywhere), talking to Firebase directly from the browser.
- No ORM beyond the Firestore SDK's own document API.

## Why this shape

The app deliberately has **no CAD/geometry engine**. Material cost is a single ₪/מ"ר base price per opening type (`price_per_sqm`, set directly against real aluminum-pricing sites the shop owner can look up — e.g. "קליל 7000 ≈ 900-1,500 ₪/מ"ר") plus an optional glass surcharge, rather than a real cut-list; hardware (hinges, locks, gaskets...) comes from a default kit per opening type. An earlier version derived material cost from two per-opening-type calibration factors (meters of profile per m², fraction glass) — abandoned after a mistyped factor turned a 1×1m window into a ~756,000 ₪ line in production; nobody could eyeball whether those factors were reasonable the way they can a ₪/מ"ר figure.

The app also deliberately avoids running its own server. An earlier version kept all data in the browser's own IndexedDB (via Dexie) with **no backend at all** — free to host, but each device had its own independent, unsynced copy of the data, and there was no way for more than one person (or business) to share the same catalog or customer list. Moving to Firebase Auth + Firestore keeps the "no server to run or maintain" property (Firebase is a managed backend) while adding real multi-device sync, multi-business support (one Google account can own several businesses, each with its own customers/quotes/catalog), and a shared, admin-maintained global catalog that every business's own catalog is layered on top of. The trade-off, accepted deliberately: the app now requires a network connection and a Google sign-in — see "Import / export" below for the offline safety-copy story that replaces the old per-device independence.

The app also deliberately avoids client-side PDF generation for the printed quote. JS PDF libraries (jsPDF etc.) re-typeset text through their own font/shaping engine and handle Hebrew RTL/bidi poorly. Instead, `ProjectPrintPage` is a normal HTML page styled with a dedicated print stylesheet (`web/src/styles/print.css`), and the user prints or "saves as PDF" through the browser's own native print pipeline, which renders Hebrew correctly for free.

## Project structure

```
web/
  src/
    auth/
      AuthProvider.tsx              — Google sign-in via Firebase Auth; exposes user/loading/
                                       isAdmin (a custom auth claim) and signInWithGoogle/signOut
      RequireAuth.tsx               — route guard; redirects to /login when signed out
    db/
      firebaseConfig.ts             — initializeApp/getAuth/initializeFirestore; connects to the
                                       local emulator instead of the real project when
                                       VITE_USE_FIREBASE_EMULATOR=true
      firestoreApi.ts               — the pricing/CRUD logic itself: a tiny in-browser router
                                       (mirrors what used to be Express routes, then Dexie calls)
                                       that reads/writes Firestore and runs the pricing engine
      catalogMerge.ts               — merges the global catalog with a business's own overrides
                                       (see "Data model" below)
    data/
      seedData.ts, companyLogo.ts   — placeholder catalog + default company letterhead, used
                                       only when creating a brand-new business
    lib/
      quoteCalculator.ts            — pure pricing functions (no DB imports), see "Pricing" below
      dataBackup.ts                 — export/import one business's data as a JSON file
      catalogExport.ts              — export just a business's merged catalog view
      useCatalogAdminMode.ts        — shared admin/business catalog-endpoint toggle (see below)
    api/client.ts, api/types.ts     — api.get/post/put/delete(url) surface every page calls;
                                       underneath, it calls straight into db/firestoreApi.ts
                                       instead of doing an HTTP fetch (kept identical on
                                       purpose, so no page component needed to change)
    components/
      AppShell.tsx                  — nav shell (RTL sidebar)
      CatalogCrudPage.tsx           — generic list/create/edit/deactivate/delete UI, configured
                                       per catalog kind; also renders the admin global/business
                                       toggle and fork/revert affordances
    pages/
      LoginPage.tsx                 — Google sign-in button
      BusinessListPage.tsx          — pick or create a business (route: `/`)
      ProjectsListPage.tsx, ProjectDetailPage.tsx (quote builder), ProjectPrintPage.tsx
      CustomersPage.tsx, SettingsPage.tsx (also: backup export/import, catalog export, About)
      catalog/{ProfileSystemsPage,GlassTypesPage,AccessoriesPage}.tsx  — thin configs over
                                       CatalogCrudPage
      catalog/OpeningTypesPage.tsx — not generic: has its own price/has_glass fields + accessory-kit editor
    styles/{global.css,print.css}
  public/manifest.json, sw.js       — PWA install + offline app-shell caching
scripts/firebase-admin/             — Node scripts using the Admin SDK, run by a human from a
                                       terminal, never by the app itself; see "Admin scripts" below
firestore.rules                     — the actual multi-tenant access control (see "Security" below)
firestore.indexes.json              — composite indexes the app's Firestore queries need
docs/ARCHITECTURE.md                — this file
```

## Data model

Firestore, read/written through `web/src/db/firestoreApi.ts`. Every business-scoped document also carries an `owner_uid` field, stamped at write time and re-checked by `firestore.rules` on every read/write.

**Businesses** — `businesses/{businessId}`: one document per business a user owns. Holds what used to be the single `settings` row: `labor_pct`, `installation_pct`, `vat_pct`, `company_name/phone/address/email/tax_id/logo`, `standard_terms`, plus `next_quote_number` and `owner_uid`.

- `businesses/{businessId}/customers/{id}`
- `businesses/{businessId}/projects/{id}` — a quote: `quote_number` (auto-incrementing per business), `status` (`draft → sent/accepted/rejected/archived`), `customer_id`, `discount_pct`, computed totals (`material_subtotal`, `labor_amount`, `installation_amount`, `discount_amount`, `pre_vat_total`, `vat_amount`, `total`) plus `*_pct_snapshot` fields, and an embedded `openings` array (line items are never their own Firestore documents — see below). Each opening can carry its own `labor_pct_override`/`discount_pct_override` (`null` = use the quote's own, see "Pricing" below).

**Catalog — global + per-business overrides, merged at read time** (`web/src/db/catalogMerge.ts`):
- `catalog_profile_systems`, `catalog_glass_types`, `catalog_accessories`, `catalog_opening_types` — the shared, admin-maintained global catalog. Readable by any signed-in user, writable only by an admin (a custom Firebase Auth claim — see "Admin scripts" below).
- `businesses/{businessId}/profile_systems_overrides`, `glass_types_overrides`, `accessories_overrides`, `opening_types_overrides` — a business's own edits. Editing a global item creates a same-id override that shadows it ("forking"); a business can also add wholly its own items (an override with no matching global id). `mergeCatalog()` combines the two into one list per business, stamping each row with `forked_from_global` so the UI can offer "revert to default" only on rows that actually shadow a global item.
- `opening_types` carry their default accessory kit as embedded `{accessory_id, quantity}` refs (global or per-business, matching whichever catalog they belong to) — resolved against the live accessory catalog on every read, never frozen except inside a placed quote's own openings.

**Why so much snapshotting?** Once a quote is sent, its price must never silently drift because someone later edited the catalog or the business's settings. Every opening (and its accessory lines) freezes the catalog values it was priced with (`*_snapshot` fields: names, prices); every project freezes the percentages in effect. While a project's `status` is `draft`, `firestoreApi.ts` keeps re-deriving prices from the *live*, merged catalog/settings on every edit (so the shop owner sees current numbers while building); the moment status leaves `draft`, that stops and the frozen snapshot is what's shown from then on. This same freeze point is what blocks further opening edits — both `firestoreApi.ts` and `firestore.rules` independently reject changes to `openings`/`next_opening_id` once `status !== 'draft'` (the rules check is the actual enforcement; the app-side check exists only to produce a friendlier error).

Firestore has no foreign-key cascade — deleting a business does **not** cascade-delete its `customers`/`projects`/override subcollections, so every route that reads a parent document (e.g. a project's business) checks `exists()` before use rather than assuming the parent is still there.

## Security (`firestore.rules`)

The actual multi-tenant enforcement, independent of anything the app itself checks:
- Every business-scoped document's `owner_uid` gates read/update/delete with a flat equality check against `request.auth.uid` — no extra `get()` back to the parent business doc on every read, since the field is denormalized onto the document itself.
- `create`, unlike read/update/delete, **does** call `get()` on the parent `businesses/{businessId}` doc, to confirm the caller actually owns that business — the one check a flat `owner_uid` equality can never provide on its own, since the caller chooses what to write.
- `update` additionally pins `owner_uid` to its previous value, so an owner can't reassign one of their own documents to a different account.
- The four override collections and the four global catalog collections are each governed by one generic wildcard rule (`match /{overrideCollection}/{id}`, `match /{globalCatalogCollection}/{id}`) gated by a list-membership check, rather than a hand-copied block per collection — adding a new catalog kind means adding its name to one list, not writing a new rule block.
- The global catalog is writable only by an admin (`request.auth.token.admin == true`), a custom claim nothing client-side can ever set.
- Every Firestore **query** (not just single-document reads) under `businesses/{id}/...` must carry a matching `where('owner_uid', '==', uid)` clause — Firestore rejects a multi-document query outright unless it's provably restricted to documents the caller could read.

## Pricing (`web/src/lib/quoteCalculator.ts`)

Pure functions, no side effects, easy to unit-test in isolation:

`profile_system` is a pure display label (shown as "סדרה" on the printed quote) — it prices
nothing. `glass_type.price_per_sqm` applies over the opening's full area, as a surcharge on top
of the opening type's own base price; an opening type with no glass component at all (a net, a
shutter, a monoblock box — `has_glass: false`) skips picking a glass type and gets no surcharge.

```
area_sqm          = (width_mm/1000) × (height_mm/1000)
material_cost     = area_sqm × (opening_type.price_per_sqm + glass_type.price_per_sqm)
accessories_cost  = Σ (accessory.quantity × accessory.price_per_unit)
unit_subtotal     = material_cost + accessories_cost
line_subtotal     = unit_subtotal × quantity

# Per opening — its own labor%/discount% if it has an override, else the quote's own (an
# opening can override just its own labor% or discount%, e.g. a big job's labor cut on one
# item instead of discounting the whole quote — see ProjectDetailPage's item form):
line_labor_pct    = opening.labor_pct_override ?? project.labor_pct
line_discount_pct = opening.discount_pct_override ?? project.discount_pct
line_labor        = line_subtotal × line_labor_pct / 100
line_installation = line_subtotal × installation_pct / 100   (always project-wide, never overridden)
line_before_discount = line_subtotal + line_labor + line_installation
line_discount     = line_before_discount × line_discount_pct / 100

material_subtotal = Σ line_subtotal over all openings
labor_amount      = Σ line_labor
installation_amount = Σ line_installation
discount_amount   = Σ line_discount
pre_vat_total     = Σ (line_before_discount − line_discount)
vat_amount        = pre_vat_total × vat_pct / 100
total             = pre_vat_total + vat_amount
```

When no opening overrides labor%/discount%, this reduces to exactly the same totals as applying
one project-wide labor%/discount% to the material subtotal as a lump sum — `computeProjectTotals`
is a strict generalization, not a behavior change, for the common no-override case.

Rounding happens only at display time (`formatCurrency`), never mid-calculation, so the printed sum of line items always reconciles exactly with the totals below it.

**Two different views of a line item's price**, both intentional:
- The **quote builder** (`ProjectDetailPage`) shows the raw `unit_subtotal`/`line_subtotal` (material + accessories only) per line, with labor/installation/discount broken out as separate rows in the totals panel — useful for the shop owner building the quote.
- The **printed/shared quote** (`ProjectPrintPage`) shows only three totals (pre-VAT, VAT, grand total) and *inflates each line's displayed price* by `lineMarkupFactor` — `(1 + labor_pct/100 + installation_pct/100) × (1 − discount_pct/100)`, using that opening's own override if it has one — so that summing the visible line prices matches the visible pre-VAT total — a customer-facing document where the numbers must add up on their own, without a labor/installation breakdown to explain the gap.

## The Firestore "API" (`web/src/db/firestoreApi.ts`)

Every page still calls `api.get/post/put/delete(url)` exactly as it did when this was a real HTTP client, then a Dexie-backed one (`web/src/api/client.ts`). Underneath, that call is now dispatched to a small in-browser router that pattern-matches the same URL strings (e.g. `PUT /businesses/:businessId/projects/:projectId/openings/:id`) against handler functions that read/write Firestore and call into `quoteCalculator.ts` — the same responsibilities the old Express/Dexie routes had (validating input, resolving catalog references, computing and persisting the priced snapshot, recomputing project totals), just async over the network instead of synchronous in the tab. Errors are thrown as plain `Error(code)` with the same kind of string codes the app has always used (`not_found`, `name_required`, `customer_has_projects`, `invalid_dimensions`, `invalid_reference`, `project_not_draft`, `not_signed_in`), so existing UI error handling needed no changes either.

Multi-document writes that must stay consistent (adding/editing/deleting an opening, recalculating a project) go through `runTransaction`; catalog lookups inside those routes are deliberately **not** part of the transaction (a concurrent catalog edit isn't this transaction's concern) but every field merged from the *existing* document is re-read fresh inside the transaction itself, not from a snapshot taken before the transaction started — otherwise a concurrent edit to a different field of the same document could be silently overwritten once the transaction's write lands.

## Admin scripts (`scripts/firebase-admin/`)

Node scripts using the Firebase **Admin** SDK (not the web app's client SDK), run by hand from a terminal — never invoked by the app itself:
- `initAdmin.js` — shared bootstrap: talks either to the local emulators (`--emulator`) or a real project via a downloaded service-account key.
- `seedCatalog.js` — one-time: writes the real hand-tuned catalog (`data/catalog-seed.json`) into the global `catalog_*` collections.
- `setAdminClaim.js` — the *only* path in the whole system that can ever grant the `admin` custom claim `firestore.rules` checks to allow writing the global catalog.

For local development against the emulator, start it with `npm run emulators` (root `package.json`) rather than a bare `firebase emulators:start` — it passes `--project demo-alumor-pricing` explicitly, matching what these scripts and the test suite expect; `.firebaserc`'s own default project (`alumor-pricing`) is the **real** project, used only for actual `firebase deploy`.

## Frontend

RTL is applied once, at the root (`<html dir="rtl" lang="he">` in `web/index.html`), plus CSS logical properties (`margin-inline-start`, `text-align: start`) throughout instead of `left`/`right`. Currency renders via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.

`CatalogCrudPage.tsx` is a single generic component (fields, endpoint, labels passed as props) driving the three simple catalogs — `opening_types` is deliberately **not** built on it, since it has extra structure (a `has_glass` toggle, an embedded accessory-kit editor) that would strain a shared abstraction; its own plain fields still share `db/firestoreApi.ts`'s `buildFieldsFromBody` helper with the three generic catalogs, just via hand-written routes instead of the shared route-registration functions. Both it and `OpeningTypesPage.tsx` share `useCatalogAdminMode.ts` for the admin global/business toggle.

Data fetching is TanStack Query end to end — every page's data is a `useQuery`/`useMutation` pair against `web/src/api/client.ts`. `AuthProvider` clears the whole query cache on any change of signed-in user (not just this tab's own sign-out button — Firebase Auth syncs sign-out across every tab of the same browser), since query keys aren't scoped by uid and a second account on the same device would otherwise briefly see the first account's still-cached data.

## Sharing a quote

`ProjectDetailPage` has one "שתף" button, not one per app — `web/src/lib/shareQuote.ts`'s `shareQuoteImage` rasterizes an off-screen copy of the quote via `html2canvas` (at a fixed 800px width — see `print.css`'s `.share-capture-node` override, needed because a mobile-only CSS rule keyed off the real device viewport would otherwise wrongly apply to this fixed-width node too) and hands the resulting image to the native Web Share API, so the person picks WhatsApp/Gmail/anything else installed themselves. There's no way for a web page to attach a file directly into one specific app — `wa.me`/Gmail-compose links only ever carry text — a native share sheet is the only mechanism that can hand over an actual file at all. Where Web Share isn't supported (mainly desktop browsers), it falls back to downloading the image with an on-screen notice to attach it manually.

## Import / export (`web/src/lib/dataBackup.ts`)

`SettingsPage` has an "ייצוא גיבוי" / "ייבוא מקובץ גיבוי" pair, scoped to one business: export downloads that business's settings, customers, and quotes (with openings) plus its merged catalog view as one JSON file; import recreates customers and quotes (as new documents — Firestore assigns its own ids, so restored records don't reuse the original ones) into the *current* business, after an in-app confirmation. Catalog data is exported for reference but not restored, since it's re-derivable from the shared global catalog plus this business's own overrides. `catalogExport.ts` offers a separate, catalog-only export/import pair for moving just pricing data around without customers/quotes.

## Running / building

```bash
npm install
npm run dev        # Vite dev server, app at http://localhost:5173/AlumorPricing/
npm run build      # builds web/dist — a static site, deployable anywhere (no server needed)
npm run preview    # serves the production build locally, for a final check before deploying
npm run emulators  # local Firestore/Auth emulator, for dev/testing without touching real data
```

`web/.env` (copy from `web/.env.example`) needs a real Firebase project's web config to run against real data; see `firebaseConfig.ts`.

## Hosting (Firebase Hosting)

The app is deployed to Firebase Hosting, in the same project as Auth and Firestore (`.firebaserc` default: `alumor-pricing`; the `hosting` block in `firebase.json` serves `web/dist`). The URL is `https://alumor-pricing.web.app`. Firebase's own domains are pre-authorized for Google sign-in; a custom domain must be added under Authentication → Settings → Authorized domains.

Deploys are manual, from your own machine (the build reads `web/.env` locally):

```bash
firebase login             # once
npm run deploy:hosting     # builds web/dist, then firebase deploy --only hosting
```

For a throwaway test site from a branch, use a preview channel: `firebase hosting:channel:deploy <name>`.

Firebase serves the app from the domain root, GitHub Pages (`.github/workflows/deploy.yml`, unchanged) from `/AlumorPricing/`. So `web/vite.config.ts` keeps `base: '/AlumorPricing/'` as the default and only the Firebase build overrides it: `build:firebase` = `vite build --base=/`. Asset paths in components go through `import.meta.env.BASE_URL`, and `web/public/manifest.json` uses relative URLs so it works under either base. `web/src/main.tsx` uses React Router's `HashRouter`, so a deep-link refresh never needs a server-side rewrite.

Deploying updated `firestore.rules`/`firestore.indexes.json` is a separate step — run `firebase deploy --only firestore:rules,firestore:indexes` whenever those files change; `deploy:hosting` only publishes `web/dist`.

## Installing on a phone / offline use

`web/public/manifest.json` + `web/public/sw.js` make the built app installable (iOS "Add to Home Screen", Android Chrome's "Install app" — the latter needs the whole app served over HTTPS, which Firebase Hosting provides). `sw.js` caches the app shell as it's fetched ("cache-as-you-go"), so the app itself keeps loading offline — but every page still needs a live connection to Firebase to actually read or write data, unlike the old fully-offline Dexie version.

## Testing

```bash
npm test   # firebase emulators:exec ... vitest run
```

[Vitest](https://vitest.dev/), with the local Firebase emulator (`firebase.json`) standing in for real Firestore/Auth — `npm test` wraps `vitest run` in `firebase emulators:exec` so the suite always has a live, empty emulator instance to run against; `web/.env.test`'s `VITE_USE_FIREBASE_EMULATOR=true` is what actually points the client SDK there (the emulator env vars the CLI sets, unlike with the Admin SDK, aren't picked up automatically). Most component/page tests (`pages/`, `components/`, `auth/`) mock `api/client` entirely and never touch the emulator; only `db/firestoreApi*.test.ts` (business/auth-scoped CRUD and access-control behavior, merged-catalog fork/revert, per-item labor/discount overrides, including the empty-draft cleanup's grace period — it once deleted a quote out from under someone still actively building it, before the age check existed) need it live. `lib/quoteCalculator.test.ts` pins the pricing math against hand-verified numbers; `styles/*.test.ts` are CSS "tripwire" tests (jsdom can't lay anything out, so they read the stylesheet as text) pinning down specific past regressions rather than asserting real layout.

## Versioning

`web/vite.config.ts` reads `web/package.json`'s `version` and injects it at build time as the `__APP_VERSION__` global (declared in `web/src/vite-env.d.ts`), shown under "אודות" (About) in `SettingsPage.tsx`. Bump `web/package.json`'s `version` field to change what's displayed.
