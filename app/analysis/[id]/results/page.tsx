'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import type { TplSummary } from '@/types'

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

interface ResultsData {
  tplSummaries: TplSummary[]
  includedOrders: number
  excludedOrders: number
  excluded: Array<{ orderId: number; orderNumber: string; reason: string }>
  warnings: string[]
}

export default function ResultsPage() {
  const params = useParams()
  const analysisId = parseInt(params.id as string)
  const [data, setData] = useState<ResultsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedTpls, setExpandedTpls] = useState<Set<number>>(new Set())
  const [showExcluded, setShowExcluded] = useState(false)

  useEffect(() => {
    fetch(`/api/analyses/${analysisId}/results`)
      .then(r => r.json())
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [analysisId])

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  function toggleExpand(tplId: number) {
    const next = new Set(expandedTpls)
    if (next.has(tplId)) next.delete(tplId)
    else next.add(tplId)
    setExpandedTpls(next)
  }

  function downloadSummaryCsv() {
    if (!data) return
    const sorted = [...data.tplSummaries].sort((a, b) => a.avgCostCents - b.avgCostCents)
    const highest = sorted[sorted.length - 1]?.avgCostCents ?? 0
    const rows = [
      ['Rank', '3PL', 'Multi-node', 'Orders', 'Avg Cost', 'Total Cost', 'Savings vs Highest'],
      ...sorted.map((s, i) => [
        i + 1,
        s.tplName,
        s.multiNodeEnabled ? 'yes' : 'no',
        s.orderCount,
        (s.avgCostCents / 100).toFixed(2),
        (s.totalCostCents / 100).toFixed(2),
        ((highest - s.avgCostCents) / 100).toFixed(2),
      ]),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'summary.csv'
    a.click()
  }

  return (
    <div>
      <div className="mb-6">
        <a href={`/analysis/${analysisId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to Analysis
        </a>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Results</h1>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : !data || data.tplSummaries.length === 0 ? (
        <p className="text-sm text-gray-500">
          No results yet. Go to the{' '}
          <a href={`/analysis/${analysisId}`} className="text-blue-600 hover:underline">
            analysis workspace
          </a>{' '}
          and run the analysis.
        </p>
      ) : (
        <div className="space-y-6">
          {/* Banner */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              <strong>{data.includedOrders}</strong> orders compared
            </span>
            {data.excludedOrders > 0 && (
              <button
                onClick={() => setShowExcluded(!showExcluded)}
                className="text-amber-600 underline hover:text-amber-800"
              >
                {data.excludedOrders} excluded {showExcluded ? '▲' : '▼'}
              </button>
            )}
          </div>

          {showExcluded && data.excludedOrders > 0 && (
            <Card title={`Excluded Orders (${data.excludedOrders})`}>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 pr-6 font-medium text-gray-700">Order #</th>
                      <th className="text-left py-2 font-medium text-gray-700">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.excluded.map(e => (
                      <tr key={e.orderId} className="border-b border-gray-100">
                        <td className="py-1.5 pr-6 font-mono">{e.orderNumber}</td>
                        <td className="py-1.5 text-red-600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Summary table */}
          {(() => {
            const sorted = [...data.tplSummaries].sort((a, b) => a.avgCostCents - b.avgCostCents)
            const highest = sorted[sorted.length - 1]?.avgCostCents ?? 0

            const allZones = [...new Set(
              sorted.flatMap(s => Object.keys(s.zoneDistribution).map(Number))
            )].sort((a, b) => a - b)

            const zoneDistChartData = allZones.map(zone => {
              const entry: Record<string, string | number> = { zone: `Z${zone}` }
              for (const s of sorted) {
                const count = s.zoneDistribution[zone] ?? 0
                entry[s.tplName] = s.orderCount > 0 ? Math.round((count / s.orderCount) * 100) : 0
              }
              return entry
            })

            const costByZoneChartData = allZones.map(zone => {
              const entry: Record<string, string | number> = { zone: `Z${zone}` }
              for (const s of sorted) {
                entry[s.tplName] = s.avgCostByZone[zone] != null
                  ? parseFloat((s.avgCostByZone[zone] / 100).toFixed(2))
                  : 0
              }
              return entry
            })

            return (
              <>
                <Card title="Cost Comparison">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 pr-4 font-medium text-gray-700 w-24">Rank</th>
                          <th className="text-left py-2 pr-4 font-medium text-gray-700">3PL</th>
                          <th className="text-right py-2 pr-4 font-medium text-gray-700">Avg Cost</th>
                          <th className="text-right py-2 pr-4 font-medium text-gray-700">Total Cost</th>
                          <th className="text-right py-2 pr-4 font-medium text-gray-700">Orders</th>
                          <th className="text-right py-2 font-medium text-gray-700">Savings vs Highest</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((s, i) => {
                          const isExpanded = expandedTpls.has(s.tplId)
                          const savings = highest - s.avgCostCents
                          return (
                            <>
                              <tr
                                key={s.tplId}
                                className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${i === 0 ? 'bg-green-50' : ''}`}
                                onClick={() => toggleExpand(s.tplId)}
                              >
                                <td className="py-2 pr-4">
                                  {i === 0 ? (
                                    <Badge color="green">#1 Lowest</Badge>
                                  ) : (
                                    <span className="text-gray-500">#{i + 1}</span>
                                  )}
                                </td>
                                <td className="py-2 pr-4 font-medium">
                                  <span className="mr-2">{s.tplName}</span>
                                  {s.multiNodeEnabled && s.locationSummaries.length > 1 && (
                                    <Badge color="blue">Multi-node</Badge>
                                  )}
                                  <span className="ml-2 text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                                </td>
                                <td className="py-2 pr-4 text-right font-mono">{formatCents(s.avgCostCents)}</td>
                                <td className="py-2 pr-4 text-right font-mono">{formatCents(s.totalCostCents)}</td>
                                <td className="py-2 pr-4 text-right">{s.orderCount}</td>
                                <td className="py-2 text-right font-mono text-green-600">
                                  {savings > 0 ? `+${formatCents(savings)}` : '—'}
                                </td>
                              </tr>
                              {isExpanded && s.locationSummaries.map(loc => (
                                <tr key={loc.locationId} className="border-b border-gray-50 bg-gray-50/50">
                                  <td className="py-1.5 pr-4 pl-6 text-gray-400 text-xs">↳</td>
                                  <td className="py-1.5 pr-4 text-sm text-gray-600">
                                    {loc.locationName}
                                    <span className="ml-2 font-mono text-xs text-gray-400">{loc.originZip3}</span>
                                  </td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-sm text-gray-600">
                                    {loc.orderCount > 0 ? formatCents(loc.avgCostCents) : '—'}
                                  </td>
                                  <td className="py-1.5 pr-4 text-right font-mono text-sm text-gray-600">
                                    {loc.orderCount > 0 ? formatCents(loc.totalCostCents) : '—'}
                                  </td>
                                  <td className="py-1.5 pr-4 text-right text-sm text-gray-600">{loc.orderCount}</td>
                                  <td className="py-1.5" />
                                </tr>
                              ))}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {zoneDistChartData.length > 0 && (
                  <Card title="Zone Distribution (% of orders)">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={zoneDistChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => typeof v === 'number' ? `${v}%` : `${v}`} />
                        <Legend />
                        {sorted.map((s, i) => (
                          <Bar key={s.tplId} dataKey={s.tplName} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {costByZoneChartData.length > 0 && (
                  <Card title="Avg Cost by Zone">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={costByZoneChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="zone" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v) => typeof v === 'number' ? `$${v.toFixed(2)}` : `${v}`} />
                        <Legend />
                        {sorted.map((s, i) => (
                          <Bar key={s.tplId} dataKey={s.tplName} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={downloadSummaryCsv}>
                    Download Summary CSV
                  </Button>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
