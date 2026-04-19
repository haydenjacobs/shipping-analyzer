/**
 * Normalizes a ZIP code to 5 digits, left-padding with zeros.
 * Excel often truncates leading zeros (e.g., 01234 becomes 1234).
 */
export function normalizeZip(raw: string | number): string {
  const str = String(raw).trim().replace(/\D/g, '')
  if (str.length === 0) return ''
  return str.padStart(5, '0')
}

export function getZip3(zip5: string): string {
  return zip5.substring(0, 3)
}

export function isValidZip5(zip: string): boolean {
  return /^\d{5}$/.test(zip)
}
