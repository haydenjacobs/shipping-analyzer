import { NextRequest, NextResponse } from 'next/server'
import { runAnalysis, AnalysisNotFoundError, AnalysisEngineError } from '@/lib/engine'
import { apiError, notFound } from '../../../_lib/errors'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  try {
    const result = runAnalysis(id)
    return NextResponse.json({
      included_count: result.includedCount,
      excluded_count: result.excludedCount,
      warehouses: result.warehouses,
    })
  } catch (e) {
    if (e instanceof AnalysisNotFoundError) return notFound('Analysis')
    if (e instanceof AnalysisEngineError) {
      return apiError('ENGINE_ERROR', e.message, 500)
    }
    const message = e instanceof Error ? e.message : String(e)
    return apiError('INTERNAL_ERROR', message, 500)
  }
}
