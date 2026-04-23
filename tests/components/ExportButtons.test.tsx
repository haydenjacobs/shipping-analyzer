// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportButtons } from '@/components/results/ExportButtons'
import type { TableModel } from '@/lib/results/derive-table'
import type { PerOrderTableResult } from '@/lib/results/derive-per-order-table'

const model: TableModel = {
  rows: [
    {
      kind: 'single',
      key: 'wh-1',
      providerName: 'A',
      locationLabel: 'East',
      warehouseId: 1,
      avgZone: 4.2,
      avgCostCents: 500,
    },
  ],
  winnerKey: 'wh-1',
}

const perOrderTable: PerOrderTableResult = {
  columns: [
    { key: 'order-number', header: 'Order #', kind: 'order-number' },
    { key: 'dest-zip', header: 'Dest ZIP', kind: 'dest-zip' },
    { key: 'wh-cost-1', header: 'A — East Cost', kind: 'warehouse-cost', warehouseId: 1 },
  ],
  rows: [
    {
      orderId: 1,
      orderNumber: 'O1',
      actualWeightLbs: 1,
      dims: null,
      destZip: '01234',
      state: null,
      billableWeightValue: null,
      billableWeightUnit: null,
      warehouseZones: {},
      warehouseCosts: { 1: 500 },
      optZones: {},
      optCosts: {},
      optWinners: {},
    },
  ],
}

const baseProps = {
  analysisId: 1,
  analysisName: 'Client X',
  orderCount: 1,
  mode: 'single_node' as const,
  projectedOrderCount: null,
  projectedPeriod: 'year' as const,
  excludedWarehouseIds: [],
  warehouses: [],
  model,
  perOrderTable,
}

// Capture download attempts by spying on anchor clicks
function mockDownloads() {
  const filenames: string[] = []
  URL.createObjectURL = vi.fn(() => 'blob:mock')
  URL.revokeObjectURL = vi.fn()
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = origCreate(tag)
    if (tag === 'a') {
      const anchor = el as HTMLAnchorElement
      const origClick = anchor.click.bind(anchor)
      anchor.click = () => {
        filenames.push(anchor.download)
        try { origClick() } catch { /* jsdom may throw */ }
      }
    }
    return el
  })
  return filenames
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('ExportButtons', () => {
  it('renders both export buttons', () => {
    render(<ExportButtons {...baseProps} />)
    expect(screen.getByRole('button', { name: /Export CSV/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export Excel/ })).toBeInTheDocument()
  })

  it('clicking Export CSV triggers two downloads with slugified names', async () => {
    const filenames = mockDownloads()
    render(<ExportButtons {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Export CSV/ }))
    await waitFor(() => expect(filenames.length).toBe(2))
    expect(filenames).toContain('client-x-summary.csv')
    expect(filenames).toContain('client-x-orders.csv')
  })

  it('clicking Export Excel triggers one download', async () => {
    const filenames = mockDownloads()
    render(<ExportButtons {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /Export Excel/ }))
    await waitFor(() => expect(filenames.length).toBe(1))
    expect(filenames[0]).toBe('client-x.xlsx')
  })
})
