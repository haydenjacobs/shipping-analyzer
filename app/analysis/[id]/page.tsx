'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Papa from 'papaparse'
import { detectFileType, fileToParsePayload } from '@/lib/parsers/file-parser-client'
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
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { RateCardUpload } from '@/components/rate-card/RateCardUpload'
import type { Tpl, Location, RateCard, RateCardEntry, TplSummary, LocationSummary } from '@/types'

// ─── Local types ──────────────────────────────────────────────────────────────

interface Analysis {
  id: number
  name: string
  status: 'draft' | 'complete'
}

interface TplWithData extends Tpl {
  locations: Location[]
  rateCards: Array<RateCard & { entries: RateCardEntry[] }>
}

interface CalculationResult {
  includedOrders: number
  excludedOrders: number
  excluded: Array<{ orderId: number; orderNumber: string; reason: string }>
  tplSummaries: TplSummary[]
  warnings: string[]
}

// ─── Price matrix helper (for "View" modal) ───────────────────────────────────

function PriceMatrix({ entries }: { entries: RateCardEntry[] }) {
  const units = ([...new Set(entries.map(e => e.weightUnit))] as Array<'oz' | 'lbs'>).sort()
  if (units.length === 0) return <p className="text-xs text-gray-400">No entries</p>

  return (
    <div className="space-y-4">
      {units.map(unit => {
        const ue = entries.filter(e => e.weightUnit === unit)
        const weights = [...new Set(ue.map(e => e.weightValue))].sort((a, b) => a - b)
        const zones = [...new Set(ue.map(e => e.zone))].sort((a, b) => a - b)
        const priceMap = new Map(ue.map(e => [`${e.weightValue}-${e.zone}`, e.priceCents]))
        return (
          <div key={unit}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{unit}</p>
            <div className="overflow-x-auto">
              <table className="text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-2 py-1 font-medium text-gray-500 text-left w-12">
                      {unit}
                    </th>
                    {zones.map(z => (
                      <th key={z} className="border border-gray-200 px-2 py-1 font-medium text-gray-500 text-center min-w-[3rem]">
                        Z{z}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {weights.map((w, i) => (
                    <tr key={w} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-200 px-2 py-0.5 font-mono text-right text-gray-500">{w}</td>
                      {zones.map(z => {
                        const cents = priceMap.get(`${w}-${z}`)
                        return (
                          <td key={z} className="border border-gray-200 px-2 py-0.5 font-mono text-right text-gray-700">
                            {cents !== undefined ? `$${(cents / 100).toFixed(2)}` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function rateCardSummaryLine(rc: RateCard & { entries: RateCardEntry[] }): string {
  const ozWeights = new Set(rc.entries.filter(e => e.weightUnit === 'oz').map(e => e.weightValue))
  const lbsWeights = new Set(rc.entries.filter(e => e.weightUnit === 'lbs').map(e => e.weightValue))
  const zones = rc.entries.map(e => e.zone)
  const zoneStr = zones.length > 0 ? `zones ${Math.min(...zones)}–${Math.max(...zones)}` : 'no entries'
  const parts: string[] = []
  if (ozWeights.size > 0) parts.push(`${ozWeights.size} oz rows`)
  if (lbsWeights.size > 0) parts.push(`${lbsWeights.size} lbs rows`)
  const rowStr = parts.length > 0 ? ` (${parts.join(' + ')})` : ''
  return `${rc.name} — ${rc.weightUnitMode} — ${rc.entries.length} entries${rowStr}, ${zoneStr}`
}

// ─── Chart colours (one per TPL, cycles if > 8) ───────────────────────────────
const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

// ─── Results View ─────────────────────────────────────────────────────────────

interface ResultsViewProps {
  calcResult: CalculationResult | null
  expandedTpls: Set<number>
  setExpandedTpls: (s: Set<number>) => void
  showExcluded: boolean
  setShowExcluded: (v: boolean) => void
  formatCents: (c: number) => string
}

function ResultsView({
  calcResult,
  expandedTpls,
  setExpandedTpls,
  showExcluded,
  setShowExcluded,
  formatCents,
}: ResultsViewProps) {
  if (!calcResult) {
    return <p className="text-sm text-gray-500">Run the analysis to see results.</p>
  }

  const sorted = [...calcResult.tplSummaries].sort((a, b) => a.avgCostCents - b.avgCostCents)
  const highest = sorted[sorted.length - 1]?.avgCostCents ?? 0

  function toggleExpand(tplId: number) {
    const next = new Set(expandedTpls)
    if (next.has(tplId)) next.delete(tplId)
    else next.add(tplId)
    setExpandedTpls(next)
  }

  // Build zone distribution chart data
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

  function downloadSummaryCsv() {
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
    <div className="space-y-6">
      {/* Included / excluded banner */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-gray-600">
          <strong>{calcResult.includedOrders}</strong> orders compared
        </span>
        {calcResult.excludedOrders > 0 && (
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className="text-amber-600 underline hover:text-amber-800"
          >
            {calcResult.excludedOrders} excluded {showExcluded ? '▲' : '▼'}
          </button>
        )}
      </div>

      {/* Excluded orders (expandable) */}
      {showExcluded && calcResult.excludedOrders > 0 && (
        <Card title={`Excluded Orders (${calcResult.excludedOrders})`}>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-6 font-medium text-gray-700">Order #</th>
                  <th className="text-left py-2 font-medium text-gray-700">Reason</th>
                </tr>
              </thead>
              <tbody>
                {calcResult.excluded.map(e => (
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

      {/* Summary comparison table */}
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

      {/* Zone distribution chart */}
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

      {/* Avg cost by zone chart */}
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

      {/* Export */}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={downloadSummaryCsv}>
          Download Summary CSV
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const params = useParams()
  const analysisId = parseInt(params.id as string)

  // ─── Analysis metadata ───────────────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [activeTab, setActiveTab] = useState<'orders' | '3pls' | 'run' | 'results'>('orders')

  // ─── Order upload ────────────────────────────────────────────────────────────
  const [orderCount, setOrderCount] = useState<number | null>(null)
  const [orderHeaders, setOrderHeaders] = useState<string[]>([])
  // For CSV we still send csvText (legacy path); for Excel we send fileType+fileData.
  // Exactly one of these is set at a time.
  const [orderCsvText, setOrderCsvText] = useState<string | null>(null)
  const [orderFilePayload, setOrderFilePayload] = useState<{
    fileType: 'csv' | 'excel'
    data: string
    filename: string
  } | null>(null)
  const [orderMapping, setOrderMapping] = useState<Record<string, string>>({})
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'oz'>('lbs')
  const [uploadingOrders, setUploadingOrders] = useState(false)
  const [orderParseError, setOrderParseError] = useState<string | null>(null)
  const [orderUploadResult, setOrderUploadResult] = useState<{
    error?: string
    imported?: number
    failed?: number
    errors?: Array<string | { rowIndex: number; reason: string }>
  } | null>(null)

  // ─── TPL management ──────────────────────────────────────────────────────────
  const [tpls, setTpls] = useState<TplWithData[]>([])
  const [showAddTplForm, setShowAddTplForm] = useState(false)
  const [tplForm, setTplForm] = useState({ name: '', notes: '' })
  const [savingTpl, setSavingTpl] = useState(false)

  // Per-TPL sub-forms (one active at a time)
  const [addLocationFor, setAddLocationFor] = useState<number | null>(null)
  const [locationForm, setLocationForm] = useState({ name: '', originZip: '' })
  const [savingLocation, setSavingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const [addRateCardFor, setAddRateCardFor] = useState<number | null>(null)
  const [viewRateCardId, setViewRateCardId] = useState<number | null>(null)

  // TPL settings editing
  const [editSettingsFor, setEditSettingsFor] = useState<number | null>(null)
  const [settingsForm, setSettingsForm] = useState({
    dimWeightEnabled: false,
    dimFactor: '',
    surchargeDollars: '',
    multiNodeEnabled: false,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  // ─── Calculation ─────────────────────────────────────────────────────────────
  const [calcResult, setCalcResult] = useState<CalculationResult | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [expandedTpls, setExpandedTpls] = useState<Set<number>>(new Set())
  const [showExcluded, setShowExcluded] = useState(false)

  // ─── Load on mount ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadAnalysis().then(a => {
      if (a?.status === 'complete') loadResults()
    })
    loadOrderCount()
    loadTpls()
  }, [analysisId])

  async function loadAnalysis() {
    const res = await fetch(`/api/analyses/${analysisId}`)
    const data = await res.json()
    setAnalysis(data)
    return data as Analysis
  }

  async function loadResults() {
    const res = await fetch(`/api/analyses/${analysisId}/results`)
    if (!res.ok) return
    const data = await res.json()
    if (data.tplSummaries?.length > 0) {
      setCalcResult({
        tplSummaries: data.tplSummaries,
        includedOrders: data.includedOrders,
        excludedOrders: data.excludedOrders,
        excluded: data.excluded ?? [],
        warnings: data.warnings ?? [],
      })
    }
  }

  async function loadOrderCount() {
    const res = await fetch(`/api/orders?analysisId=${analysisId}`)
    const data = await res.json()
    if (Array.isArray(data)) setOrderCount(data.length)
  }

  async function loadTpls() {
    const res = await fetch(`/api/tpls?analysisId=${analysisId}`)
    if (!res.ok) return
    const data: Array<Tpl & { locations: Location[] }> = await res.json()
    const tplsWithCards = await Promise.all(
      data.map(async tpl => {
        const rcRes = await fetch(`/api/rate-cards?tplId=${tpl.id}`)
        const rateCards = rcRes.ok ? await rcRes.json() : []
        return { ...tpl, rateCards } as TplWithData
      }),
    )
    setTpls(tplsWithCards)
  }

  // ─── Order upload handlers ───────────────────────────────────────────────────
  function autoMapHeaders(headers: string[]): Record<string, string> {
    const auto: Record<string, string> = {}
    for (const h of headers) {
      const lower = h.toLowerCase()
      if (!auto.orderNumber && (lower.includes('order') || lower.includes('id') || lower.includes('number'))) auto.orderNumber = h
      if (!auto.destZip && (lower.includes('zip') || lower.includes('postal'))) auto.destZip = h
      if (!auto.weightColumn && lower.includes('weight')) auto.weightColumn = h
    }
    return auto
  }

  async function handleOrderFile(file: File) {
    setOrderParseError(null)
    setOrderUploadResult(null)
    setOrderHeaders([])
    setOrderCsvText(null)
    setOrderFilePayload(null)

    // Route .xlsx/.xls → SheetJS (server-side via /api/orders/parse).
    // Route .csv → Papa Parse (client, for instant header preview; server repeats).
    let fileType: 'csv' | 'excel'
    try {
      fileType = detectFileType({ filename: file.name, mimeType: file.type })
    } catch (e) {
      setOrderParseError(e instanceof Error ? e.message : 'Unsupported file type')
      return
    }

    if (fileType === 'csv') {
      const text = await file.text()
      setOrderCsvText(text)
      const result = Papa.parse<Record<string, string>>(text, { header: true, preview: 1 })
      const headers = Object.keys(result.data[0] ?? {})
      if (headers.length === 0) {
        setOrderParseError('CSV file has no columns. Check that the first row contains column headers.')
        return
      }
      setOrderHeaders(headers)
      setOrderMapping(autoMapHeaders(headers))
      return
    }

    // Excel: send to server for SheetJS parsing — never feed raw binary to Papa Parse.
    const payload = await fileToParsePayload(file)
    const res = await fetch('/api/orders/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      setOrderParseError(data.error ?? 'Failed to parse Excel file')
      return
    }
    const headers: string[] = data.headers ?? []
    if (headers.length === 0) {
      setOrderParseError('Excel file has no columns. Check that the first row contains column headers.')
      return
    }
    setOrderFilePayload({ fileType: payload.fileType, data: payload.data, filename: file.name })
    setOrderHeaders(headers)
    setOrderMapping(autoMapHeaders(headers))
  }

  async function uploadOrders() {
    if (!orderMapping.orderNumber || !orderMapping.destZip || !orderMapping.weightColumn) return
    setUploadingOrders(true)
    setOrderUploadResult(null)
    try {
      const body: Record<string, unknown> = {
        analysisId,
        mapping: { ...orderMapping, weightUnit },
      }
      if (orderFilePayload) {
        body.fileType = orderFilePayload.fileType
        body.fileData = orderFilePayload.data
        body.filename = orderFilePayload.filename
      } else if (orderCsvText) {
        body.csvText = orderCsvText
      } else {
        setUploadingOrders(false)
        return
      }

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setOrderUploadResult(data)
      if (data.imported) setOrderCount(data.imported)
    } finally {
      setUploadingOrders(false)
    }
  }

  // ─── TPL handlers ────────────────────────────────────────────────────────────
  async function saveTpl() {
    if (!tplForm.name.trim()) return
    setSavingTpl(true)
    try {
      const res = await fetch('/api/tpls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId, name: tplForm.name.trim(), notes: tplForm.notes || null }),
      })
      if (res.ok) {
        setShowAddTplForm(false)
        setTplForm({ name: '', notes: '' })
        loadTpls()
      }
    } finally {
      setSavingTpl(false)
    }
  }

  async function deleteTpl(id: number) {
    if (!confirm('Delete this 3PL and all its locations and rate cards?')) return
    await fetch(`/api/tpls/${id}`, { method: 'DELETE' })
    loadTpls()
  }

  // ─── Location handlers ───────────────────────────────────────────────────────
  function openAddLocation(tplId: number) {
    setAddLocationFor(tplId)
    setLocationForm({ name: '', originZip: '' })
    setLocationError(null)
  }

  async function saveLocation() {
    if (!addLocationFor || !locationForm.name.trim() || !locationForm.originZip.trim()) return
    setSavingLocation(true)
    setLocationError(null)
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tplId: addLocationFor, name: locationForm.name.trim(), originZip: locationForm.originZip.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLocationError(data.error ?? 'Failed to save location')
        return
      }
      setAddLocationFor(null)
      loadTpls()
    } finally {
      setSavingLocation(false)
    }
  }

  async function deleteLocation(id: number) {
    if (!confirm('Delete this location?')) return
    await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    loadTpls()
  }

  // ─── Rate card handlers ──────────────────────────────────────────────────────
  async function deleteRateCard(id: number) {
    if (!confirm('Delete this rate card and all its entries?')) return
    await fetch(`/api/rate-cards/${id}`, { method: 'DELETE' })
    loadTpls()
  }

  // ─── Settings handlers ───────────────────────────────────────────────────────
  function openEditSettings(tpl: TplWithData) {
    setEditSettingsFor(tpl.id)
    setSettingsForm({
      dimWeightEnabled: tpl.dimWeightEnabled,
      dimFactor: tpl.dimFactor != null ? String(tpl.dimFactor) : '',
      surchargeDollars: tpl.surchargeFlatCents > 0 ? (tpl.surchargeFlatCents / 100).toFixed(2) : '',
      multiNodeEnabled: tpl.multiNodeEnabled,
    })
  }

  async function saveSettings() {
    if (!editSettingsFor) return
    setSavingSettings(true)
    try {
      await fetch(`/api/tpls/${editSettingsFor}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimWeightEnabled: settingsForm.dimWeightEnabled,
          dimFactor: settingsForm.dimFactor ? parseInt(settingsForm.dimFactor) : null,
          surchargeFlatCents: settingsForm.surchargeDollars ? Math.round(parseFloat(settingsForm.surchargeDollars) * 100) : 0,
          multiNodeEnabled: settingsForm.multiNodeEnabled,
        }),
      })
      setEditSettingsFor(null)
      loadTpls()
    } finally {
      setSavingSettings(false)
    }
  }

  // ─── Calculation ─────────────────────────────────────────────────────────────
  async function runCalculation() {
    setCalculating(true)
    setCalcError(null)
    try {
      const res = await fetch('/api/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCalcError(data.error ?? 'Calculation failed')
      } else {
        setCalcResult({
          tplSummaries: data.tplSummaries ?? [],
          includedOrders: data.includedOrders ?? 0,
          excludedOrders: data.excludedOrders ?? 0,
          excluded: data.excluded ?? [],
          warnings: data.warnings ?? [],
        })
        setActiveTab('results')
        loadAnalysis()
      }
    } catch (e: unknown) {
      setCalcError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCalculating(false)
    }
  }

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  // ─── Render ───────────────────────────────────────────────────────────────────

  const tabs = [
    { id: 'orders', label: 'Orders' },
    { id: '3pls', label: '3PLs' },
    { id: 'run', label: 'Run Analysis' },
    { id: 'results', label: 'Results' },
  ] as const

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700">
          Dashboard
        </a>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-semibold text-gray-900">{analysis?.name ?? 'Loading…'}</h1>
        {analysis && (
          <Badge color={analysis.status === 'complete' ? 'green' : 'yellow'}>{analysis.status}</Badge>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Orders Tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <Card title="Upload Order Data">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Order CSV or Excel file</label>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={e => e.target.files?.[0] && handleOrderFile(e.target.files[0])}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>

              {orderParseError && (
                <div className="text-sm p-3 rounded-md bg-red-50 text-red-700">
                  {orderParseError}
                </div>
              )}

              {orderHeaders.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700">Map columns from your file:</p>
                  {([
                    { key: 'orderNumber', label: 'Order Number / ID', required: true },
                    { key: 'destZip', label: 'Destination ZIP Code', required: true },
                    { key: 'weightColumn', label: 'Weight', required: true },
                    { key: 'height', label: 'Height (optional)' },
                    { key: 'width', label: 'Width (optional)' },
                    { key: 'length', label: 'Length (optional)' },
                    { key: 'state', label: 'State (optional)' },
                  ] as { key: string; label: string; required?: boolean }[]).map(field => (
                    <div key={field.key} className="flex items-center gap-3">
                      <label className="w-48 text-sm text-gray-600">{field.label}</label>
                      <select
                        value={orderMapping[field.key] ?? ''}
                        onChange={e => setOrderMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- select column --</option>
                        {orderHeaders.map(h => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <div className="flex items-center gap-3">
                    <label className="w-48 text-sm text-gray-600">Weight unit</label>
                    <select
                      value={weightUnit}
                      onChange={e => setWeightUnit(e.target.value as 'lbs' | 'oz')}
                      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="lbs">Pounds (lbs)</option>
                      <option value="oz">Ounces (oz)</option>
                    </select>
                  </div>
                  <Button
                    onClick={uploadOrders}
                    disabled={uploadingOrders || !orderMapping.orderNumber || !orderMapping.destZip || !orderMapping.weightColumn}
                  >
                    {uploadingOrders ? 'Importing…' : 'Import Orders'}
                  </Button>
                </div>
              )}

              {orderUploadResult && (
                <div
                  className={`text-sm p-3 rounded-md ${orderUploadResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
                >
                  {orderUploadResult.error
                    ? orderUploadResult.error
                    : `${orderUploadResult.imported} orders imported${orderUploadResult.failed && orderUploadResult.failed > 0 ? `, ${orderUploadResult.failed} failed` : ''}`}
                  {orderUploadResult.errors && orderUploadResult.errors.length > 0 && (
                    <ul className="mt-2 list-disc list-inside text-xs">
                      {orderUploadResult.errors.slice(0, 5).map((e, i) => (
                        <li key={i}>{typeof e === 'string' ? e : `Row ${e.rowIndex}: ${e.reason}`}</li>
                      ))}
                      {orderUploadResult.errors.length > 5 && (
                        <li>…and {orderUploadResult.errors.length - 5} more</li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {orderCount !== null && orderCount > 0 && !orderUploadResult && (
                <p className="text-sm text-green-600">{orderCount} orders currently loaded</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── 3PLs Tab ───────────────────────────────────────────────────────────── */}
      {activeTab === '3pls' && (
        <div className="space-y-4">
          {tpls.map(tpl => (
            <Card key={tpl.id} title={tpl.name}>
              <div className="space-y-5">
                {/* ── Locations ─────────────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">Locations</p>
                    {addLocationFor !== tpl.id && (
                      <Button variant="ghost" size="sm" onClick={() => openAddLocation(tpl.id)}>
                        + Add Location
                      </Button>
                    )}
                  </div>

                  {tpl.locations.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                          <th className="pb-1 font-medium pr-6">Name</th>
                          <th className="pb-1 font-medium pr-6">Origin ZIP</th>
                          <th className="pb-1 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tpl.locations.map(loc => (
                          <tr key={loc.id} className="border-b border-gray-50">
                            <td className="py-1.5 pr-6">{loc.name}</td>
                            <td className="py-1.5 pr-6 font-mono text-gray-600">{loc.originZip}</td>
                            <td className="py-1.5 text-right">
                              <button
                                onClick={() => deleteLocation(loc.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400">No locations yet.</p>
                  )}

                  {addLocationFor === tpl.id && (
                    <div className="mt-3 flex flex-wrap gap-2 items-end">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Location name</label>
                        <input
                          type="text"
                          placeholder="e.g., Reno, NV"
                          value={locationForm.name}
                          onChange={e => setLocationForm(prev => ({ ...prev, name: e.target.value }))}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Origin ZIP</label>
                        <input
                          type="text"
                          placeholder="12345"
                          value={locationForm.originZip}
                          onChange={e => setLocationForm(prev => ({ ...prev, originZip: e.target.value }))}
                          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 w-28"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={saveLocation}
                        disabled={savingLocation || !locationForm.name.trim() || !locationForm.originZip.trim()}
                      >
                        {savingLocation ? 'Saving…' : 'Save'}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setAddLocationFor(null)}>
                        Cancel
                      </Button>
                      {locationError && <p className="text-xs text-red-600 w-full">{locationError}</p>}
                    </div>
                  )}
                </div>

                {/* ── Rate Cards ────────────────────────────────────────────── */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">Rate Cards</p>
                    {addRateCardFor !== tpl.id && (
                      <Button variant="ghost" size="sm" onClick={() => setAddRateCardFor(tpl.id)}>
                        + Add Rate Card
                      </Button>
                    )}
                  </div>

                  {tpl.rateCards.length > 0 ? (
                    <div className="space-y-2">
                      {tpl.rateCards.map(rc => (
                        <div key={rc.id} className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-700 font-mono text-xs leading-relaxed">
                              {rateCardSummaryLine(rc)}
                            </p>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() => setViewRateCardId(viewRateCardId === rc.id ? null : rc.id)}
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                {viewRateCardId === rc.id ? 'Hide' : 'View'}
                              </button>
                              <button
                                onClick={() => deleteRateCard(rc.id)}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {viewRateCardId === rc.id && (
                            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
                              <PriceMatrix entries={rc.entries} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No rate cards yet.</p>
                  )}

                  {addRateCardFor === tpl.id && (
                    <div className="mt-3">
                      <RateCardUpload
                        tplId={tpl.id}
                        onSuccess={() => {
                          setAddRateCardFor(null)
                          loadTpls()
                        }}
                        onCancel={() => setAddRateCardFor(null)}
                      />
                    </div>
                  )}
                </div>

                {/* ── Settings ──────────────────────────────────────────────── */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">Settings</p>
                    {editSettingsFor !== tpl.id && (
                      <Button variant="ghost" size="sm" onClick={() => openEditSettings(tpl)}>
                        Edit
                      </Button>
                    )}
                  </div>

                  {editSettingsFor === tpl.id ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Flat surcharge ($)</label>
                          <input
                            type="text"
                            placeholder="0.00"
                            value={settingsForm.surchargeDollars}
                            onChange={e => setSettingsForm(prev => ({ ...prev, surchargeDollars: e.target.value }))}
                            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Dim factor</label>
                          <input
                            type="text"
                            placeholder="e.g., 139"
                            value={settingsForm.dimFactor}
                            onChange={e => setSettingsForm(prev => ({ ...prev, dimFactor: e.target.value }))}
                            disabled={!settingsForm.dimWeightEnabled}
                            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settingsForm.dimWeightEnabled}
                            onChange={e => setSettingsForm(prev => ({ ...prev, dimWeightEnabled: e.target.checked }))}
                            className="rounded"
                          />
                          Dimensional weight
                        </label>
                        {tpl.locations.length >= 2 && (
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={settingsForm.multiNodeEnabled}
                              onChange={e => setSettingsForm(prev => ({ ...prev, multiNodeEnabled: e.target.checked }))}
                              className="rounded"
                            />
                            Multi-node (use cheapest location per order)
                          </label>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
                          {savingSettings ? 'Saving…' : 'Save Settings'}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditSettingsFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                      <div>
                        <span className="text-gray-400">Dim weight: </span>
                        {tpl.dimWeightEnabled ? `÷${tpl.dimFactor ?? '?'}` : 'off'}
                      </div>
                      <div>
                        <span className="text-gray-400">Surcharge: </span>
                        {tpl.surchargeFlatCents > 0 ? `$${(tpl.surchargeFlatCents / 100).toFixed(2)}` : 'none'}
                      </div>
                      <div>
                        <span className="text-gray-400">Multi-node: </span>
                        {tpl.multiNodeEnabled ? 'on' : 'off'}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Delete TPL ────────────────────────────────────────────── */}
                <div className="border-t border-gray-100 pt-3 flex justify-end">
                  <Button variant="danger" size="sm" onClick={() => deleteTpl(tpl.id)}>
                    Delete 3PL
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {/* Add 3PL form */}
          {showAddTplForm ? (
            <Card title="Add 3PL">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Stord, Shipbob"
                      value={tplForm.name}
                      onChange={e => setTplForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={tplForm.notes}
                      onChange={e => setTplForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveTpl} disabled={savingTpl || !tplForm.name.trim()}>
                    {savingTpl ? 'Saving…' : 'Save 3PL'}
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddTplForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Button onClick={() => setShowAddTplForm(true)}>Add 3PL</Button>
          )}
        </div>
      )}

      {/* ── Run Tab ────────────────────────────────────────────────────────────── */}
      {activeTab === 'run' && (
        <Card title="Run Analysis">
          <div className="space-y-4">
            <div className="text-sm text-gray-600 space-y-1">
              <p>
                3PLs configured: <strong>{tpls.length}</strong>
              </p>
              <p>
                Orders loaded: <strong>{orderCount ?? '(upload orders first)'}</strong>
              </p>
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <p>Before running, ensure each 3PL has at least one location and rate card.</p>
              <p>Zone data is pre-loaded from USPS for all US ZIP codes.</p>
            </div>
            {calcError && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-md">{calcError}</div>}
            <Button size="lg" onClick={runCalculation} disabled={calculating || tpls.length === 0}>
              {calculating ? 'Calculating…' : 'Run Analysis'}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Results Tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <ResultsView
          calcResult={calcResult}
          expandedTpls={expandedTpls}
          setExpandedTpls={setExpandedTpls}
          showExcluded={showExcluded}
          setShowExcluded={setShowExcluded}
          formatCents={formatCents}
        />
      )}
    </div>
  )
}
