# 3PL Shipping Cost Analyzer

A full-stack web tool that automates 3PL (third-party logistics) warehouse shipping cost comparisons. Upload client order data and rate cards for each candidate warehouse, run the calculation engine, and instantly see which 3PL network gives the lowest per-order shipping cost — including multi-node optimization for providers with more than one warehouse location.

Replaces a manual Google Sheets workflow (zone lookups + rate card INDEX MATCH) that would otherwise require repeating the same process for every warehouse being evaluated.

---

## Prerequisites

- **Node.js 18+** (required for `crypto.randomUUID()` and `File`/`FormData` globals used in tests)
- **npm 9+**

---

## Setup

```bash
# Install dependencies
npm install

# Run database migrations (creates the SQLite file at db/shipping-analyzer.db)
npm run db:migrate
```

### Zone data seed (required for real lookups)

The calculation engine uses a pre-seeded USPS zone map (~700K–900K rows). This is a one-time operation that takes **5–10 minutes** and requires network access to USPS public endpoints.

```bash
npm run seed:zones
```

Re-run annually when USPS updates zone charts (typically January). You can skip this during development if you only use the test fixtures, which seed their own zone rows.

---

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app runs fully offline — no external services at runtime.

---

## Running tests

```bash
npm run test          # run once
npm run test -- --watch  # watch mode
```

Tests cover:
- Calculation engine (weight, zone lookup, rate lookup, surcharges, optimized-mode aggregation)
- API routes (analyses, warehouses, rate cards, orders, calculate, results, share)
- Export logic (summary CSV/Excel, per-order table, excluded-orders CSV)
- Result derivation (table model, zone distribution, per-order table)
- Component tests (SummaryTable, ExportButtons, ShareButton, readonly mode)
- Integration test: 6 known orders against the Atomix Ground rate card; outputs must match the `AGENTS.md` sample data table exactly

---

## Data model

An **Analysis** is the top-level container. Each analysis has:

- **Orders** — destination ZIP, weight, optional dimensions; uploaded from a client OMS export
- **Warehouses** — grouped by `provider_name` (a 3PL company); each warehouse has an origin ZIP, optional dim-weight settings, and a flat surcharge
- **Rate cards** — weight × zone price matrices; uploaded as CSV/Excel and fanned out to all locations under the same provider
- **ZoneMap** — pre-seeded USPS origin ZIP3 → destination ZIP3 → zone reference table; not per-analysis

After running **Calculate**, the engine produces an `OrderResult` row for every order × warehouse pair (zone, billable weight, base cost, surcharge, total cost). The **Results View** derives summary aggregates and the **Optimized mode** winner (cheapest location per order per provider) entirely client-side from this stored matrix, so checkbox toggles are instant with no server round-trip.

---

## Sample data fixture

`tests/fixtures/` contains the 6-order sample from `AGENTS.md` (Kase/Milwaukee/53154, Atomix Ground rate card). The integration test at `tests/engine/integration.test.ts` uses this fixture to verify that the calculation engine reproduces the expected costs exactly.

---

## Architecture notes

- **Single-user, local-first.** No authentication, no user management. The tool runs on your machine and the database is a local SQLite file (`db/shipping-analyzer.db`, gitignored).
- **Shareable links.** Generate a read-only share link from the Results View. Anyone with the URL can view the results — no login required. The link reflects the persisted analysis state (view mode, excluded locations, projected cost input). Revoke it at any time — old URLs 404 immediately.
- **No paid hosting required.** Can be deployed to Vercel or Railway free tiers when shareable links need to be accessible without running locally.

### Sharing results

1. Open an analysis and click **Results**.
2. Click **Share** (top-right). A UUID token is generated server-side and the URL is copied to your clipboard.
3. Send the URL — recipients see a read-only Results view (no export buttons, no checkboxes, no projected cost input).
4. To revoke, click **Revoke link**. The token is cleared from the database; the old URL returns 404 immediately. Generating a new share link also invalidates the previous one.

---

## Planned v2 features

- **Multi-rate-card optimization** — pick the cheapest rate card per order when a 3PL quotes multiple service levels
- **Advanced surcharges** — conditional rules (residential zones, oversized packages) instead of flat adders
- **Carrier-specific zone tables** — separate zone maps for UPS/FedEx/USPS if they diverge
- **Provider table promotion** — `provider_name` becomes a foreign key with contract metadata, contacts, historical performance
- **Dedicated network optimizer** — explore all combinations of N-of-M locations for a provider
- **Auto-suggested projection volume** — infer orders-per-period from uploaded order dates
- **Client self-serve access** — login, user management, per-client analyses

See `BACKLOG.md` for the full deferred list.
