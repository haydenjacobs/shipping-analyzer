import type { Analysis, Warehouse } from '@/types'

type AnalysisRow = {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'complete'
  shareableToken: string | null
  viewMode: 'optimized' | 'single_node'
  excludedLocations: string
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
}

/** Parse the JSON-text excluded_locations column into a number[] and shape the
 * analysis row for API responses. */
export function serializeAnalysis(row: AnalysisRow): Analysis {
  let excluded: number[] = []
  try {
    const parsed = JSON.parse(row.excludedLocations)
    if (Array.isArray(parsed)) excluded = parsed.filter((n): n is number => Number.isInteger(n))
  } catch {
    // stored column is always JSON text per the default '[]', but be defensive
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    shareableToken: row.shareableToken,
    viewMode: row.viewMode,
    excludedLocations: excluded,
    projectedOrderCount: row.projectedOrderCount,
    projectedPeriod: row.projectedPeriod,
  }
}

export function serializeWarehouse(row: Warehouse): Warehouse {
  return row
}
