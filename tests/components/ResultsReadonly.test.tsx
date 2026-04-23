// @vitest-environment jsdom
/**
 * Tests for readonly mode in ResultsContent, SummaryTable, and HeaderStatsBar.
 * Verifies that interactive controls are absent when readonly=true and present
 * when readonly=false.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryTable } from '@/components/results/SummaryTable'
import { HeaderStatsBar } from '@/components/results/HeaderStatsBar'
import type { TableModel } from '@/lib/results/derive-table'

const singleModel: TableModel = {
  rows: [
    {
      kind: 'single',
      key: 'wh-1',
      providerName: 'Alpha',
      locationLabel: 'East',
      warehouseId: 1,
      avgZone: 4.0,
      avgCostCents: 600,
    },
  ],
  winnerKey: 'wh-1',
}

const multiModel: TableModel = {
  rows: [
    {
      kind: 'provider',
      key: 'p-Selery',
      providerName: 'Selery',
      avgZone: 4.5,
      avgCostCents: 700,
      allExcluded: false,
      totalLocations: 2,
      includedWarehouseIds: [1, 2],
      nodeUtilization: { 1: 60, 2: 40 },
      locations: [
        { warehouseId: 1, locationLabel: 'Reno, NV', included: true, avgZone: 4.0, avgCostCents: 650 },
        { warehouseId: 2, locationLabel: 'Lancaster, CA', included: true, avgZone: 5.0, avgCostCents: 750 },
      ],
    },
  ],
  winnerKey: 'p-Selery',
}

// ─── SummaryTable readonly ───────────────────────────────────────────────────

describe('SummaryTable readonly=true', () => {
  it('renders rows without checkboxes', () => {
    render(
      <SummaryTable
        model={singleModel}
        onToggleLocation={() => {}}
        projectedOrderCount={null}
        projectedPeriod="year"
        readonly={true}
      />,
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('renders provider rows normally (expand still works read-only)', () => {
    render(
      <SummaryTable
        model={multiModel}
        onToggleLocation={() => {}}
        projectedOrderCount={null}
        projectedPeriod="year"
        readonly={true}
      />,
    )
    // Provider label should still be visible
    expect(screen.getByText(/Selery/)).toBeDefined()
  })
})

describe('SummaryTable readonly=false', () => {
  it('does not show checkboxes for single-location rows (no sub-rows to expand)', () => {
    render(
      <SummaryTable
        model={singleModel}
        onToggleLocation={() => {}}
        projectedOrderCount={null}
        projectedPeriod="year"
        readonly={false}
      />,
    )
    // Single rows have no checkbox — only provider rows with sub-rows have them
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})

// ─── HeaderStatsBar readonly ─────────────────────────────────────────────────

const headerBaseProps = {
  orderCount: 1234,
  warehouseCount: 5,
  mode: 'optimized' as const,
  onModeChange: () => {},
  projectedOrderCount: null,
  projectedPeriod: 'year' as const,
  onProjectedOrderCountChange: () => {},
  onProjectedPeriodChange: () => {},
}

describe('HeaderStatsBar readonly=true', () => {
  it('shows order count text', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={true} />)
    expect(screen.getByText(/1,234/)).toBeDefined()
  })

  it('does not render the mode toggle input', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={true} />)
    // ModeToggle is a pill with radio-style buttons — check for its button elements
    expect(screen.queryByRole('button', { name: /Optimized/i })).toBeNull()
  })

  it('does not render the projected count input', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={true} />)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByLabelText('Orders per period')).toBeNull()
  })

  it('shows static mode label', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={true} />)
    expect(screen.getByText('Optimized')).toBeDefined()
  })

  it('shows projected cost static label when projectedOrderCount is set', () => {
    render(
      <HeaderStatsBar
        {...headerBaseProps}
        projectedOrderCount={50000}
        projectedPeriod="year"
        readonly={true}
      />,
    )
    expect(screen.getByText(/50,000 orders\/year/)).toBeDefined()
  })
})

describe('HeaderStatsBar readonly=false (default)', () => {
  it('renders the projected count input', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={false} />)
    expect(screen.getByLabelText('Orders per period')).toBeDefined()
  })

  it('renders the period selector', () => {
    render(<HeaderStatsBar {...headerBaseProps} readonly={false} />)
    expect(screen.getByLabelText('Projected period')).toBeDefined()
  })
})
