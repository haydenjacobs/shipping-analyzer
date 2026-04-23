'use client'

import { ResultsView } from '@/components/results/ResultsView'
import type { AnalysisData } from './types'

interface Props {
  analysis: AnalysisData
}

export function ResultsTab({ analysis }: Props) {
  return <ResultsView analysisId={analysis.id} />
}
