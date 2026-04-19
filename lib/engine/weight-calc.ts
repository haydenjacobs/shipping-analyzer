import { WeightUnit, WeightUnitMode } from '@/types'

export interface WeightCalcInput {
  actualWeightLbs: number
  height?: number | null
  width?: number | null
  length?: number | null
  dimWeightEnabled: boolean
  dimFactor?: number | null
  weightUnitMode: WeightUnitMode
}

export type WeightCalcResult =
  | { ok: true; billableWeightValue: number; billableWeightUnit: WeightUnit; dimWeightLbs: number | null; effectiveWeightLbs: number }
  | { ok: false; error: string }

/**
 * Ceiling division: always rounds up to next integer.
 * Math.ceil(7.0) = 7, Math.ceil(7.1) = 8
 */
function ceilWeight(value: number): number {
  return Math.ceil(value)
}

export function calculateBillableWeight(input: WeightCalcInput): WeightCalcResult {
  const { actualWeightLbs, dimWeightEnabled, dimFactor, weightUnitMode } = input

  // Step 1: Dimensional weight
  let dimWeightLbs: number | null = null
  if (dimWeightEnabled && dimFactor && input.length && input.width && input.height) {
    dimWeightLbs = (input.length * input.width * input.height) / dimFactor
  }

  const effectiveWeightLbs = dimWeightLbs != null
    ? Math.max(actualWeightLbs, dimWeightLbs)
    : actualWeightLbs

  // Step 2: Mode-specific weight calculation
  if (weightUnitMode === 'oz_then_lbs') {
    if (effectiveWeightLbs <= 1.0) {
      // Use oz rows. "= 1.0 exactly" maps to 16oz per spec.
      const weightOz = effectiveWeightLbs * 16
      const billableOz = ceilWeight(weightOz)
      // Sanity: should never exceed 16oz for weight <= 1.0 lbs
      if (billableOz > 16) {
        return { ok: false, error: `Unexpected: billable oz ${billableOz} exceeds 16 for weight <= 1.0 lbs` }
      }
      return { ok: true, billableWeightValue: billableOz, billableWeightUnit: 'oz', dimWeightLbs, effectiveWeightLbs }
    } else {
      // Use lbs rows
      const billableLbs = ceilWeight(effectiveWeightLbs)
      return { ok: true, billableWeightValue: billableLbs, billableWeightUnit: 'lbs', dimWeightLbs, effectiveWeightLbs }
    }
  }

  if (weightUnitMode === 'lbs_only') {
    const billableLbs = Math.max(1, ceilWeight(effectiveWeightLbs))
    return { ok: true, billableWeightValue: billableLbs, billableWeightUnit: 'lbs', dimWeightLbs, effectiveWeightLbs }
  }

  if (weightUnitMode === 'oz_only') {
    const weightOz = effectiveWeightLbs * 16
    const billableOz = ceilWeight(weightOz)
    return { ok: true, billableWeightValue: billableOz, billableWeightUnit: 'oz', dimWeightLbs, effectiveWeightLbs }
  }

  return { ok: false, error: `Unknown weightUnitMode: ${weightUnitMode}` }
}
