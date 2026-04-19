<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 3PL Shipping Cost Analyzer — Claude Project Instructions

## How Claude Should Operate in This Project

The user building this project values Claude's expertise. In every response, Claude should:

- **Proactively recommend best practices** for code architecture, file structure, naming conventions, error handling, performance, and UX — even when not explicitly asked. If there's a cleaner way to do something, say so.
- **Flag potential issues early.** If a proposed approach could cause problems at scale, introduce bugs, or create tech debt, raise it immediately with a recommended alternative.
- **Explain trade-offs** when presenting options. Don't just give one answer — explain why it's the best choice and what was considered.
- **Prioritize correctness and data integrity** above all else. This tool replaces a manual spreadsheet workflow where accuracy is critical to business decisions. Every calculation must be verifiable and deterministic.
- **Write clean, well-structured code** with clear separation of concerns. Favor readability and maintainability. Use meaningful names. Add comments only where business logic is non-obvious.
- **Suggest tests** for any business logic. Weight rounding, zone lookups, rate matching, cost calculations, and optimized-mode winner selection should all have unit tests with known inputs and expected outputs.
- **Think in terms of v1 vs v2.** Build v1 features solidly. When v2 features come up, architect v1 so that v2 additions don't require rewrites — but don't over-engineer v1 to support hypothetical v2 complexity.
- **Keep project instructions in sync.** Whenever a conversation involves adding features, changing business logic, modifying the data model, updating the tech stack, or making any architectural decision that would affect the accuracy of these project instructions, Claude must flag this explicitly. Claude should say something like: "This change affects the project instructions — here's the updated section to replace/append." Claude should produce the minimal targeted update (just the changed section with clear "replace X with Y" instructions) for small changes, or a full updated instructions document for large changes. The goal is that these project instructions always reflect the current state of the project. Never let the instructions drift from reality silently.

---

## Project Overview

A full-stack web tool that automates 3PL (third-party logistics) warehouse shipping cost comparisons. The user is a logistics consultant who evaluates multiple potential 3PL warehouses for clients by analyzing how much it would cost to ship every historical order from each warehouse, then comparing averages and totals to recommend the best option.

### Current Manual Workflow Being Replaced

1. Client provides order export (CSV/Excel) from their OMS containing: destination ZIP, package weight, and optionally dimensions (L × W × H).
2. For each candidate 3PL warehouse, the user manually downloads a UPS zone chart based on the warehouse's origin ZIP.
3. In Google Sheets, the user does an XLOOKUP to assign a shipping zone to each order based on the destination ZIP's first 3 digits.
4. The user then does an INDEX MATCH against the 3PL's rate card (a weight × zone price matrix) to calculate the shipping cost for each order.
5. This is repeated for every 3PL being evaluated (often 5-15 warehouses).
6. A comparison summary shows average cost, total cost, and zone distribution per 3PL.
7. When a 3PL operates multiple warehouse locations, the user manually computes the "cheapest per order" across that 3PL's locations to simulate a multi-node operation — another step the tool now automates.

### What the Tool Does

Automates steps 2–7 entirely. The user uploads order data, adds warehouses (optionally grouped under a shared 3PL provider), uploads rate cards, and the tool instantly calculates and compares costs — including multi-node optimization for 3PLs with more than one location.

---

## Tech Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | **Next.js (App Router)** | Full-stack in one project. API routes + React UI. Claude Code excels with it. |
| Database | **SQLite via better-sqlite3** | Zero setup, file-based, no server needed. Single file in project dir. Sufficient for single-user workload. |
| ORM/Query | **Drizzle ORM** | Lightweight, type-safe, works perfectly with SQLite. |
| Styling | **Tailwind CSS** | Rapid UI development. Claude Code generates it well. |
| File Parsing | **Papa Parse (CSV), SheetJS (Excel)** | For ingesting order data and rate cards. SheetJS also used for generating multi-tab Excel exports. |
| Charts | **Recharts** | For comparison visualizations. |
| Language | **TypeScript** | Type safety catches bugs in business logic. |

### Hosting

- **Primary: Local development.** User runs `npm run dev` from VS Code terminal, accesses at `localhost:3000`.
- **Future: Deploy to Vercel or Railway free tier** when shareable links are needed.
- **Constraint: No paid hosting.** The architecture must work fully offline/local. Any future deployment must fit within free tiers.

---

## Data Model

### Core Entities

```
Analysis
├── id (primary key)
├── name (e.g., "Client X — Q1 2025")
├── created_at
├── updated_at
├── status (draft | complete)
├── shareable_token (for public view links, nullable)
├── view_mode (enum: "optimized" | "single_node", default "optimized")
│   └── Saved per-analysis; determines default mode when results page loads.
├── excluded_locations (JSON, nullable)
│   └── Map of { providerName: [warehouseId, ...] } for locations the user has
│       unchecked in Optimized mode. Default: empty (all locations included).
├── projected_order_count (integer, nullable)
│   └── User-entered forecast volume. Drives the "Projected Period Cost" column.
└── projected_period (enum: "month" | "year", default "year")
    └── Period applied to projected_order_count.

Warehouse
├── id
├── analysis_id (foreign key)
├── provider_name (text)
│   └── The 3PL brand/company name (e.g., "Selery", "Stord", "Red Stag").
│       Warehouses sharing a provider_name within the same analysis are
│       treated as a multi-node network in Optimized mode. A single-location
│       3PL is simply a provider_name with one warehouse.
├── location_label (e.g., "Reno, NV")
├── origin_zip (5-digit ZIP)
├── origin_zip3 (first 3 digits, derived)
├── dim_weight_enabled (boolean, default false)
├── dim_factor (integer, nullable — e.g., 139)
├── surcharge_flat (decimal, default 0.00 — e.g., 2.50 for residential)
└── notes (text, nullable)

RateCard
├── id
├── warehouse_id (foreign key)
├── name (e.g., "Ground", "Priority")
├── weight_unit_mode (enum: "oz_only" | "lbs_only" | "oz_then_lbs")
│   ├── oz_only: all weights looked up in ounces
│   ├── lbs_only: all weights looked up in pounds (round up)
│   └── oz_then_lbs: rate card has both oz and lbs rows; engine finds cheapest valid rate
└── created_at

RateCardEntry
├── id
├── rate_card_id (foreign key)
├── weight_value (integer — e.g., 7 for 7oz or 3 for 3lbs)
├── weight_unit (enum: "oz" | "lbs")
├── zone (integer, 1-8)
└── price (decimal)

ZoneMap (static reference data, pre-seeded from USPS)
├── origin_zip3 (text, e.g., "531")
├── dest_zip3 (text, e.g., "040")
└── zone (integer, 1-8)

Order (per analysis)
├── id
├── analysis_id (foreign key)
├── order_number (from upload)
├── dest_zip (5-digit)
├── dest_zip3 (first 3 digits, derived)
├── actual_weight_lbs (decimal — always stored in lbs)
├── height (decimal, nullable)
├── width (decimal, nullable)
├── length (decimal, nullable)
└── state (text, nullable)

OrderResult (calculated, per order per warehouse)
├── id
├── order_id (foreign key)
├── warehouse_id (foreign key)
├── zone (integer)
├── billable_weight_value (decimal)
├── billable_weight_unit (enum: "oz" | "lbs")
├── dim_weight_lbs (decimal, nullable)
├── rate_card_id (foreign key — which rate card was used)
├── base_cost (decimal)
├── surcharge (decimal)
├── total_cost (decimal — base_cost + surcharge)
└── calculation_notes (text, nullable — for debugging/auditing)
```

### Notes on the data model

**Why per-order-per-warehouse results are stored exhaustively.** The engine pre-computes cost for every order × every warehouse and persists the full matrix in `OrderResult`. This is intentional: Optimized-mode calculations (cheapest location per order, respecting user checkbox state) are derived from this stored matrix on the client. Toggling a checkbox must not trigger a server-side recompute. This keeps the UI snappy and keeps the engine deterministic (it runs once per analysis, produces a stable artifact).

**Optimized-mode winner is derived, not stored.** The "winning warehouse" for each order in Optimized mode is a function of (a) the `OrderResult` matrix and (b) the current `excluded_locations` state. It is computed on demand rather than persisted. If a user toggles a checkbox, the winner can change; persisting it would be a source of drift. The engine module that produces summary aggregates exposes a pure function for this: given the matrix and a set of excluded warehouse IDs, return per-order winners for each provider.

**`provider_name` is a flat string, not a foreign key.** For V1, warehouses are grouped by matching `provider_name` within an analysis. There is no separate `Provider` table. If V2 needs 3PL-level metadata (contracts, contacts, historical performance), a `Provider` table can be introduced without breaking the existing data.

---

## Core Business Logic — THE CALCULATION ENGINE

This is the most critical part of the application. Every rule must be explicit and tested.

### Step 1: Order Validation (runs before any calculations)

```
Before calculating costs, validate ALL orders against ALL warehouses.
An order is "invalid" if ANY of the following are true for ANY warehouse
in the analysis:

- Zone not found (dest_zip3 has no entry in that warehouse's zone chart)
- Destination ZIP is not a valid 5-digit US ZIP (after left-padding)
- Required fields missing (weight, dest ZIP)
- Weight is zero or negative

CRITICAL CONSISTENCY RULE: If an order is invalid for ANY warehouse, it
must be EXCLUDED from the comparison for ALL warehouses. This ensures
every warehouse is evaluated on the exact same set of orders.

The app should clearly report:
- How many orders are included in the comparison
- How many orders were excluded and why
- A downloadable list of excluded orders with the specific reason

Invalid orders due to rate card limits (weight exceeds max row) are
handled differently — see Step 3. If an order's weight exceeds a specific
warehouse's rate card max, that order is flagged for THAT warehouse but
may still be valid for others. However, for a fair comparison, the same
consistency rule applies: exclude it from all warehouses.
```

### Step 2: Zone Lookup

```
Input: warehouse.origin_zip3, order.dest_zip3
Output: zone (integer 1-8)

Logic:
1. Query ZoneMap table: SELECT zone WHERE origin_zip3 = ? AND dest_zip3 = ?
2. If no match found, flag the order as "zone not found" — do NOT silently skip or default.
```

### Step 3: Weight Calculation

```
Input: order.actual_weight_lbs, order dimensions (L, W, H), warehouse dim settings, rate card weight_unit_mode
Output: billable_weight_value, billable_weight_unit

Logic varies by rate_card.weight_unit_mode:

--- Dimensional Weight (applied first, if warehouse.dim_weight_enabled) ---
  dim_weight_lbs = (L × W × H) / warehouse.dim_factor
  effective_weight_lbs = MAX(actual_weight_lbs, dim_weight_lbs)
  (Use effective_weight_lbs for all subsequent calculations below.)

--- Mode: "oz_then_lbs" (rate card has both oz and lbs rows) ---
This mode mirrors how 3PLs actually bill. The rules are rigid and deterministic:

  If effective_weight_lbs < 1.0:
    → Use oz rows.
    weight_oz = effective_weight_lbs × 16
    billable_weight = CEILING(weight_oz), unit = "oz"
    Look up in oz entries. If the rounded oz value exceeds the max oz row
    in the rate card (e.g., rounds to 17oz but card maxes at 16oz), this
    should NOT happen if weight < 1.0 lbs (max would be 16oz = 1.0 lbs).
    If it somehow does, ERROR — flag the order.

  If effective_weight_lbs = 1.0 exactly:
    → Use oz rows (16oz). This matches carrier behavior where the oz tier
    covers "up to and including 1 lb."

  If effective_weight_lbs > 1.0:
    → Use lbs rows.
    billable_weight = CEILING(effective_weight_lbs), unit = "lbs"
    Look up in lbs entries. If the rounded lbs value exceeds the max lbs
    row in the rate card, ERROR — flag the order as "weight exceeds rate
    card maximum." Do NOT silently use the highest available row.

--- Mode: "lbs_only" ---
  billable_weight = CEILING(effective_weight_lbs), unit = "lbs"
  Minimum 1 lb.
  Look up directly. If weight exceeds max rate card row, ERROR.

--- Mode: "oz_only" ---
  weight_oz = effective_weight_lbs × 16
  billable_weight = CEILING(weight_oz), unit = "oz"
  Look up directly. If weight exceeds max rate card row, ERROR.
```

### Step 4: Rate Card Lookup

```
For all modes, after determining billable_weight_value and billable_weight_unit:

Input: billable_weight_value, billable_weight_unit, zone, rate_card entries
Output: base_cost

Logic:
1. Find the RateCardEntry WHERE:
   weight_unit = billable_weight_unit
   AND weight_value = billable_weight_value
   AND zone = zone
2. Return price.
3. If no exact match: find the NEXT HIGHER weight_value in the same unit
   for that zone. Never round down.
4. If still no match, flag the order as "rate not found" — do NOT skip silently.
```

### Step 5: Surcharge Application

```
Input: base_cost, warehouse.surcharge_flat
Output: total_cost = base_cost + surcharge_flat
```

### Step 6: Per-Warehouse Aggregation

```
Per warehouse (i.e., per location):
- average_cost = AVG(total_cost) across all included orders
- total_cost_sum = SUM(total_cost)
- average_zone = AVG(zone)
- zone_distribution = COUNT of orders per zone / total orders (as percentages)
- cost_by_zone = AVG(total_cost) grouped by zone

Single-node ranking: sort all warehouses ascending by average_cost.
Winner: lowest average_cost. Highlight in the UI.
```

### Step 7: Optimized-Mode Aggregation (Multi-Node 3PLs)

```
Runs AFTER Step 6. Operates on the OrderResult matrix (per order × per warehouse).
Does not re-execute zone/weight/rate logic — purely a selection and aggregation
pass over stored results.

Grouping:
- Group warehouses by provider_name within the analysis.
- A "provider group" is the set of all warehouses sharing a provider_name.
- Single-location providers (group size = 1) are unaffected by optimized mode:
  their optimized result equals their single-warehouse result.

For each provider group:
  Input: the set of included warehouses for this provider (all by default; can
         be narrowed by Analysis.excluded_locations).

  For each included order:
    1. Collect total_cost from each included warehouse in the provider group.
    2. winner_warehouse_id = the warehouse with the minimum total_cost.
       Ties: pick deterministically by lowest warehouse_id (stable and reproducible).
    3. winning_cost = the minimum total_cost.
    4. winning_zone = the zone of the winning warehouse for this order.

  Aggregate across orders:
    - optimized_average_cost = AVG(winning_cost)
    - optimized_total_cost   = SUM(winning_cost)
    - optimized_average_zone = AVG(winning_zone)
    - node_utilization       = { warehouse_id: count_of_wins / total_orders } for each included warehouse in the group

Edge case — fewer than 2 included warehouses in a provider group:
  - If exactly 1 warehouse is included, the optimized result equals that
    warehouse's single-node result. The UI should indicate that optimization
    is effectively disabled for this provider ("optimized · 1 of N") and
    present the row without an optimization benefit.
  - If 0 warehouses are included, the provider group is hidden from results
    (there is nothing to compute). The UI should surface this state in the
    expanded detail so it's clear the provider was not removed — just
    fully unchecked.

Determinism requirement:
  This step must be a pure function of (OrderResult matrix, excluded_warehouse_ids).
  Given the same inputs, it must produce the same outputs every time, with no
  dependence on query order, map iteration order, or floating-point accumulation
  quirks. Tiebreaking (lowest warehouse_id) exists specifically to guarantee this.
```

---

## Rate Card Upload Format

Rate cards will be uploaded as CSV or Excel. The expected format after parsing:

**Standard template the user pastes rate card data into:**

| weight_value | weight_unit | zone_1 | zone_2 | zone_3 | zone_4 | zone_5 | zone_6 | zone_7 | zone_8 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | oz | 4.19 | 4.26 | 4.28 | 4.39 | 4.45 | 4.55 | 4.64 | 4.83 |
| 2 | oz | 4.19 | 4.26 | 4.28 | 4.39 | 4.45 | 4.55 | 4.64 | 4.83 |
| ... | | | | | | | | | |
| 16 | oz | 5.66 | 5.72 | 5.84 | 6.14 | 6.66 | 6.81 | 7.00 | 7.29 |
| 1 | lbs | 5.36 | 5.42 | 5.52 | 5.80 | 6.31 | 6.50 | 7.77 | 8.25 |
| 2 | lbs | 5.48 | 5.58 | 5.68 | 6.09 | 6.75 | 7.12 | 8.20 | 8.35 |
| ... up to 100+ lbs | | | | | | | | | |

The upload process should:
1. Accept CSV or Excel
2. Validate that all required columns are present
3. Validate that prices are numeric and positive
4. Flag any gaps (e.g., missing zone columns, missing weight rows)
5. Show a preview before confirming the import

---

## Zone Data

### Source and Storage

The ZoneMap table stores: origin_zip3, dest_zip3, zone.

Zone data is pre-seeded from USPS domestic zone charts, which are the industry-standard baseline used by most 3PLs (confirmed interchangeable with UPS Ground zones for rate card purposes). The complete dataset covers all valid US origin ZIP3 → destination ZIP3 pairs (~700K-900K rows) and lives in the SQLite database.

A one-time seed script (`scripts/seed-zones.ts`) fetches zone charts from the USPS public endpoint (`postcalc.usps.com/DomesticZoneChart`) for all origin ZIP3 prefixes (001-999) and bulk-inserts them into the ZoneMap table. This script runs locally, takes ~5-10 minutes, and should be re-run annually when USPS updates zone charts (typically January).

At runtime, zone lookups are instant local DB queries. No network calls, no per-warehouse downloads, no user uploads needed.

A manual zone CSV upload override is available as an advanced feature for users with carrier-specific or negotiated zone charts that differ from USPS standard zones. This is not part of the normal workflow.

### Zone Chart Upload Format (Advanced Override Only)

| dest_zip3 | zone |
|---|---|
| 005 | 5 |
| 006 | 4 |
| 007 | 4 |
| ... | |

The upload is tied to a warehouse's origin ZIP. The app should warn if zone data already exists for that origin ZIP-3 and offer to replace or keep.

---

## Order Data Upload

Orders come from client OMS exports and vary in format. The upload flow:

1. User uploads CSV or Excel.
2. App shows a **column mapping UI**: auto-detect likely columns, let user confirm/override which column is:
   - Order number / ID
   - Destination ZIP code
   - Weight (and specify if lbs or oz)
   - Height (optional)
   - Width (optional)
   - Length (optional)
   - State (optional)
3. Validate:
   - ZIP codes are 5 digits (left-pad with zeros if needed — ZIP 01234 often gets truncated to 1234 in Excel)
   - Weights are numeric and positive
   - Flag any rows with missing required fields
4. Show preview of parsed data before confirming import.

---

## UI/UX Flow

### Dashboard
- List of saved analyses with name, date, number of warehouses, status
- "New Analysis" button
- Click an analysis to open it

### Analysis Builder (main workspace)
- **Header:** Analysis name (editable), created date
- **Left panel or tabs:**
  1. **Orders** — upload order data, see row count, preview data
  2. **Warehouses** — add/remove warehouses, each with:
     - **Provider Name** (required — the 3PL brand; shared across locations)
     - Location label
     - Origin ZIP
     - Rate card upload (with weight unit mode selector, preview)
     - Dim weight toggle + dim factor input
     - Flat surcharge input
     - Zone data: pre-seeded (with option to override via advanced settings)

     The UI should make it easy to add multiple locations under the same
     provider. When a user types a provider_name that already exists in the
     analysis, autosuggest it so locations get grouped correctly. A provider
     with multiple warehouses shows a small "multi-node" indicator in the
     warehouses list.
  3. **Run Analysis** — button to trigger calculation, shows progress
  4. **Results** — comparison view (see below)

### Results View

The Results View is the primary deliverable of the tool. It is organized around two view modes, a header stats bar, the main summary table, and supporting sections (charts, detailed breakdown, export).

#### Header Stats Bar (above the table, persistent across modes)

The stats bar is a single row of controls and summary info:

- **Order count.** Rendered as a single label (e.g., "Comparing 5,634 orders across 12 warehouses"). Order count is a property of the analysis as a whole — NOT a column in the summary table. Every warehouse is evaluated on the identical set of included orders per the Step 1 consistency rule.
- **Mode toggle.** Pill-style toggle between **Optimized** and **Single-node**. The selected mode drives how the summary table renders. Default on first load: Optimized. Last-used mode is saved per-analysis (`Analysis.view_mode`) and restored on return.
- **Projected cost input.** A number input ("Orders per period") paired with a dropdown for period ("month" or "year"; default year). When the user enters a number, the "Projected Period Cost" column appears in the summary table. When the input is empty, the column is hidden. Both the number and the period are saved per-analysis (`Analysis.projected_order_count`, `Analysis.projected_period`).

#### Optimized Mode (default)

Sort: all rows by average cost ascending. Winner (lowest average cost overall) gets a visible indicator (e.g., 🥇 badge).

- **Single-location providers** render as one flat row:
  `Provider Name — Location`
- **Multi-location providers** render as one collapsed row with an expand caret:
  `▸ Provider Name (optimized · N of M)` where N is the number of currently-included locations and M is the total locations for that provider in the analysis. The row's Avg Zone, Avg Cost, and Projected Period Cost values reflect the optimized result across the included locations.
- Clicking a ▸ row expands it to show:
  - A one-line **node utilization** summary directly under the provider row, listing each included location with its share of winning orders (e.g., "Reno 34% · Lancaster 28% · Dallas 22% · SLC 16%"). This is derived from the Step 7 aggregation output.
  - All of the provider's locations as indented sub-rows, each with:
    - A checkbox on the left (checked by default; toggles inclusion in the optimized calc).
    - The location's own Avg Zone, Avg Cost, and Projected Period Cost (same values the location would show in Single-node mode).
  - Checked sub-rows render normally. Unchecked sub-rows remain visible but are dimmed/struck-through, with the checkbox still active so they can be re-included with one click.
- Checkbox toggles recalculate the parent row's Avg Zone, Avg Cost, Projected Period Cost, node utilization, and "N of M" label **instantly, client-side**. No server round-trip. This is made possible by storing the full per-order per-warehouse `OrderResult` matrix — see Step 7 and the data model notes.
- Checkbox state persists per-analysis (`Analysis.excluded_locations`). Unchecking a location in one session and returning later must show the same state.
- Edge cases in the provider row label:
  - "(optimized · 1 of M)" — only one location included; the row is effectively single-node. Render without the optimization-benefit framing.
  - "(optimized · 0 of M)" — no locations included. The provider row is hidden from the main table but still visible in the expanded detail of the previously-expanded state, so the user can re-check at least one location.

#### Single-node Mode

Every warehouse is an independent, peer row. No grouping, no expand/collapse, no checkboxes. Rows sorted by average cost ascending across all warehouses. Multi-location providers appear as multiple rows scattered throughout the sorted list, interleaved with other providers.

Row label: `Provider Name — Location` in a single combined column (not two columns). This prevents a visual read of "six different companies named Selery" — the label makes provider ownership clear at a glance while keeping the sort order purely cost-based.

#### Summary Table Columns (both modes)

| Column | Description |
|---|---|
| 3PL / Location | Combined display. Optimized-mode provider rows show "Provider (optimized · N of M)"; all other rows show "Provider — Location". |
| Avg Zone | Mean zone across included orders. |
| Avg Cost | Mean total_cost across included orders (or mean winning_cost for optimized provider rows). |
| Projected Period Cost | Avg Cost × `projected_order_count`. Column visible only when `projected_order_count` is set. Header reads "Projected/Mo" or "Projected/Yr" based on `projected_period`. |

Order count is NOT a column. It is shown once in the header stats bar.

#### Supporting Sections (below the summary table)

- **Zone distribution chart** — Bar or stacked bar showing % of orders per zone per warehouse (Single-node) or per provider (Optimized, using the winning warehouse per order).
- **Detailed breakdown** — Expandable table showing every order with the computed cost at each warehouse plus the optimized pair for each multi-node provider. Same shape as the per-order export (see Exports). This is the audit view: any single order can be inspected end-to-end.
- **Export** — See the next section.

### Exports / Downloads

Every results page offers two export formats: **CSV** and **Excel**. Both formats deliver the same two artifacts: the summary and the per-order breakdown. The difference is packaging:

- **CSV**: two separate file downloads — `summary.csv` and `orders.csv`. Typical use: piping into other tools or light editing.
- **Excel**: one `.xlsx` file with two tabs — "Summary" and "Per-Order Breakdown". Typical use: sharing with a client.

Both formats must reflect the current view state (mode, checkbox state, projected period inputs). If the user exports while in Optimized mode with Selery's 6 locations narrowed to 4, the export must describe that configuration explicitly so the document is self-documenting when opened by someone else.

#### Summary Export Structure

The summary file (or Summary tab) includes:

1. **Header block** at the top with a few rows of context:
   - Analysis name
   - Orders analyzed (count)
   - View mode ("Optimized" or "Single-node")
   - Projected period (if set), e.g., "50,000 orders/year"
   - **Network configurations** — for each multi-node provider in Optimized mode, a mini-block listing:
     - The provider name and "N of M locations active"
     - The list of active locations
     - The list of excluded locations (if any)
   - Single-node mode exports omit the Network configurations block (it's not meaningful — every row is a standalone location).

2. **Summary table** as the main body:
   - Columns: `3PL`, `Location(s)`, `Network Config`, `Avg Zone`, `Avg Cost`, `Projected Period Cost`
   - The `Network Config` column reads "Single" for single-location providers, "All N locations" when all checked, or "N of M: <comma-separated location list>" when some are excluded. (In Single-node mode exports, this column can be omitted or populated with "Single-node view" on every row.)
   - One row per provider in Optimized mode. One row per location in Single-node mode.
   - Sorted by Avg Cost ascending.

#### Per-Order Breakdown Export Structure

The per-order file (or Per-Order Breakdown tab) is a wide table — one row per order. Column order:

1. **Order-level columns** (constant): `Order #`, `Actual Weight`, `Dims (L × W × H)`, `Dest ZIP`, `State`, `Billable Weight`, `Billable Unit`
2. **Per-provider column groups**, each ordered consistently:
   - Single-location provider: `<Provider> — <Location> Zone`, `<Provider> — <Location> Cost`
   - Multi-location provider: one pair of columns per location first, then the optimized pair at the end of that provider's group:
     - `<Provider> — <Location 1> Zone`, `<Provider> — <Location 1> Cost`
     - `<Provider> — <Location 2> Zone`, `<Provider> — <Location 2> Cost`
     - ... (one pair per location)
     - `<Provider> (Optimized) Zone`, `<Provider> (Optimized) Cost`, `<Provider> (Optimized) Winning Location`
3. Columns are grouped by provider in the same sort order as the summary table, so Selery's columns are visually contiguous.

**Behavior of the Optimized columns:**
- The Optimized pair reflects the **current checkbox state**. If the user has excluded two of Selery's six locations, the Optimized Zone/Cost columns show the cheapest outcome among only the four included locations, and the Winning Location column will never name one of the excluded locations.
- The excluded locations still appear as columns in the per-order table (their Zone/Cost values are always present for auditability). The export's header block makes clear which were included vs excluded.
- Export format is identical in both view modes. The view mode controls how you look at results in the UI; it does not change what the analysis *is*. Exporting from Single-node mode produces the same wide table, because the per-location columns and the Optimized triple exist regardless.

#### Excluded-Orders Download

Separate from the main exports, the tool offers a download of any orders excluded by Step 1 validation, with the reason for exclusion per order. This is not part of the Summary/Per-Order exports — it is a standalone CSV accessible from the Results view so the user can audit the validation step.

### Share

Generate a shareable read-only link (generates a token, stores in `Analysis.shareable_token`, serves a public results page). The public page reflects the same persisted state (view_mode, excluded_locations, projected_order_count, projected_period) as the user's own view of the analysis — so a link sent to a client renders the exact configuration the consultant committed to.

---

## v2 Features (Do Not Build Yet — But Architect For)

These features are planned for later. v1 code should not block these additions.

- **Multi-rate-card optimization:** A 3PL can have multiple rate cards (e.g., Ground, Priority). "Optimize" mode picks the cheapest rate card per order. Non-optimize mode uses a single selected rate card for all orders.
- **Individual rate card selection mode:** User manually selects which rate card to use for a specific warehouse comparison (not auto-optimized, not all orders — pick one card).
- **Advanced surcharge rules:** Instead of a flat adder, support conditional surcharges (e.g., residential surcharge only for certain ZIP ranges, oversized surcharges based on dims).
- **Carrier-specific zone databases:** Separate zone tables for UPS, FedEx, USPS if zone mappings diverge significantly.
- **Provider metadata / Provider table:** Promote `provider_name` from a flat string to a `Provider` foreign-key relationship with contract terms, contacts, historical performance, etc.
- **Dedicated Network Optimizer screen:** A focused workflow for exploring network configurations (e.g., "find the best 3-of-6 combination of Selery locations") beyond manual checkbox toggling.
- **Auto-suggested projection volume:** Infer orders-per-period from the uploaded order file's implied timeframe (requires parsing order dates) and pre-fill the projected cost input.
- **Client self-serve access:** Login, user management, client-specific analyses.

**V1 scope note:** multi-node provider grouping and Optimized mode are V1 features. Do not defer them. Single-node mode is implemented as a pure view of the same underlying `OrderResult` matrix — it is not a separate calculation path.

---

## File & Folder Structure

```
/shipping-analyzer
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Dashboard
│   │   ├── analysis/
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx    # Analysis workspace
│   │   │   │   └── results/
│   │   │   │       └── page.tsx
│   │   │   └── new/
│   │   │       └── page.tsx
│   │   ├── share/
│   │   │   └── [token]/
│   │   │       └── page.tsx    # Public shareable results
│   │   └── api/
│   │       ├── analyses/
│   │       ├── warehouses/
│   │       ├── orders/
│   │       ├── rate-cards/
│   │       ├── zones/
│   │       ├── calculate/
│   │       └── export/         # Summary + per-order CSV/Excel generation
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle schema definitions
│   │   │   ├── index.ts        # DB connection
│   │   │   └── migrations/
│   │   ├── engine/
│   │   │   ├── zone-lookup.ts
│   │   │   ├── weight-calc.ts
│   │   │   ├── rate-lookup.ts
│   │   │   ├── surcharge.ts
│   │   │   ├── aggregation.ts      # Step 6 — per-warehouse aggregates
│   │   │   ├── optimized.ts        # Step 7 — provider grouping + winner selection (pure function)
│   │   │   └── index.ts            # Orchestrates full calculation
│   │   ├── parsers/
│   │   │   ├── order-parser.ts
│   │   │   ├── rate-card-parser.ts
│   │   │   └── zone-chart-parser.ts  # For advanced manual override only
│   │   ├── export/
│   │   │   ├── summary-export.ts       # Builds summary rows + header block
│   │   │   ├── per-order-export.ts     # Builds wide per-order table
│   │   │   ├── csv-writer.ts
│   │   │   └── xlsx-writer.ts          # SheetJS multi-tab workbook
│   │   └── utils/
│   │       └── zip.ts          # ZIP code normalization, etc.
│   ├── components/
│   │   ├── ui/                 # Reusable UI primitives
│   │   ├── dashboard/
│   │   ├── analysis/
│   │   ├── upload/
│   │   └── results/
│   │       ├── HeaderStatsBar.tsx
│   │       ├── ModeToggle.tsx
│   │       ├── SummaryTable.tsx
│   │       ├── ProviderRow.tsx           # Optimized-mode expandable row
│   │       ├── LocationSubRow.tsx        # Checkbox + location detail
│   │       ├── NodeUtilizationStrip.tsx  # Inline utilization summary
│   │       └── ExportButtons.tsx
│   └── types/
│       └── index.ts            # Shared TypeScript types
├── scripts/
│   └── seed-zones.ts           # One-time USPS zone data seeder
├── tests/
│   ├── engine/
│   │   ├── weight-calc.test.ts
│   │   ├── zone-lookup.test.ts
│   │   ├── rate-lookup.test.ts
│   │   ├── optimized.test.ts   # Step 7: grouping, winner selection, utilization, edge cases
│   │   └── integration.test.ts # End-to-end calc with known data
│   └── parsers/
├── data/
│   └── zone-seeds/             # Reserved for any manual zone overrides
├── db/
│   └── shipping-analyzer.db    # SQLite database file (gitignored)
├── drizzle.config.ts
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── BACKLOG.md                  # Deferred features and improvements
└── README.md
```

---

## Testing Requirements

The calculation engine MUST have comprehensive tests. For every business logic function:

- **Weight calculation tests:** Cover all three weight_unit_modes. Test edge cases: exactly 1.0 lbs, 0.99 lbs, 1.01 lbs, 16 oz boundary, fractional oz, dim weight exceeding actual weight, dim weight less than actual weight.
- **Zone lookup tests:** Valid lookup, missing zone (should error not default), ZIP normalization (left-padding).
- **Rate lookup tests:** Exact match, weight exceeding max rate card entry, missing zone in rate card.
- **Optimized-mode tests (Step 7):**
  - Single-location provider: optimized result equals single-node result.
  - Multi-location provider with all locations included: winner-per-order matches the minimum total_cost across the group; aggregates compute correctly.
  - Excluded locations: optimized result reflects only included locations; excluded locations cannot appear as winners.
  - Tiebreaking: when two locations produce the same total_cost for an order, the lower warehouse_id wins (deterministic).
  - Edge case: 1 of M included — optimized result equals that one location's result.
  - Edge case: 0 of M included — provider group is hidden; no computation.
  - Node utilization: percentages sum to 100% across included locations; excluded locations have 0%.
- **Export tests:**
  - Summary export in Optimized mode includes the Network Configurations header block.
  - Summary export in Single-node mode omits the Network Configurations block.
  - Per-order export in both modes has identical column structure.
  - Per-order Optimized columns respect current checkbox state (excluded locations can be columns, but are never winners).
- **Integration test:** Take 10-15 orders from the sample spreadsheet provided, configure the same warehouse/rate card, and verify the tool produces the EXACT same costs as the spreadsheet. This is the acceptance test.

---

## Sample Data for Validation

Use this known-good data from the user's existing spreadsheet to validate calculations:

**Warehouse: Kase, Milwaukee, WI (ZIP 53154)**
**Rate Card: Atomix Ground (oz 1-16, lbs 1-7+, zones 1-8)**

| Order | Actual Wt (lbs) | Dims | Dest ZIP | Expected Zone | Expected Billable | Expected Unit | Expected Cost |
|---|---|---|---|---|---|---|---|
| 0001 | 0.39 | 3.5×5.75×6 | 04021 | 5 | 7 | oz | $4.57 |
| 0002 | 0.937 | 5×5×12 | 77077 | 6 | 15 | oz | $6.29 |
| 0004 | 2.795 | 9×12×12 | 80908 | 5 | 3 | lbs | $7.30 |
| 0005 | 0.743 | 4×6×8 | 85387 | 7 | 12 | oz | $5.98 |
| 0007 | 1.001 | 5×6×11 | 54011 | 3 | 2 | lbs | $5.68 |
| 0008 | 0.981 | 4×8×10 | 49505 | 2 | 16 | oz | $5.72 |

These values must be reproduced exactly by the calculation engine. Any discrepancy indicates a bug.

**Note on zone validation:** The expected zones above were derived from UPS zone charts. Since the app uses USPS zones (confirmed interchangeable for 3PL rate card purposes), most values should match exactly. If a zone differs by 1 at a boundary, document the discrepancy and verify against the USPS zone chart for that origin/destination pair.

---

## Notes on Data Integrity ("Authentication Layer")

The user's use of "authentication" refers to data integrity, not user login. This means:

- **Every calculation must follow explicit, deterministic rules.** No fuzzy logic, no AI inference on business logic. This extends to optimized-mode winner selection: ties are broken by a documented, deterministic rule (lowest warehouse_id).
- **All edge cases must error loudly** rather than silently produce wrong results. A missing zone, an unmatched rate, or an unparseable weight should be flagged clearly in the UI with the specific order and issue.
- **Calculation audit trail:** Each OrderResult should store enough detail (zone used, billable weight, which rate card entry matched, surcharge applied) that a user could manually verify any single order's cost. The per-order export surfaces this trail at the row level, including which location won an optimized comparison.
- **No silent data loss:** If an uploaded file has 1,000 orders and 3 fail to parse, the UI should show "997 orders imported, 3 failed" with details on the failures. Never silently drop rows.
- **No silent configuration drift:** When any view mode or network configuration changes the numbers on screen, the exports and the shareable link must reflect that exact state. The Network Configurations header block in the summary export exists precisely to prevent configurations from being invisible when a report is opened by someone else.
