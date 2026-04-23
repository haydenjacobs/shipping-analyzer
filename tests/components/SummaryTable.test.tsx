// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryTable } from '@/components/results/SummaryTable'
import type { TableModel } from '@/lib/results/derive-table'

const model: TableModel = {
  rows: [
    {
      kind: 'single',
      key: 'wh-1',
      providerName: 'Alpha',
      locationLabel: 'East',
      warehouseId: 1,
      avgZone: 4.0,
      avgCostCents: 500,
    },
  ],
  winnerKey: 'wh-1',
}

describe('SummaryTable projected cost column', () => {
  it('shows Projected/Yr column when projectedOrderCount is set', () => {
    render(
      <SummaryTable
        model={model}
        onToggleLocation={() => {}}
        projectedOrderCount={50000}
        projectedPeriod="year"
      />,
    )
    expect(screen.getByText('Projected/Yr')).toBeDefined()
    // $5.00 avg × 50000 = $250,000.00
    expect(screen.getByText('$250,000.00')).toBeDefined()
  })

  it('shows Projected/Mo when period is month', () => {
    render(
      <SummaryTable
        model={model}
        onToggleLocation={() => {}}
        projectedOrderCount={1000}
        projectedPeriod="month"
      />,
    )
    expect(screen.getByText('Projected/Mo')).toBeDefined()
  })

  it('hides projected column when projectedOrderCount is null', () => {
    render(
      <SummaryTable
        model={model}
        onToggleLocation={() => {}}
        projectedOrderCount={null}
        projectedPeriod="year"
      />,
    )
    expect(screen.queryByText('Projected/Yr')).toBeNull()
    expect(screen.queryByText('Projected/Mo')).toBeNull()
  })

  it('hides projected column when projectedOrderCount is 0', () => {
    render(
      <SummaryTable
        model={model}
        onToggleLocation={() => {}}
        projectedOrderCount={0}
        projectedPeriod="year"
      />,
    )
    expect(screen.queryByText('Projected/Yr')).toBeNull()
  })
})
