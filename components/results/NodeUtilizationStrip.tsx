'use client'

interface Props {
  /** Only included locations should be passed in — excluded locations never
   *  appear in the strip. */
  entries: Array<{ locationLabel: string; percent: number }>
}

export function NodeUtilizationStrip({ entries }: Props) {
  if (entries.length === 0) return null
  return (
    <div className="px-4 py-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
      {entries
        .map((e) => `${e.locationLabel} ${Math.round(e.percent * 100)}%`)
        .join(' · ')}
    </div>
  )
}
