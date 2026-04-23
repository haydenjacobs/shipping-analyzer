interface Props {
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'gray'
  children: React.ReactNode
}

export function Badge({ color = 'gray', children }: Props) {
  const colors = {
    green: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300',
    red: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300',
    blue: 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300',
    gray: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300',
  }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  )
}
