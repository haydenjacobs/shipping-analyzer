import { sqliteTable, text, integer, real, unique, index } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Analyses ──────────────────────────────────────────────────────────────────
// Top-level container for a shipping cost analysis session.
export const analyses = sqliteTable('analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  status: text('status', { enum: ['draft', 'complete'] }).notNull().default('draft'),
  shareableToken: text('shareable_token'),
  // Results view preferences — persisted per-analysis so the shareable link and
  // return visits render the exact configuration the user committed to.
  viewMode: text('view_mode', { enum: ['optimized', 'single_node'] }).notNull().default('optimized'),
  // JSON array of warehouse IDs excluded from Optimized-mode aggregation.
  // Stored as text because SQLite has no native array type; Drizzle gives us typed
  // access via JSON.parse at the edges. If v2 needs relational integrity on this
  // (e.g. querying "which analyses exclude warehouse X"), promote to a join table.
  excludedLocations: text('excluded_locations').notNull().default('[]'),
  projectedOrderCount: integer('projected_order_count'),
  projectedPeriod: text('projected_period', { enum: ['month', 'year'] }).notNull().default('year'),
})

// ─── Warehouses ────────────────────────────────────────────────────────────────
// A single physical warehouse (fulfillment node). provider_name is a flat string —
// grouping by provider for Optimized-mode is done at query time. Spec §"Notes on
// the data model" explicitly defers a Provider table to v2.
export const warehouses = sqliteTable('warehouses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  analysisId: integer('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  providerName: text('provider_name').notNull(),
  locationLabel: text('location_label').notNull(),
  originZip: text('origin_zip').notNull(),
  originZip3: text('origin_zip3').notNull(),
  dimWeightEnabled: integer('dim_weight_enabled', { mode: 'boolean' }).notNull().default(false),
  dimFactor: integer('dim_factor'),
  // Money as integer cents (deviation from spec's "decimal") — avoids float drift
  // across thousands of orders. UI formats on render. See AGENTS.md deviations.
  surchargeFlatCents: integer('surcharge_flat_cents').notNull().default(0),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  analysisIdIdx: index('warehouses_analysis_id_idx').on(table.analysisId),
}))

// ─── Rate Cards ────────────────────────────────────────────────────────────────
export const rateCards = sqliteTable('rate_cards', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  weightUnitMode: text('weight_unit_mode', { enum: ['oz_only', 'lbs_only', 'oz_then_lbs'] }).notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
})

// ─── Rate Card Entries ─────────────────────────────────────────────────────────
// One row per (weight tier × zone) price.
export const rateCardEntries = sqliteTable('rate_card_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  rateCardId: integer('rate_card_id').notNull().references(() => rateCards.id, { onDelete: 'cascade' }),
  // real (not integer) to support decimal tiers like 15.99 oz if a carrier uses them.
  weightValue: real('weight_value').notNull(),
  weightUnit: text('weight_unit', { enum: ['oz', 'lbs'] }).notNull(),
  zone: integer('zone').notNull(),
  priceCents: integer('price_cents').notNull(),
})

// ─── Zone Maps ─────────────────────────────────────────────────────────────────
// USPS domestic zone chart; seeded from scripts/seed-zones.ts (~700-900K rows).
// Analysis-independent reference data.
export const zoneMaps = sqliteTable('zone_maps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  originZip3: text('origin_zip3').notNull(),
  destZip3: text('dest_zip3').notNull(),
  zone: integer('zone').notNull(),
}, (table) => ({
  originDestUnique: unique('zone_maps_origin_dest').on(table.originZip3, table.destZip3),
}))

// ─── Orders ────────────────────────────────────────────────────────────────────
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  analysisId: integer('analysis_id').notNull().references(() => analyses.id, { onDelete: 'cascade' }),
  orderNumber: text('order_number').notNull(),
  destZip: text('dest_zip').notNull(),
  destZip3: text('dest_zip3').notNull(),
  actualWeightLbs: real('actual_weight_lbs').notNull(),
  height: real('height'),
  width: real('width'),
  length: real('length'),
  state: text('state'),
}, (table) => ({
  analysisIdIdx: index('orders_analysis_id_idx').on(table.analysisId),
}))

// ─── Order Results ─────────────────────────────────────────────────────────────
// Per-order-per-warehouse calculated costs. Only *valid* results live here —
// validation failures go to excluded_orders. This matches the spec's
// "Authentication Layer" / data integrity section: each row is a complete,
// auditable calculation trail (zone, billable weight, which rate card entry
// matched, surcharge applied).
export const orderResults = sqliteTable('order_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  warehouseId: integer('warehouse_id').notNull().references(() => warehouses.id, { onDelete: 'cascade' }),
  zone: integer('zone').notNull(),
  billableWeightValue: real('billable_weight_value').notNull(),
  billableWeightUnit: text('billable_weight_unit', { enum: ['oz', 'lbs'] }).notNull(),
  dimWeightLbs: real('dim_weight_lbs'),
  rateCardId: integer('rate_card_id').notNull().references(() => rateCards.id, { onDelete: 'cascade' }),
  baseCostCents: integer('base_cost_cents').notNull(),
  surchargeCents: integer('surcharge_cents').notNull(),
  totalCostCents: integer('total_cost_cents').notNull(),
  calculationNotes: text('calculation_notes'),
}, (table) => ({
  orderIdIdx: index('order_results_order_id_idx').on(table.orderId),
  warehouseIdIdx: index('order_results_warehouse_id_idx').on(table.warehouseId),
}))

// ─── Excluded Orders ───────────────────────────────────────────────────────────
// Orders that failed Step 1 validation (or Step 3/4 rate card limit checks).
// Separate table instead of is_valid/error_reason columns on order_results —
// keeps order_results as a "these costs are real" source of truth and gives
// us a clean place to surface the excluded-orders CSV download.
//
// warehouseId is nullable: null means "excluded from the entire analysis"
// (per spec's consistency rule — if invalid for any warehouse, excluded from
// all). When populated, it identifies the specific warehouse that triggered
// the exclusion (useful for the audit CSV).
export const excludedOrders = sqliteTable('excluded_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  warehouseId: integer('warehouse_id').references(() => warehouses.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  details: text('details'),
})

// ─── App Metadata ──────────────────────────────────────────────────────────────
// Simple key/value store (e.g. zone-seed version, last-seeded-at).
export const appMetadata = sqliteTable('app_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
