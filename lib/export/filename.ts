export function slugifyAnalysisName(name: string, analysisId: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
  if (slug === '') return `analysis-${analysisId}`
  return slug
}
