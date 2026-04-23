'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProviderRateCardSection } from '@/components/rate-card/ProviderRateCardSection'
import type { AnalysisData, ProviderGroup, WarehouseWithRateCards } from './types'
import { groupByProvider } from './types'
import { normalizeZip } from '@/lib/utils/zip'

interface Props {
  analysis: AnalysisData
  onChanged: () => void
}

// ─── Add Provider Modal ────────────────────────────────────────────────────────

interface AddProviderForm {
  providerName: string
  locationLabel: string
  originZip: string
}

function AddProviderModal({
  existingProviders,
  onSave,
  onCancel,
}: {
  existingProviders: string[]
  onSave: (form: AddProviderForm) => Promise<void>
  onCancel: () => void
}) {
  const [form, setForm] = useState<AddProviderForm>({
    providerName: '',
    locationLabel: '',
    originZip: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])

  function handleProviderNameChange(val: string) {
    setForm((f) => ({ ...f, providerName: val }))
    setSuggestions(
      val.trim().length > 0
        ? existingProviders.filter((p) => p.toLowerCase().includes(val.toLowerCase())).slice(0, 5)
        : [],
    )
  }

  async function submit() {
    if (!form.providerName.trim() || !form.locationLabel.trim() || !form.originZip.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isValid =
    form.providerName.trim().length > 0 &&
    form.locationLabel.trim().length > 0 &&
    form.originZip.trim().length > 0

  const inputClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Provider</h3>

        <div className="space-y-3">
          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Provider Name (3PL brand)<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.providerName}
              onChange={(e) => handleProviderNameChange(e.target.value)}
              placeholder='e.g., "Selery", "Red Stag"'
              className={inputClass}
              autoFocus
            />
            {suggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-sm mt-0.5">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setForm((f) => ({ ...f, providerName: s }))
                      setSuggestions([])
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    {s}{' '}
                    <span className="text-xs text-gray-400 dark:text-gray-500">(add another location)</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Location Label<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.locationLabel}
              onChange={(e) => setForm((f) => ({ ...f, locationLabel: e.target.value }))}
              placeholder='e.g., "Reno, NV"'
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Origin ZIP<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="text"
              value={form.originZip}
              onChange={(e) => setForm((f) => ({ ...f, originZip: e.target.value }))}
              onBlur={(e) =>
                setForm((f) => ({ ...f, originZip: normalizeZip(e.target.value) }))
              }
              placeholder="e.g., 89502"
              maxLength={5}
              className={inputClass}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!isValid || saving}>
            {saving ? 'Adding…' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Location Row ─────────────────────────────────────────────────────────────

function LocationRow({
  warehouse,
  onUpdate,
  onDelete,
}: {
  warehouse: WarehouseWithRateCards
  onUpdate: (patch: Record<string, unknown>) => Promise<void>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState<Record<string, string | boolean | number | null>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const label = (editing.locationLabel as string | undefined) ?? warehouse.locationLabel
  const zip = (editing.originZip as string | undefined) ?? warehouse.originZip
  const dimEnabled =
    editing.dimWeightEnabled !== undefined
      ? (editing.dimWeightEnabled as boolean)
      : warehouse.dimWeightEnabled
  const dimFactor =
    editing.dimFactor !== undefined
      ? (editing.dimFactor as number | null)
      : warehouse.dimFactor
  const surcharge =
    editing.surchargeFlatCents !== undefined
      ? (editing.surchargeFlatCents as number)
      : warehouse.surchargeFlatCents
  const notes = (editing.notes as string | undefined) ?? warehouse.notes ?? ''

  const isDirty = Object.keys(editing).length > 0

  async function save() {
    if (!isDirty) return
    setSaving(true)
    setError(null)
    try {
      const patch: Record<string, unknown> = {}
      if (editing.locationLabel !== undefined) patch.location_label = editing.locationLabel
      if (editing.originZip !== undefined)
        patch.origin_zip = normalizeZip(editing.originZip as string)
      if (editing.dimWeightEnabled !== undefined) patch.dim_weight_enabled = editing.dimWeightEnabled
      if (editing.dimFactor !== undefined) patch.dim_factor = editing.dimFactor
      if (editing.surchargeFlatCents !== undefined)
        patch.surcharge_flat_cents = editing.surchargeFlatCents
      if (editing.notes !== undefined) patch.notes = editing.notes || null
      await onUpdate(patch)
      setEditing({})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function field<K extends keyof typeof editing>(key: K, val: (typeof editing)[K]) {
    setEditing((prev) => ({ ...prev, [key]: val }))
  }

  const inputClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3 bg-white dark:bg-gray-800">
      {showDeleteModal && (
        <Modal
          title="Delete location?"
          message={`Remove "${warehouse.locationLabel}" (${warehouse.originZip})? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setShowDeleteModal(false)
            onDelete()
          }}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Location Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => field('locationLabel', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Origin ZIP</label>
          <input
            type="text"
            value={zip}
            onChange={(e) => field('originZip', e.target.value)}
            onBlur={(e) => field('originZip', normalizeZip(e.target.value))}
            maxLength={5}
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={dimEnabled}
            onChange={(e) => field('dimWeightEnabled', e.target.checked)}
            className="rounded"
          />
          Dim weight
        </label>
        {dimEnabled && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 dark:text-gray-400">Dim factor</label>
            <input
              type="number"
              value={dimFactor ?? ''}
              onChange={(e) =>
                field('dimFactor', e.target.value ? Number(e.target.value) : null)
              }
              placeholder="e.g., 139"
              className="w-20 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 dark:text-gray-400">Flat surcharge</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-500">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={surcharge / 100}
              onChange={(e) => field('surchargeFlatCents', Math.round(parseFloat(e.target.value || '0') * 100))}
              className="w-20 border border-gray-300 dark:border-gray-600 rounded-md pl-5 pr-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes (optional)</label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => field('notes', e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowDeleteModal(true)}
          className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
        >
          Delete location
        </button>
        {isDirty && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing({})}
              disabled={saving}
            >
              Discard
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Provider Card ────────────────────────────────────────────────────────────

function ProviderCard({
  group,
  analysisId,
  onChanged,
}: {
  group: ProviderGroup
  analysisId: number
  onChanged: () => void
}) {
  const [collapsed, setCollapsed] = useState(true)
  const [addingLocation, setAddingLocation] = useState(false)
  const [addLocationForm, setAddLocationForm] = useState({ locationLabel: '', originZip: '' })
  const [addingLoc, setAddingLoc] = useState(false)
  const [addLocError, setAddLocError] = useState<string | null>(null)
  const [showDeleteProviderModal, setShowDeleteProviderModal] = useState(false)

  const isMultiNode = group.warehouses.length > 1

  async function addLocation() {
    if (!addLocationForm.locationLabel.trim() || !addLocationForm.originZip.trim()) return
    setAddingLoc(true)
    setAddLocError(null)
    try {
      const res = await fetch(`/api/analyses/${analysisId}/warehouses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_name: group.providerName,
          location_label: addLocationForm.locationLabel.trim(),
          origin_zip: normalizeZip(addLocationForm.originZip),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddLocError(data?.error?.message ?? 'Failed to add location')
        return
      }
      setAddingLocation(false)
      setAddLocationForm({ locationLabel: '', originZip: '' })
      onChanged()
    } catch (e) {
      setAddLocError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setAddingLoc(false)
    }
  }

  async function updateWarehouse(warehouseId: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/warehouses/${warehouseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data?.error?.message ?? 'Update failed')
    }
    onChanged()
  }

  async function deleteWarehouse(warehouseId: number) {
    const res = await fetch(`/api/warehouses/${warehouseId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data?.error?.message ?? 'Delete failed')
    }
    onChanged()
  }

  async function deleteProvider() {
    await Promise.all(group.warehouses.map((wh) => deleteWarehouse(wh.id)))
    onChanged()
  }

  const addLocInputClass = 'w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {showDeleteProviderModal && (
        <Modal
          title={`Delete provider "${group.providerName}"?`}
          message={`This will remove all ${group.warehouses.length} location${group.warehouses.length !== 1 ? 's' : ''} and their rate cards. This cannot be undone.`}
          confirmLabel="Delete Provider"
          onConfirm={() => {
            setShowDeleteProviderModal(false)
            deleteProvider()
          }}
          onCancel={() => setShowDeleteProviderModal(false)}
        />
      )}

      {/* Card header */}
      <div
        className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between gap-3 flex-wrap border-b border-gray-200 dark:border-gray-700 cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500 text-xs">{collapsed ? '▶' : '▼'}</span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">{group.providerName}</span>
          {isMultiNode && (
            <>
              <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-medium">
                multi-node
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {group.warehouses.length} locations
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs font-medium ${group.rateCard ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}
          >
            {group.rateCard ? group.rateCard.name : 'No rate card'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowDeleteProviderModal(true) }}
            title="Delete provider"
            className="w-5 h-5 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 dark:hover:text-red-400 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && <div className="p-4 space-y-4 bg-white dark:bg-gray-900">
        {/* Rate card section */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Rate Card
          </p>
          <ProviderRateCardSection
            providerName={group.providerName}
            warehouses={group.warehouses}
            rateCard={group.rateCard}
            onRateCardChanged={onChanged}
          />
        </div>

        {/* Locations */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Locations
          </p>
          <div className="space-y-2">
            {group.warehouses.map((wh) => (
              <LocationRow
                key={wh.id}
                warehouse={wh}
                onUpdate={(patch) => updateWarehouse(wh.id, patch)}
                onDelete={() => deleteWarehouse(wh.id)}
              />
            ))}
          </div>
        </div>

        {/* Add location */}
        {addingLocation ? (
          <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 space-y-3 bg-gray-50 dark:bg-gray-800">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">New location for {group.providerName}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Location Label<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={addLocationForm.locationLabel}
                  onChange={(e) =>
                    setAddLocationForm((f) => ({ ...f, locationLabel: e.target.value }))
                  }
                  placeholder='e.g., "Dallas, TX"'
                  className={addLocInputClass}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Origin ZIP<span className="text-red-500 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  value={addLocationForm.originZip}
                  onChange={(e) =>
                    setAddLocationForm((f) => ({ ...f, originZip: e.target.value }))
                  }
                  onBlur={(e) =>
                    setAddLocationForm((f) => ({
                      ...f,
                      originZip: normalizeZip(e.target.value),
                    }))
                  }
                  maxLength={5}
                  placeholder="e.g., 75201"
                  className={`${addLocInputClass} font-mono`}
                />
              </div>
            </div>
            {addLocError && <p className="text-xs text-red-600 dark:text-red-400">{addLocError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={addLocation}
                disabled={
                  addingLoc ||
                  !addLocationForm.locationLabel.trim() ||
                  !addLocationForm.originZip.trim()
                }
              >
                {addingLoc ? 'Adding…' : 'Add Location'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setAddingLocation(false)
                  setAddLocationForm({ locationLabel: '', originZip: '' })
                  setAddLocError(null)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingLocation(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Add location
          </button>
        )}
      </div>}
    </div>
  )
}

// ─── ProvidersTab ─────────────────────────────────────────────────────────────

export function ProvidersTab({ analysis, onChanged }: Props) {
  const [showAddProvider, setShowAddProvider] = useState(false)
  const providers = groupByProvider(analysis.warehouses)
  const allProviderNames = providers.map((p) => p.providerName)

  async function addProvider(form: AddProviderForm) {
    const res = await fetch(`/api/analyses/${analysis.id}/warehouses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider_name: form.providerName.trim(),
        location_label: form.locationLabel.trim(),
        origin_zip: normalizeZip(form.originZip),
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message ?? 'Failed to add provider')
    setShowAddProvider(false)
    onChanged()
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Providers</h2>
      </div>

      {showAddProvider && (
        <AddProviderModal
          existingProviders={allProviderNames}
          onSave={addProvider}
          onCancel={() => setShowAddProvider(false)}
        />
      )}

      {providers.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-10 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No providers yet.</p>
          <Button onClick={() => setShowAddProvider(true)}>Add First Provider</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((group) => (
            <ProviderCard
              key={group.providerName}
              group={group}
              analysisId={analysis.id}
              onChanged={onChanged}
            />
          ))}
          <Button variant="secondary" onClick={() => setShowAddProvider(true)}>
            + Add Provider
          </Button>
        </div>
      )}
    </div>
  )
}
