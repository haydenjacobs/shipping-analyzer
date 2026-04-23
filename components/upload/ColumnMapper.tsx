'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

// Column names to look for when auto-detecting mappings (case-insensitive).
const DETECT: Record<string, string[]> = {
  orderNumber: ['order number', 'order_number', 'order #', 'order id', 'orderid', 'order', 'id', 'name'],
  destZip: ['dest zip', 'destination zip', 'dest_zip', 'zip', 'postal code', 'postal', 'zip code', 'ship to zip'],
  weight: ['weight', 'actual weight', 'ship weight', 'lbs', 'pounds', 'weight (lbs)', 'weight(lbs)', 'wt'],
  height: ['height', 'h', 'dim h', 'item height'],
  width: ['width', 'w', 'dim w', 'item width'],
  length: ['length', 'l', 'dim l', 'item length'],
  state: ['state', 'ship to state', 'destination state', 'dest state', 'st'],
}

export interface ColumnMappingValues {
  orderNumber: string
  destZip: string
  weight: string
  weightUnit: 'lbs' | 'oz'
  height?: string
  width?: string
  length?: string
  state?: string
}

function detect(headers: string[], key: keyof typeof DETECT): string {
  const patterns = DETECT[key]
  for (const h of headers) {
    const lower = h.toLowerCase().trim()
    if (patterns.some((p) => lower === p || (p.length > 1 && lower.includes(p)))) return h
  }
  return ''
}

function autoDetect(headers: string[]): ColumnMappingValues {
  return {
    orderNumber: detect(headers, 'orderNumber'),
    destZip: detect(headers, 'destZip'),
    weight: detect(headers, 'weight'),
    weightUnit: 'lbs',
    height: detect(headers, 'height') || undefined,
    width: detect(headers, 'width') || undefined,
    length: detect(headers, 'length') || undefined,
    state: detect(headers, 'state') || undefined,
  }
}

interface Props {
  headers: string[]
  sampleRows: Record<string, string>[]
  onConfirm: (mapping: ColumnMappingValues) => void
  onCancel: () => void
}

// ─── ColSelect — extracted to top level to avoid "component created during render" ──

interface ColSelectProps {
  label: string
  fieldKey: keyof ColumnMappingValues
  required?: boolean
  value: string | undefined
  headers: string[]
  sampleRows: Record<string, string>[]
  onChange: (fieldKey: keyof ColumnMappingValues, val: string | undefined) => void
}

function ColSelect({ label, fieldKey, required, value, headers, sampleRows, onChange }: ColSelectProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(fieldKey, e.target.value || undefined)}
        className={`w-full border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          required && !value
            ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
            : 'border-gray-300 dark:border-gray-600'
        }`}
      >
        {!required && <option value="">— not mapped —</option>}
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {value && sampleRows.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          e.g. {sampleRows.slice(0, 3).map((r) => r[value]).filter(Boolean).join(', ')}
        </p>
      )}
    </div>
  )
}

// ─── ColumnMapper ─────────────────────────────────────────────────────────────

export function ColumnMapper({ headers, sampleRows, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<ColumnMappingValues>(() => autoDetect(headers))

  function set<K extends keyof ColumnMappingValues>(key: K, val: ColumnMappingValues[K]) {
    setMapping((prev) => ({ ...prev, [key]: val }))
  }

  function handleColChange(fieldKey: keyof ColumnMappingValues, val: string | undefined) {
    setMapping((prev) => ({ ...prev, [fieldKey]: val }))
  }

  const canConfirm =
    mapping.orderNumber.length > 0 && mapping.destZip.length > 0 && mapping.weight.length > 0

  const selectClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Map Columns</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Auto-detected from your file headers. Confirm or adjust before importing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <ColSelect
          label="Order Number"
          fieldKey="orderNumber"
          required
          value={mapping.orderNumber}
          headers={headers}
          sampleRows={sampleRows}
          onChange={handleColChange}
        />
        <ColSelect
          label="Destination ZIP"
          fieldKey="destZip"
          required
          value={mapping.destZip}
          headers={headers}
          sampleRows={sampleRows}
          onChange={handleColChange}
        />
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Weight Column<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            value={mapping.weight}
            onChange={(e) => set('weight', e.target.value)}
            className={`w-full border rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              !mapping.weight
                ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
          {mapping.weight && sampleRows.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              e.g. {sampleRows.slice(0, 3).map((r) => r[mapping.weight]).filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Weight Unit<span className="text-red-500 ml-0.5">*</span>
          </label>
          <select
            value={mapping.weightUnit}
            onChange={(e) => set('weightUnit', e.target.value as 'lbs' | 'oz')}
            className={selectClass}
          >
            <option value="lbs">lbs (pounds)</option>
            <option value="oz">oz (ounces)</option>
          </select>
        </div>
        <ColSelect label="Height (optional)" fieldKey="height" value={mapping.height} headers={headers} sampleRows={sampleRows} onChange={handleColChange} />
        <ColSelect label="Width (optional)" fieldKey="width" value={mapping.width} headers={headers} sampleRows={sampleRows} onChange={handleColChange} />
        <ColSelect label="Length (optional)" fieldKey="length" value={mapping.length} headers={headers} sampleRows={sampleRows} onChange={handleColChange} />
        <ColSelect label="State (optional)" fieldKey="state" value={mapping.state} headers={headers} sampleRows={sampleRows} onChange={handleColChange} />
      </div>

      {!canConfirm && (
        <p className="text-xs text-orange-600 dark:text-orange-400">Map all required fields (*) before continuing.</p>
      )}

      <div className="flex gap-2">
        <Button onClick={() => onConfirm(mapping)} disabled={!canConfirm}>
          Import Orders
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
