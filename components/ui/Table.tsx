import { HTMLAttributes, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className = '', children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={`min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
}

export function Thead({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-gray-50 dark:bg-gray-800 ${className}`} {...props}>
      {children}
    </thead>
  )
}

export function Tbody({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 ${className}`} {...props}>
      {children}
    </tbody>
  )
}

export function Th({ className = '', children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${className}`} {...props}>
      {children}
    </th>
  )
}

export function Td({ className = '', children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-gray-700 dark:text-gray-300 ${className}`} {...props}>
      {children}
    </td>
  )
}
