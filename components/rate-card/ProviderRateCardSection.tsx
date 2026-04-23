'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import type { RateCardInfo, WarehouseWithRateCards } from '@/components/analysis/types'

interface Props {
  providerName: string
  warehouses: WarehouseWithRateCards[]
  rateCard: RateCardInfo | null
  onRateCardChanged: () => void
}

type UploadState =
  | { status: 'idle'; replacing?: boolean }
  | { status: 'configuring'; file: File; pasteMode: boolean }
  | { status: 'uploading' }
  | { status: 'success'; entryCount: number; warnings: string[] }
  | { status: 'error'; message: string }

const WEIGHT_UNIT_MODES = [
  { value: 'oz_then_lbs', label: 'oz then lbs (mixed — oz rows + lbs rows)' },
  { value: 'oz_only', label: 'oz only' },
  { value: 'lbs_only', label: 'lbs only' },
] as const

export function ProviderRateCardSection({ providerName, warehouses, rateCard, onRateCardChanged }: Props) {
  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const [name, setName] = useState('')
  const [weightUnitMode, setWeightUnitMode] = useState<string>('oz_then_lbs')
  const [showPreview, setShowPreview] = useState(false)
  const [previewEntries, setPreviewEntries] = useState<Record<string, unknown>[] | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [inputTab, setInputTab] = useState<'file' | 'paste'>('file')
  const [pasteText, setPasteText] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File, pasteMode = false) {
    setState({ status: 'configuring', file, pasteMode })
    if (!name) setName(pasteMode ? '' : file.name.replace(/\.[^.]+$/, ''))
  }

  function handlePasteSubmit() {
    const text = pasteText.trim()
    if (!text) return
    const file = new File([text], 'pasted-rate-card.csv', { type: 'text/csv' })
    handleFile(file, true)
  }

  async function upload(file: File, pasteMode: boolean) {
    if (!name.trim()) return
    setState({ status: 'uploading' })

    const errors: string[] = []
    let successCount = 0
    let lastEntryCount = 0
    let lastWarnings: string[] = []

    await Promise.allSettled(
      warehouses.map(async (wh) => {
        const form = new FormData()
        form.append('name', name.trim())
        form.append('weight_unit_mode', weightUnitMode)
        if (pasteMode) form.append('input_mode', 'paste')
        // Create a fresh File per request so each upload has its own body stream
        const buf = await file.arrayBuffer()
        form.append('file', new File([buf], file.name, { type: file.type }))
        const res = await fetch(`/api/warehouses/${wh.id}/rate-cards`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        if (!res.ok) {
          errors.push(
            `${wh.locationLabel}: ${data?.error?.message ?? 'Upload failed'}`,
          )
        } else {
          successCount++
          lastEntryCount = data.entryCount ?? 0
          lastWarnings = data.warnings ?? []
        }
      }),
    )

    if (errors.length > 0 && successCount === 0) {
      setState({ status: 'error', message: errors.join('; ') })
    } else if (errors.length > 0) {
      setState({
        status: 'error',
        message: `Uploaded to ${successCount} of ${warehouses.length} locations. Failed: ${errors.join('; ')}`,
      })
      onRateCardChanged()
    } else {
      setState({ status: 'success', entryCount: lastEntryCount, warnings: lastWarnings })
      onRateCardChanged()
    }
  }

  async function loadPreview() {
    if (!rateCard) return
    setLoadingPreview(true)
    try {
      const res = await fetch(`/api/rate-cards/${rateCard.id}`)
      const data = await res.json()
      setPreviewEntries(data.entries ?? [])
    } finally {
      setLoadingPreview(false)
    }
  }

  function togglePreview() {
    if (!showPreview && !previewEntries) loadPreview()
    setShowPreview(!showPreview)
  }

  function startReplace() {
    setState({ status: 'idle', replacing: true })
    setShowPreview(false)
    setPreviewEntries(null)
    setPasteText('')
  }

  const modeLabel = WEIGHT_UNIT_MODES.find((m) => m.value === (rateCard?.weightUnitMode ?? weightUnitMode))?.label

  const inputClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="space-y-3">
      {/* Existing rate card summary */}
      {rateCard && state.status === 'idle' && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <span className="font-medium text-gray-800 dark:text-gray-200">{rateCard.name}</span>
            <span className="text-gray-400 dark:text-gray-500 mx-2">·</span>
            <span className="text-gray-500 dark:text-gray-400">{modeLabel}</span>
            <span className="text-gray-400 dark:text-gray-500 mx-2">·</span>
            <button
              onClick={togglePreview}
              className="text-blue-600 dark:text-blue-400 hover:underline"
              disabled={loadingPreview}
            >
              {loadingPreview ? 'Loading…' : showPreview ? 'Hide preview' : 'Preview'}
            </button>
          </div>
          <Button variant="secondary" size="sm" onClick={startReplace}>
            Replace
          </Button>
        </div>
      )}

      {/* Preview table */}
      {showPreview && previewEntries && previewEntries.length > 0 && (
        <RateCardPreview entries={previewEntries} />
      )}

      {/* Upload area */}
      {(!rateCard || (state.status === 'idle' && state.replacing) || state.status !== 'idle') && state.status !== 'configuring' && state.status !== 'uploading' && state.status !== 'success' && (
        <div className="space-y-2">
          {/* Tab toggle */}
          <div className="flex gap-1 p-0.5 bg-gray-100 dark:bg-gray-800 rounded-md w-fit">
            {(['file', 'paste'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setInputTab(tab)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  inputTab === tab
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {tab === 'file' ? 'Upload file' : 'Paste table'}
              </button>
            ))}
          </div>

          {inputTab === 'file' ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
              }`}
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Drop a rate card CSV or Excel file, or click to browse
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Applies to all locations under {providerName}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"Paste your rate card table here — copy from Excel, Google Sheets, or any spreadsheet.\n\nThe parser auto-detects zone columns and oz/lbs sections."}
                rows={8}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-xs font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Applies to all locations under {providerName}
                </p>
                <Button size="sm" onClick={handlePasteSubmit} disabled={!pasteText.trim()}>
                  Continue
                </Button>
              </div>
            </div>
          )}
          {/* Cancel link when replacing an existing card */}
          {rateCard && state.status === 'idle' && state.replacing && (
            <button
              onClick={() => setState({ status: 'idle' })}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Configure + upload */}
      {state.status === 'configuring' && (
        <div className="bg-blue-50/40 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            {state.pasteMode
              ? 'Source: pasted table'
              : <>File: <span className="text-gray-700 dark:text-gray-300">{state.file.name}</span></>
            }
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Rate Card Name<span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Ground, Priority"
                className={inputClass}
                autoFocus={state.pasteMode}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Weight Unit Mode<span className="text-red-500 ml-0.5">*</span>
              </label>
              <select
                value={weightUnitMode}
                onChange={(e) => setWeightUnitMode(e.target.value)}
                className={inputClass}
              >
                {WEIGHT_UNIT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => upload(state.file, state.pasteMode)} disabled={!name.trim()}>
              Upload
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setState({ status: 'idle' })}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {state.status === 'uploading' && (
        <p className="text-sm text-blue-600 dark:text-blue-400">
          Uploading to {warehouses.length} location{warehouses.length !== 1 ? 's' : ''}…
        </p>
      )}

      {state.status === 'success' && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-md p-3 space-y-1">
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Rate card uploaded — {state.entryCount.toLocaleString()} entries
          </p>
          {state.warnings.length > 0 &&
            state.warnings.map((w, i) => (
              <p key={i} className="text-xs text-yellow-700 dark:text-yellow-400">
                {w}
              </p>
            ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Upload failed</p>
          <p className="text-sm text-red-600 dark:text-red-400 font-mono mt-0.5">{state.message}</p>
          <button
            onClick={() => setState({ status: 'idle' })}
            className="text-xs text-red-600 dark:text-red-400 underline mt-1"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

function RateCardPreview({ entries }: { entries: Record<string, unknown>[] }) {
  const units = [...new Set(entries.map((e) => e.weightUnit as string))].sort()
  return (
    <div className="space-y-3 overflow-x-auto">
      {units.map((unit) => {
        const ue = entries.filter((e) => e.weightUnit === unit)
        const weights = [...new Set(ue.map((e) => e.weightValue as number))].sort((a, b) => a - b)
        const zones = [...new Set(ue.map((e) => e.zone as number))].sort((a, b) => a - b)
        const priceMap = new Map(ue.map((e) => [`${e.weightValue}-${e.zone}`, e.priceCents as number]))
        return (
          <div key={unit}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{unit} rows</p>
            <table className="text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800">
                  <th className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400">
                    Wt ({unit})
                  </th>
                  {zones.map((z) => (
                    <th key={z} className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-center font-medium text-gray-500 dark:text-gray-400">
                      Z{z}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weights.slice(0, 10).map((w, ri) => (
                  <tr key={w} className={ri % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                    <td className="border border-gray-200 dark:border-gray-700 px-2 py-0.5 font-mono text-gray-900 dark:text-gray-100">{w}</td>
                    {zones.map((z) => {
                      const cents = priceMap.get(`${w}-${z}`)
                      return (
                        <td key={z} className="border border-gray-200 dark:border-gray-700 px-2 py-0.5 text-right font-mono text-gray-700 dark:text-gray-300">
                          {cents != null ? `$${(cents / 100).toFixed(2)}` : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {weights.length > 10 && (
                  <tr>
                    <td
                      colSpan={zones.length + 1}
                      className="border border-gray-200 dark:border-gray-700 px-2 py-1 text-center text-gray-400 dark:text-gray-500"
                    >
                      … {weights.length - 10} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
