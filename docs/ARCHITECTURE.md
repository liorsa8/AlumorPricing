# AlumorPricing — Architecture

A price-quoting tool for aluminum/PVC window & door fabrication shops. Hebrew, right-to-left, single-user, runs locally on the shop owner's own PC. No CAD, no login — a catalog-driven quote builder with a printable/shareable output.

## Tech stack

- **Backend**: Node.js + Express + TypeScript, [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (synchronous SQLite driver) writing a single file, `server/data/app.db`.
- **Frontend**: React + TypeScript + Vite, [TanStack Query](https://tanstack.com/query) for data fetching, React Router. No UI framework — plain CSS with RTL-aware logical properties.
- No ORM. Routes use `better-sqlite3`'s prepared statements directly.

## Why this shape

The app deliberately has **no CAD/geometry engine**. Material quantities are estimated from two per-opening-type calibration factors (`profile_factor`, `glass_area_ratio`) rather than a real cut-list, and hardware (hinges, locks, gaskets...) comes from a fixed default kit per opening type. This trades geometric precision for something a shop owner can actually calibrate and maintain themselves — see `opening_types` / `opening_type_accessories` in the schema below.

The app also deliberately avoids client-side PDF generation for the printed quote. JS PDF libraries (jsPDF etc.) re-typeset text through their own font/shaping engine and handle Hebrew RTL/bidi poorly. Instead, `ProjectPrintPage` is a normal HTML page styled with a dedicated print stylesheet (`web/src/styles/print.css`), and the user prints or "saves as PDF" through the browser's own native print pipeline, which renders Hebrew correctly for free. The same reasoning extends to the sharing feature (see below): sharing captures the browser's *already-correct* on-screen rendering as an image (`html2canvas`) rather than re-generating a PDF.

## Project structure

```
server/
  data/app.db                     — the database file (gitignored; back this up)
  src/
    index.ts                      — Express bootstrap; serves the API and, in production, the built frontend
    db/
      connection.ts                — opens the DB, runs migrations
      migrations/001_init.sql      — full schema (see below)
      seed.ts                      — idempotent placeholder catalog + default settings, run on every startup
    routes/
      simpleCatalog.ts             — generic CRUD factory used by profile-systems / glass-types / accessories
      openingTypes.ts              — opening types + their default accessory "kit"
      customers.ts
      settings.ts                  — the single global pricing/letterhead settings row
      projects.ts                  — quotes: project + nested opening line items, the pricing engine's call sites
    services/
      quoteCalculator.ts           — pure pricing functions (no DB/Express imports), see "Pricing" below
web/
  src/
    api/client.ts, api/types.ts    — thin fetch wrapper + shared TS types mirroring the API responses
    components/
      AppShell.tsx                 — nav shell (RTL sidebar)
      CatalogCrudPage.tsx          — generic list/create/edit/deactivate/delete UI, configured per catalog table
    pages/
      ProjectsListPage.tsx, ProjectDetailPage.tsx (quote builder), ProjectPrintPage.tsx (customer-facing output)
      CustomersPage.tsx, SettingsPage.tsx
      catalog/{ProfileSystemsPage,GlassTypesPage,AccessoriesPage}.tsx  — thin configs over CatalogCrudPage
      catalog/OpeningTypesPage.tsx — not generic: has its own factor fields + accessory-kit editor
    styles/{global.css,print.css}
docs/ARCHITECTURE.md              — this file
```

## Data model

SQLite, defined in `server/src/db/migrations/001_init.sql`, executed idempotently (`CREATE TABLE IF NOT EXISTS`) on every server startup.

**Catalog** (editable in-app, seeded with placeholder Israeli aluminum data — Klil series 7000/7300/9000/4100/4500, PVC REHAU):
- `profile_systems` — name, series code, manufacturer, price per meter
- `glass_types` — name, thickness, price per m²
- `accessories` — name, unit, price per unit
- `opening_types` — name, code, `profile_factor` (m of profile per m² of opening), `glass_area_ratio`, sort order
- `opening_type_accessories` — the default hardware kit for an opening type (accessory + fixed quantity, independent of size)

**Business data**:
- `customers`
- `settings` — a single row (id=1): `labor_pct`, `installation_pct`, `vat_pct`, `company_name/phone/address`, `standard_terms` (free text, one clause per line, rendered as a numbered list on the printed quote)
- `projects` — a quote: `quote_number` (auto-incrementing), `status` (`draft → sent/accepted/rejected/archived`), `customer_id`, `discount_pct`, and the computed totals (`material_subtotal`, `labor_amount`, `installation_amount`, `discount_amount`, `pre_vat_total`, `vat_amount`, `total`) plus `*_pct_snapshot` columns
- `openings` — line items on a project: dimensions, quantity, references into the catalog, **and a full snapshot of the catalog values used to price it** (`*_snapshot` columns: names, factors, prices)
- `opening_accessories` — the priced accessory lines for one opening, also snapshotted

**Why so much snapshotting?** Once a quote is sent, its price must never silently drift because someone later edited the catalog or the global settings. Every `openings`/`opening_accessories` row freezes the catalog values it was priced with; every `projects` row freezes the percentages in effect. While a project's `status` is `draft`, `projects.ts` keeps re-deriving prices from the *live* catalog/settings on every edit (so the shop owner sees current numbers while building); the moment status leaves `draft`, that stops and the frozen snapshot is what's shown from then on. This same freeze point is what blocks further opening edits — every opening-mutating route in `projects.ts` returns 409 once `status !== 'draft'`.

## Pricing (`server/src/services/quoteCalculator.ts`)

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

## API surface

REST, mounted under `/api` (see `server/src/index.ts`): `/opening-types`, `/profile-systems`, `/glass-types`, `/accessories` (CRUD; delete soft-deactivates instead of hard-deleting if referenced by any quote), `/customers`, `/settings` (GET/PUT the single row), `/projects` (list/create/update/delete, `/recalculate` to re-price a draft against the current catalog) and nested `/projects/:id/openings` (create/update/delete a line item — computes and persists the full snapshot server-side; the client never computes prices itself).

## Frontend

RTL is applied once, at the root (`<html dir="rtl" lang="he">` in `web/index.html`), plus CSS logical properties (`margin-inline-start`, `text-align: start`) throughout instead of `left`/`right`. Currency renders via `Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' })`.

`CatalogCrudPage.tsx` is a single generic component (fields, endpoint, labels passed as props) driving the three simple catalogs — `opening_types` is deliberately **not** built on it, since it has extra structure (numeric factors, an embedded accessory-kit editor) that would strain a shared abstraction.

Data fetching is TanStack Query end to end — every page's server state is a `useQuery`/`useMutation` pair against `web/src/api/client.ts`'s thin `fetch` wrapper.

## Sharing a quote (WhatsApp / Gmail)

`ProjectPrintPage` has a "שתף" (Share) button: it rasterizes the already-rendered quote via `html2canvas` into a PNG (capturing the browser's correct RTL text layout as pixels, not re-typesetting it), then calls the Web Share API (`navigator.share({ files: [...] })`) so the OS share sheet can hand that image straight to WhatsApp, Gmail, or anything else installed — no manual download step. Where the browser doesn't support file sharing (mainly desktop), it falls back to downloading the image, plus two explicit text-only share links (`wa.me` and Gmail's web-compose URL) that send just a short summary and total.

## Running / building

```bash
npm install
npm run dev      # server on :3001, web (Vite) on :5173, proxied
npm run build    # builds web/dist, then compiles the server
npm start         # one process serving both the API and the built frontend on :3001
```

Back up `server/data/app.db` — it's the only copy of the business's data.

## Versioning

`web/vite.config.ts` reads `web/package.json`'s `version` and injects it at build time as the `__APP_VERSION__` global (declared in `web/src/vite-env.d.ts`), shown under "אודות" (About) in `SettingsPage.tsx`. Bump `web/package.json`'s `version` field to change what's displayed.
