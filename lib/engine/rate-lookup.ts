import { RateCardEntry, WeightUnit } from '@/types'

export type RateLookupResult =
  | { ok: true; priceCents: number; entryId: number; matchedWeightValue: number }
  | { ok: false; error: string }

/**
 * Looks up the rate for a given billable weight and zone.
 * Finds the entry with the smallest weight_value >= billableWeightValue
 * for the given unit and zone. Handles both integer and decimal weight tiers.
 */
export function lookupRate(
  billableWeightValue: number,
  billableWeightUnit: WeightUnit,
  zone: number,
  entries: RateCardEntry[]
): RateLookupResult {
  const candidates = entries
    .filter(e => e.weightUnit === billableWeightUnit && e.zone === zone)
    .sort((a, b) => a.weightValue - b.weightValue)

  if (candidates.length === 0) {
    return { ok: false, error: `No rate card entries for unit=${billableWeightUnit} zone=${zone}` }
  }

  // Find the smallest entry where weight_value >= billableWeightValue
  const match = candidates.find(e => e.weightValue >= billableWeightValue)
  if (match) {
    return { ok: true, priceCents: match.priceCents, entryId: match.id, matchedWeightValue: match.weightValue }
  }

  const maxEntry = candidates[candidates.length - 1]
  return {
    ok: false,
    error: `Weight ${billableWeightValue}${billableWeightUnit} exceeds max rate card entry of ${maxEntry.weightValue}${maxEntry.weightUnit} for zone ${zone}`
  }
}
