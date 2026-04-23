'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { ZoneDistRow } from '@/lib/results/derive-zone-distribution'

// Sequential single-hue blue scale, zone 1 (lightest) → zone 8 (darkest).
// Perceptually ordered and colorblind-safe.
const ZONE_COLORS: Record<number, string> = {
  1: '#dbeafe',
  2: '#bfdbfe',
  3: '#93c5fd',
  4: '#60a5fa',
  5: '#3b82f6',
  6: '#2563eb',
  7: '#1d4ed8',
  8: '#1e3a8a',
}

const ZONES = [1, 2, 3, 4, 5, 6, 7, 8] as const

interface ChartDatum {
  label: string
  [key: string]: string | number
}

function toChartData(rows: ZoneDistRow[]): ChartDatum[] {
  return rows.map((row) => {
    const datum: ChartDatum = { label: row.label }
    for (const z of ZONES) {
      const count = row.zones[z] ?? 0
      datum[`zone_${z}_pct`] = row.total > 0 ? (count / row.total) * 100 : 0
    }
    return datum
  })
}

interface TooltipPayloadItem {
  dataKey: string
  value: number
  payload: ChartDatum
}

function CustomTooltip({ active, payload, activeZone }: { active?: boolean; payload?: TooltipPayloadItem[]; activeZone: number | null }) {
  if (!active || !payload?.length || activeZone === null) return null
  const pct = (payload[0].payload[`zone_${activeZone}_pct`] as number).toFixed(1)
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-sm px-2 py-1 text-xs text-gray-700 dark:text-gray-300">
      Zone {activeZone}: {pct}%
    </div>
  )
}

interface Props {
  rows: ZoneDistRow[]
}

const ROW_HEIGHT = 36
const CHART_MARGIN = { top: 8, right: 16, bottom: 8, left: 0 }
const Y_AXIS_WIDTH = 160

export function ZoneDistributionChart({ rows }: Props) {
  const [activeZone, setActiveZone] = useState<number | null>(null)

  if (rows.length === 0) return null

  const data = toChartData(rows)
  const chartHeight = rows.length * ROW_HEIGHT + 40

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {ZONES.map((z) => (
          <div key={z} className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm border border-gray-200 dark:border-gray-600"
              style={{ backgroundColor: ZONE_COLORS[z] }}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Zone {z}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          layout="vertical"
          data={data}
          margin={CHART_MARGIN}
          barSize={20}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={Y_AXIS_WIDTH}
            tick={{ fontSize: 12, fill: '#6b7280' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={(props) => <CustomTooltip {...props} activeZone={activeZone} />} cursor={false} />
          {ZONES.map((z) => (
            <Bar
              key={z}
              dataKey={`zone_${z}_pct`}
              stackId="zones"
              fill={ZONE_COLORS[z]}
              isAnimationActive={false}
              onMouseEnter={() => setActiveZone(z)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
