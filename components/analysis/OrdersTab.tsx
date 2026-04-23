'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ColumnMapper, type ColumnMappingValues } from '@/components/upload/ColumnMapper'

interface Props {
  analysisId: number
  orderCount: number
  onOrdersChanged: () => void
}

type UploadStep = 'idle' | 'mapping' | 'importing' | 'success' | 'error'

interface ParsedFile {
  headers: string[]
  rows: Record<string, string>[]
  file: File
}

interface ImportResult {
  imported: number
  failed: number
  failures: Array<{ rowIndex: number; reason: string }>
  total: number
}

async function readFileHeaders(file: File): Promise<ParsedFile> {
  if (file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text()
    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      preview: 50,
    })
    return {
      headers: result.meta.fields ?? [],
      rows: result.data,
      file,
    }
  }
  // Excel: use SheetJS (server bundle won't tree-shake it, but it's already in deps)
  const { read, utils } = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = read(buf)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  return { headers, rows: rows.slice(0, 50), file }
}

export function OrdersTab({ analysisId, orderCount, onOrdersChanged }: Props) {
  const [step, setStep] = useState<UploadStep>('idle')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [showReplaceModal, setShowReplaceModal] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function startMapping(file: File) {
    try {
      const result = await readFileHeaders(file)
      if (result.headers.length === 0) {
        setParseError('Could not read any column headers from the file.')
        return
      }
      setParsed(result)
      setStep('mapping')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to read file')
    }
  }

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null)
      if (orderCount > 0) {
        setPendingFile(file)
        setShowReplaceModal(true)
        return
      }
      await startMapping(file)
    },
    [orderCount],
  )

  async function handleConfirmMapping(mapping: ColumnMappingValues) {
    if (!parsed) return
    setStep('importing')
    setImportError(null)

    const mappingPayload = {
      order_number: mapping.orderNumber,
      dest_zip: mapping.destZip,
      weight: mapping.weight,
      weight_unit: mapping.weightUnit,
      height: mapping.height ?? null,
      width: mapping.width ?? null,
      length: mapping.length ?? null,
      state: mapping.state ?? null,
    }

    const form = new FormData()
    form.append('mapping', JSON.stringify(mappingPayload))
    form.append('file', parsed.file)

    try {
      const res = await fetch(`/api/analyses/${analysisId}/orders`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data?.error?.message ?? 'Import failed')
        setStep('error')
        return
      }
      setImportResult(data)
      setStep('success')
      onOrdersChanged()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import request failed')
      setStep('error')
    }
  }

  function downloadFailuresCsv(failures: ImportResult['failures']) {
    const csv =
      'row,reason\n' +
      failures.map((f) => `${f.rowIndex},"${f.reason.replace(/"/g, '""')}"`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'import-failures.csv'
    a.click()
  }

  function resetToIdle() {
    setStep('idle')
    setParsed(null)
    setImportResult(null)
    setImportError(null)
    setParseError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const hasOrders = orderCount > 0
  const displayOrderCount = importResult ? importResult.imported : orderCount

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Orders</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Upload a CSV or Excel export from your OMS.</p>
      </div>

      {/* Replace confirm modal */}
      {showReplaceModal && (
        <Modal
          title="Replace existing orders?"
          message={`This analysis already has ${orderCount.toLocaleString()} orders. Uploading a new file will replace them all.`}
          confirmLabel="Replace"
          cancelLabel="Keep existing"
          variant="danger"
          onConfirm={async () => {
            setShowReplaceModal(false)
            if (pendingFile) await startMapping(pendingFile)
            setPendingFile(null)
          }}
          onCancel={() => {
            setShowReplaceModal(false)
            setPendingFile(null)
          }}
        />
      )}

      {/* Dropzone — idle or error state */}
      {(step === 'idle' || step === 'error') && (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const f = e.dataTransfer.files[0]
            if (f) handleFile(f)
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
        >
          <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
            Drop a CSV or Excel file here, or click to browse
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Accepts .csv, .xlsx, .xls</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      )}

      {parseError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{parseError}</p>
        </div>
      )}

      {step === 'error' && importError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md p-3">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">Import failed</p>
          <p className="text-sm text-red-600 dark:text-red-400 font-mono mt-1">{importError}</p>
        </div>
      )}

      {/* Column mapping step */}
      {step === 'mapping' && parsed && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
          <ColumnMapper
            headers={parsed.headers}
            sampleRows={parsed.rows}
            onConfirm={handleConfirmMapping}
            onCancel={resetToIdle}
          />
        </div>
      )}

      {/* Importing spinner */}
      {step === 'importing' && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
          <p className="text-sm text-blue-700 dark:text-blue-300">Importing orders…</p>
        </div>
      )}

      {/* Success */}
      {step === 'success' && importResult && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">
            Imported {importResult.imported.toLocaleString()} of {importResult.total.toLocaleString()} orders
            {importResult.failed > 0 && (
              <span className="text-amber-700 dark:text-amber-400">
                {' '}({importResult.failed.toLocaleString()} failed)
              </span>
            )}
          </p>
          {importResult.failed > 0 && (
            <button
              onClick={() => downloadFailuresCsv(importResult.failures)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Download failures CSV
            </button>
          )}
        </div>
      )}

      {/* Uploaded orders preview (after success or already-uploaded state) */}
      {hasOrders && step !== 'mapping' && step !== 'importing' && (
        <div className="space-y-3">
          {step !== 'success' && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong>{displayOrderCount.toLocaleString()}</strong> orders currently uploaded.
            </p>
          )}
          <OrderPreview analysisId={analysisId} />
          {step !== 'success' && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) handleFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">Replace orders — drop a new file or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}
          {step === 'success' && (
            <Button variant="secondary" size="sm" onClick={resetToIdle}>
              Upload another file
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// Small inline preview of uploaded orders
function OrderPreview({ analysisId }: { analysisId: number }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    if (loaded) return
    setLoading(true)
    try {
      const res = await fetch(`/api/analyses/${analysisId}/orders?pageSize=50`)
      const data = await res.json()
      setRows(data.rows ?? [])
      setTotal(data.total ?? 0)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }

  if (!loaded) {
    return (
      <button onClick={load} className="text-sm text-blue-600 dark:text-blue-400 hover:underline" disabled={loading}>
        {loading ? 'Loading preview…' : 'Show preview (first 50 rows)'}
      </button>
    )
  }

  if (!rows || rows.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Showing {rows.length} of {total.toLocaleString()} orders
      </p>
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg max-h-72 overflow-y-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr>
              {['Order #', 'Dest ZIP', 'Weight (lbs)', 'Dims', 'State'].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800'}>
                <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100">{String(r.orderNumber ?? '')}</td>
                <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100">{String(r.destZip ?? '')}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-700 dark:text-gray-300">
                  {r.actualWeightLbs != null ? Number(r.actualWeightLbs).toFixed(3) : '—'}
                </td>
                <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">
                  {r.length && r.width && r.height
                    ? `${r.length}×${r.width}×${r.height}`
                    : '—'}
                </td>
                <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{String(r.state ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
