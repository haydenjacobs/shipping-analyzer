export interface ExcludedOrderRow {
  orderId: number
  orderNumber: string
  destZip: string
  actualWeightLbs: number
  reason: string
  details: string | null
}

export function buildExcludedOrdersCsv(rows: ExcludedOrderRow[]): string {
  const header = 'order_number,dest_zip,actual_weight_lbs,reason,details'
  const body = rows
    .map((r) =>
      [r.orderNumber, r.destZip, r.actualWeightLbs, r.reason, r.details ?? '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')
  return header + '\n' + body
}

export function downloadExcludedOrdersCsv(rows: ExcludedOrderRow[], filename = 'excluded-orders.csv') {
  const csv = buildExcludedOrdersCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}
