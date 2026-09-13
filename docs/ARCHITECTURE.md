# AlumorPricing — Architecture

A price-quoting tool for aluminum/PVC window & door fabrication shops. Hebrew, right-to-left, single-user. No CAD, no login, no server — a catalog-driven quote builder with a printable/shareable output that runs entirely in the browser.

## Tech stack

- **Frontend only** — React + TypeScript + Vite, [TanStack Query](https://tanstack.com/query) for data access, React Router. No UI framework — plain CSS with RTL-aware logical properties.
- **Storage**: [Dexie](https://dexie.org/) over the browser's own IndexedDB (`web/src/db/schema.ts`). There is no backend and no network call anywhere in the app — every device/browser that opens the app has its own independent local database.
- No ORM beyond Dexie's own table API.

## Why this shape

The app deliberately has **no CAD/geometry engine**. Material quantities are estimated from two per-opening-type calibration factors (`profile_factor`, `glass_area_ratio`) rather than a real cut-list, and hardware (hinges, locks, gaskets...) comes from a fixed default kit per opening type. This trades geometric precision for something a shop owner can actually calibrate and maintain themselves — see `opening_types` / `opening_type_accessories` in the schema below.

The app also deliberately has **no client/server split**. An earlier version ran an Express + SQLite server on the shop owner's own PC, with every device (including the owner's own phone) acting as a thin client reaching into that PC over the LAN — which meant the app only worked near that PC, on the same network, with it powered on, and getting a real HTTPS domain for it was a real (and not free) undertaking. Moving the data itself into the browser (IndexedDB) removes that dependency entirely: the built app is static files, deployable anywhere for free, and once opened once on a device it keeps working with **no network and no PC** involved at all. The trade-off, accepted deliberately: each device has its own separate copy of the data — see "Import / export" below for how to move data between devices.

The app also deliberately avoids client-side PDF generation for the printed quote. JS PDF libraries (jsPDF etc.) re-typeset text through their own font/shaping engine and handle Hebrew RTL/bidi poorly. Instead, `ProjectPrintPage` is a normal HTML page styled with a dedicated print stylesheet (`web/src/styles/print.css`), and the user prints or "saves as PDF" through the browser's own native print pipeline, which renders Hebrew correctly for free.

## Project structure

```
web/
  src/
    db/
      schema.ts                    — Dexie database definition (all tables, see below)
      seedData.ts, companyLogo.ts  — placeholder catalog + default company letterhead
      seed.ts                      — seeds the database once, the first time it's empty
      localApi.ts                  — the pricing/CRUD logic itself: a tiny in-browser
                                      router (mirrors what used to be Express routes) that
                                      reads/writes Dexie and runs the pricing engine
    lib/
      quoteCalculator.ts           — pure pricing functions (no DB imports), see "Pricing" below
      dataBackup.ts                — export/import the whole database as one JSON file
    api/client.ts, api/types.ts    — api.get/post/put/delete(url) surface every page calls;
                                      underneath, it now calls straight into db/localApi.ts
                                      instead of doing an HTTP fetch (kept identical on
                                      purpose, so no page component needed to change)
    components/
      AppShell.tsx                 — nav shell (RTL sidebar)
      CatalogCrudPage.tsx          — generic list/create/edit/deactivate/delete UI, configured per catalog table
    pages/
      ProjectsListPage.tsx, ProjectDetailPage.tsx (quote builder), ProjectPrintPage.tsx (customer-facing output)
      CustomersPage.tsx, SettingsPage.tsx (also: backup export/import, About/version)
      catalog/{ProfileSystemsPage,GlassTypesPage,AccessoriesPage}.tsx  — thin configs over CatalogCrudPage
      catalog/OpeningTypesPage.tsx — not generic: has its own factor fields + accessory-kit editor
    styles/{global.css,print.css}
  public/manifest.json, sw.js      — PWA install + offline app-shell caching
docs/ARCHITECTURE.md               — this file
```

## Data model

IndexedDB via Dexie, defined in `web/src/db/schema.ts`. Seeded once (`web/src/db/seed.ts`) the first time a browser opens the app with an empty database.

**Catalog** (editable in-app, seeded with placeholder Israeli aluminum data — Klil series 7000/7300/9000/4100/4500, PVC REHAU):
- `profile_systems` — name, series code, manufacturer, price per meter
- `glass_types` — name, thickness, price per m²
- `accessories` — name, unit, price per unit
- `opening_types` — name, code, `profile_factor` (m of profile per m² of opening), `glass_area_ratio`, sort order
- `opening_type_accessories` — the default hardware kit for an opening type (accessory + fixed quantity, independent of size)

**Business data**:
- `customers`
- `settings` — a single row (id=1): `labor_pct`, `installation_pct`, `vat_pct`, `company_name/phone/address/email/tax_id/logo`, `standard_terms` (free text, one clause per line, rendered as a numbered list on the printed quote)
- `projects` — a quote: `quote_number` (auto-incrementing), `status` (`draft → sent/accepted/rejected/archived`), `customer_id`, `discount_pct`, and the computed totals (`material_subtotal`, `labor_amount`, `installation_amount`, `discount_amount`, `pre_vat_total`, `vat_amount`, `total`) plus `*_pct_snapshot` columns
- `openings` — line items on a project: dimensions, quantity, references into the catalog, **and a full snapshot of the catalog values used to price it** (`*_snapshot` columns: names, factors, prices)
- `opening_accessories` — the priced accessory lines for one opening, also snapshotted

**Why so much snapshotting?** Once a quote is sent, its price must never silently drift because someone later edited the catalog or the global settings. Every `openings`/`opening_accessories` row freezes the catalog values it was priced with; every `projects` row freezes the percentages in effect. While a project's `status` is `draft`, `localApi.ts` keeps re-deriving prices from the *live* catalog/settings on every edit (so the shop owner sees current numbers while building); the moment status leaves `draft`, that stops and the frozen snapshot is what's shown from then on. This same freeze point is what blocks further opening edits — every opening-mutating route in `localApi.ts` throws `project_not_draft` once `status !== 'draft'`.

IndexedDB has no foreign-key cascade, unlike the old SQLite schema — so deleting a project or an opening explicitly deletes its dependent rows (accessory lines, openings) itself, inside a Dexie transaction, rather than relying on `ON DELETE CASCADE`.

## Pricing (`web/src/lib/quoteCalculator.ts`)

Pure functions, no side effects, easy to unit-test in isolation:

```
area_sqm          = (width_mm/1000) × (height_mm/1000)
profile_length_m  = area_sqm × opening_type.profile_factor
glass_area_sqm    = area_sqm × opening_type.glass_area_ratio
material_cost     = profile_length_m × profile_system.price_per_meter
                   + glass_area_sqm   × glass_type.price_per_sqm
accessories_cost  = Σ (accessory.quantity × accessory.price_per_unit)
unit_subtotal     = material_cost + accessories_cost
line_subtotal     = unit_subtotal × quantity

material_subtotal = Σ line_subtotal over all openings
labor_amount      = material_subtotal × labor_pct / 100
installation_amount = material_subtotal × installation_pct / 100
subtotal_before_discount = material_subtotal + labor_amount + installation_amount
discount_amount   = subtotal_before_discount × discount_pct / 100
pre_vat_total     = subtotal_before_discount − discount_amount
vat_amount        = pre_vat_total × vat_pct / 100
total             = pre_vat_total + vat_amount
```

Rounding happens only at display time (`formatCurrency`), never mid-calculation, so the printed sum of line items always reconciles exactly with the totals below it.

**Two different views of a line item's price**, both intentional:
- The **quote builder** (`ProjectDetailPage`) shows the raw `unit_subtotal`/`line_subtotal` (material + accessories only) per line, with labor/installation/discount broken out as separate rows in the totals panel — useful for the shop owner building the quote.
- The **printed/shared quote** (`ProjectPrintPage`) shows only three totals (pre-VAT, VAT, grand total) and *inflates each line's displayed price* by `(1 + labor_pct/100 + installation_pct/100) × (1 − discount_pct/100)` so that summing the visible line prices matches the visible pre-VAT total — a customer-facing document where the numbers must add up on their own, without a labor/installation breakdown to explain the gap.

## The local "API" (`web/src/db/localApi.ts`)

Every page still calls `api.get/post/put/delete(url)` exactly as it did when this was a real HTTP client (`web/src/api/client.ts`). Underneath, that call is now dispatched to a small in-browser router that pattern-matches the same URL strings (e.g. `PUT /projects/:projectId/openings/:id`) against handler functions that read/write Dexie tables and call into `quoteCalculator.ts` — the same responsibilities the old Express routes had (validating input, resolving catalog references, computing and persisting the priced snapshot, recomputing project totals), just running synchronously in the tab instead of over HTTP. Errors are thrown as plain `Error(code)` with the same string codes the old API returned (`not_found`, `name_required`, `customer_has_projects`, `invalid_dimensions`, `invalid_reference`, `project_not_draft`), so existing UI error handling needed no changes either.

## Frontend

RTL is applied once, at the root (`<html dir="rtl" lang="he">` in `web/index.html`), plus CSS logical properties (`margin-inline-start`, `text-align: start`) throughout instead of `left`/`right`. Currency renders via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.

`CatalogCrudPage.tsx` is a single generic component (fields, endpoint, labels passed as props) driving the three simple catalogs — `opening_types` is deliberately **not** built on it, since it has extra structure (numeric factors, an embedded accessory-kit editor) that would strain a shared abstraction.

Data fetching is TanStack Query end to end — every page's data is a `useQuery`/`useMutation` pair against `web/src/api/client.ts`.

## Sharing a quote (WhatsApp / Gmail)

`ProjectDetailPage` has "וואטסאפ" and "Gmail" buttons that open a pre-filled share link (`wa.me` / Gmail's web-compose URL) with a short text summary and the total — no download or attachment step. `web/src/lib/shareQuote.ts` also still has an unused `shareQuoteImage` helper (rasterizes the quote via `html2canvas` and hands it to the Web Share API) kept in code but not wired to any button — the shop owner didn't need it day-to-day, but it's there if that changes.

## Import / export (`web/src/lib/dataBackup.ts`)

Because each device's data is local and independent, `SettingsPage` has an explicit "ייצוא גיבוי" / "ייבוא מקובץ גיבוי" pair: export downloads the entire database (every table) as one JSON file; import fully replaces the local database with the contents of a previously exported file (after an in-app confirmation, since it's destructive). This is the only way data moves between two devices/browsers — there is no sync.

## Running / building

```bash
npm install
npm run dev      # Vite dev server on :5173 — that's the whole app
npm run build    # builds web/dist — a static site, deployable anywhere (no server needed)
npm run preview  # serves the production build locally, for a final check before deploying
```

There is no database file to back up on the filesystem — use the in-app export (above) instead.

## Installing on a phone / offline use

`web/public/manifest.json` + `web/public/sw.js` make the built app installable (iOS "Add to Home Screen", Android Chrome's "Install app" — the latter needs the whole app served over HTTPS). Because there's no server, `sw.js` now actually caches the app shell as it's fetched ("cache-as-you-go") — once opened once, the app keeps working fully offline, indefinitely, with no PC or network involved at all, since there's nothing left to reach.

## Versioning

`web/vite.config.ts` reads `web/package.json`'s `version` and injects it at build time as the `__APP_VERSION__` global (declared in `web/src/vite-env.d.ts`), shown under "אודות" (About) in `SettingsPage.tsx`. Bump `web/package.json`'s `version` field to change what's displayed.
