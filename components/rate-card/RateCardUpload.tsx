'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { fileToParsePayload } from '@/lib/parsers/file-parser-client'
import type { ParsedSection } from '@/lib/parsers/rate-card-parser'
import type { RateCard } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParserOutput {
  sections: ParsedSection[]
  warnings: string[]
  errors: string[]
}

interface SectionState {
  // From parser (immutable after parse)
  detectedUnit: 'oz' | 'lbs' | 'unknown'
  unitConfidence: 'high' | 'low'
  zoneColumns: number[]
  prices: (number | null)[][]
  sourceRowStart: number
  sourceRowEnd: number
  // User-editable
  unit: 'oz' | 'lbs' | null  // null = not yet selected (requires selection before confirm)
  weights: string[]           // stored as strings so the input fields are editable
}

export interface RateCardUploadProps {
  tplId: number
  onSuccess: (rateCard: RateCard) => void
  onCancel: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parsedSectionToState(s: ParsedSection): SectionState {
  return {
    detectedUnit: s.detectedUnit,
    unitConfidence: s.unitConfidence,
    zoneColumns: s.zoneColumns,
    prices: s.prices,
    sourceRowStart: s.sourceRowStart,
    sourceRowEnd: s.sourceRowEnd,
    unit: s.detectedUnit !== 'unknown' ? s.detectedUnit : null,
    weights: s.weights.map(String),
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RateCardUpload({ tplId, onSuccess, onCancel }: RateCardUploadProps) {
  const [step, setStep] = useState<'input' | 'preview'>('input')
  const [name, setName] = useState('')
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload')
  const [pasteText, setPasteText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [sections, setSections] = useState<SectionState[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Parse flow ─────────────────────────────────────────────────────────────

  async function sendParseRequest(payload: {
    inputType: 'file' | 'paste'
    fileType?: 'csv' | 'excel'
    data: string
    filename?: string
  }) {
    setParsing(true)
    setParseErrors([])
    try {
      const res = await fetch('/api/rate-cards/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result: ParserOutput = await res.json()
      if (!res.ok) {
        setParseErrors([result.errors?.[0] ?? 'Parse failed'])
        return
      }
      if (result.errors?.length > 0) {
        setParseErrors(result.errors)
        return
      }
      if (!result.sections || result.sections.length === 0) {
        setParseErrors(['No data sections found in the file. Check that the file contains zone headers and price data.'])
        return
      }
      setSections(result.sections.map(parsedSectionToState))
      setWarnings(result.warnings ?? [])
      setStep('preview')
    } catch (e) {
      setParseErrors([e instanceof Error ? e.message : 'Parse request failed'])
    } finally {
      setParsing(false)
    }
  }

  async function handleFile(file: File) {
    setParseErrors([])
    try {
      const payload = await fileToParsePayload(file)
      await sendParseRequest({ inputType: 'file', fileType: payload.fileType, data: payload.data, filename: payload.filename })
    } catch (e) {
      setParseErrors([e instanceof Error ? e.message : 'Unsupported file type'])
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleParse() {
    const trimmed = pasteText.trim()
    if (!trimmed) return
    sendParseRequest({ inputType: 'paste', data: trimmed })
  }

  // ─── Preview state updates ───────────────────────────────────────────────────

  function updateUnit(sectionIdx: number, unit: 'oz' | 'lbs') {
    setSections(prev => prev.map((s, i) => (i === sectionIdx ? { ...s, unit } : s)))
  }

  function updateWeight(sectionIdx: number, rowIdx: number, value: string) {
    setSections(prev =>
      prev.map((s, i) => {
        if (i !== sectionIdx) return s
        const weights = [...s.weights]
        weights[rowIdx] = value
        return { ...s, weights }
      }),
    )
  }

  const canConfirm = sections.length > 0 && sections.every(s => s.unit !== null) && name.trim().length > 0

  // ─── Save flow ───────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!canConfirm) return
    setSaving(true)
    setSaveError(null)
    try {
      const confirmedSections = sections.map(s => ({
        unit: s.unit as 'oz' | 'lbs',
        weights: s.weights.map(w => parseFloat(w)).filter(w => !isNaN(w) && w > 0),
        zoneColumns: s.zoneColumns,
        prices: s.prices,
      }))
      const res = await fetch('/api/rate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tplId, name: name.trim(), sections: confirmedSections }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveError(data.error ?? 'Save failed')
        return
      }
      onSuccess({ ...data.card, entries: [] })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30 space-y-4">
      {/* Rate card name — always visible */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 w-24 shrink-0">Card Name</label>
        <input
          type="text"
          placeholder="e.g., Ground, Priority, Economy"
          value={name}
          onChange={e => setName(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1 max-w-xs"
        />
      </div>

      {/* ── Step 1: Input ─────────────────────────────────────────────────────── */}
      {step === 'input' && (
        <>
          {/* Input mode tabs */}
          <div className="border-b border-gray-200">
            <div className="flex gap-5">
              {(['upload', 'paste'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'upload' ? 'Upload File' : 'Paste Values'}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'upload' ? (
            <div
              onDragOver={e => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:border-gray-400'
              }`}
            >
              <p className="text-sm text-gray-600">Drop a CSV or Excel file here, or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Accepts .csv, .xlsx, .xls</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                rows={8}
                placeholder="Paste price values from your spreadsheet (tab-separated). Include header row with zone numbers if available."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                spellCheck={false}
              />
              <Button size="sm" onClick={handleParse} disabled={parsing || !pasteText.trim()}>
                Parse
              </Button>
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
              {parseErrors.map((err, i) => (
                <p key={i} className="text-sm text-red-700">
                  {err}
                </p>
              ))}
            </div>
          )}

          {parsing && <p className="text-sm text-gray-500">Parsing…</p>}

          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {/* ── Step 2: Preview & Confirm ──────────────────────────────────────────── */}
      {step === 'preview' && (
        <>
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 space-y-1">
              <p className="text-xs font-semibold text-yellow-800 mb-1">Notices</p>
              {warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-800">
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Sections */}
          {sections.map((section, sIdx) => (
            <div key={sIdx} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              {/* Section header row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-gray-700">Section {sIdx + 1}</span>

                {/* Unit toggle — highlighted orange when unit not yet selected */}
                <div
                  className={`flex gap-1 rounded-md ${
                    section.unit === null ? 'ring-2 ring-orange-400 ring-offset-1' : ''
                  }`}
                >
                  {(['oz', 'lbs'] as const).map(u => (
                    <button
                      key={u}
                      onClick={() => updateUnit(sIdx, u)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        section.unit === u
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                {section.unit === null && (
                  <span className="text-xs font-medium text-orange-600">Select unit to continue</span>
                )}
                {section.unit !== null && section.unitConfidence === 'low' && (
                  <span className="text-xs text-gray-400">(auto-detected — verify)</span>
                )}

                <span className="text-xs text-gray-400 ml-auto">
                  {section.weights.length} rows · zones {section.zoneColumns[0]}–
                  {section.zoneColumns[section.zoneColumns.length - 1]}
                </span>
              </div>

              {/* Price preview table */}
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-2 py-1 text-left font-medium text-gray-500 w-16">
                        Weight
                      </th>
                      {section.zoneColumns.map(z => (
                        <th
                          key={z}
                          className="border border-gray-200 px-2 py-1 text-center font-medium text-gray-500 min-w-[3rem]"
                        >
                          Z{z}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.weights.map((weight, rIdx) => (
                      <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border border-gray-200 px-1 py-0.5">
                          <input
                            type="text"
                            value={weight}
                            onChange={e => updateWeight(sIdx, rIdx, e.target.value)}
                            className="w-full text-xs font-mono text-right bg-transparent focus:outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5"
                          />
                        </td>
                        {(section.prices[rIdx] ?? []).map((price, zIdx) => (
                          <td
                            key={zIdx}
                            className={`border border-gray-200 px-2 py-0.5 text-right font-mono ${
                              price === null ? 'bg-red-50 text-red-400' : 'text-gray-700'
                            }`}
                          >
                            {price === null ? '—' : `$${price.toFixed(2)}`}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Save error */}
          {saveError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}

          {!name.trim() && (
            <p className="text-sm text-orange-600">Enter a rate card name above before confirming.</p>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setStep('input')}>
              Back
            </Button>
            <Button size="sm" onClick={handleConfirm} disabled={!canConfirm || saving}>
              {saving ? 'Saving…' : 'Confirm Import'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
