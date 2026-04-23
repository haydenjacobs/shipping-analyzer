# Backlog

Deferred features and improvements. Not in v1 scope.

---

## Rate Card / Provider

**Rate card drift detection across a provider's locations.**
Today rate cards fan out identically per upload. Nothing enforces that they stay in sync if an edge case (future import bug, manual DB edit, partial fan-out failure retry) creates divergence. When the Provider table is introduced in v2, add an entry-hash comparison and flag providers whose locations have diverged rate cards.

**Promote rate cards to a shared entity in v2.**
When the Provider table is introduced, reconsider the copy-fan-out pattern. A `provider_rate_cards` + `warehouse_rate_card_overrides` pattern is a cleaner data model once per-location overrides become a real use case.

**Surface "rate card is provider-wide" framing explicitly.**
Today the UI presents it implicitly (no per-location rate card upload exists). If v2 introduces per-location overrides, the UI will need explicit "Provider default" vs "Location override" framing.

---

## v2 Features

- **Multi-rate-card optimization:** A 3PL can have multiple rate cards (e.g., Ground, Priority). "Optimize" mode picks the cheapest rate card per order.
- **Individual rate card selection mode:** User manually selects which rate card to use for a specific warehouse comparison.
- **Advanced surcharge rules:** Conditional surcharges (e.g., residential surcharge only for certain ZIP ranges, oversized surcharges based on dims).
- **Carrier-specific zone databases:** Separate zone tables for UPS, FedEx, USPS if zone mappings diverge significantly.
- **Provider metadata / Provider table:** Promote `provider_name` from a flat string to a `Provider` foreign-key relationship with contract terms, contacts, historical performance.
- **Dedicated Network Optimizer screen:** A focused workflow for exploring network configurations (e.g., "find the best 3-of-6 combination of Selery locations") beyond manual checkbox toggling.
- **Auto-suggested projection volume:** Infer orders-per-period from the uploaded order file's implied timeframe and pre-fill the projected cost input.
- **Client self-serve access:** Login, user management, client-specific analyses.

---

## Known V1 Compromises

**Billable Weight column in detailed breakdown uses the first warehouse's value.**
`lib/results/derive-per-order-table.ts` takes billable weight from the first warehouse result and treats it as an order-level constant. When two warehouses have different dim-weight settings, their billable weights can differ per order. The per-warehouse Zone/Cost columns are the real audit surface; the constant Billable Weight column is a known approximation. Acceptable for the vast majority of real cases (dim settings rarely diverge within a provider group).

**Results route loads full OrderResult matrix into memory on every request.**
`app/api/analyses/[id]/results/route.ts` fetches all order results in one query — fine for typical analyses (hundreds to low-thousands of orders × a handful of warehouses), but needs pagination or streaming for very large analyses. Flagged in a comment in the route.

**Share page has no dark-mode CSS.**
The public share page renders correctly in light mode but is near-unreadable when the user's OS is in dark mode — text colors stay dark while the browser applies a dark background. Tailwind dark-mode variants need to be added to the share page layout and `ResultsContent` when rendered in readonly mode.

---

## Code Notes (found during v1 finalization)

**`excluded_locations` as JSON text instead of a join table.**
Stored in `analyses.excluded_locations` as a JSON array of warehouse IDs. Fine for v1. If v2 needs relational integrity (e.g., "which analyses exclude warehouse X"), promote to a join table. Documented in `lib/db/schema.ts`.
