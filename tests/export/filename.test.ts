import { describe, it, expect } from 'vitest'
import { slugifyAnalysisName } from '@/lib/export/filename'

describe('slugifyAnalysisName', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyAnalysisName('Client X — Q1 2025', 7)).toBe('client-x-q1-2025')
  })

  it('collapses multiple hyphens and strips edges', () => {
    expect(slugifyAnalysisName('  Foo!!--Bar  ', 7)).toBe('foo-bar')
  })

  it('preserves digits', () => {
    expect(slugifyAnalysisName('2026 Q1', 7)).toBe('2026-q1')
  })

  it('falls back to analysis-<id> for empty slug', () => {
    expect(slugifyAnalysisName('🤖🚀', 42)).toBe('analysis-42')
    expect(slugifyAnalysisName('', 3)).toBe('analysis-3')
  })
})
