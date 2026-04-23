/**
 * POST /api/analyses/[id]/share
 * Generate or refresh a shareable token. Always issues a new UUID, revoking
 * any prior link. Returns { token, url }.
 *
 * DELETE /api/analyses/[id]/share
 * Revoke the shareable link — sets shareable_token to null. Old URLs 404
 * immediately on the public GET /api/share/[token] route.
 *
 * Security model: token is crypto.randomUUID() (UUID v4, 122 bits of
 * randomness, unguessable). No auth is required to view a share link — anyone
 * with the URL can read the analysis. Revocation is instant. The tool is
 * single-user so there is no concept of "wrong user seeing someone else's data."
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { apiError, notFound } from '../../../_lib/errors'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const row = db.select().from(analyses).where(eq(analyses.id, id)).get()
  if (!row) return notFound('Analysis')

  const token = crypto.randomUUID()
  db.update(analyses)
    .set({ shareableToken: token, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(analyses.id, id))
    .run()

  const reqUrl = new URL(req.url)
  const url = `${reqUrl.protocol}//${reqUrl.host}/share/${token}`
  return NextResponse.json({ token, url })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const result = db
    .update(analyses)
    .set({ shareableToken: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(analyses.id, id))
    .returning({ id: analyses.id })
    .all()

  if (result.length === 0) return notFound('Analysis')
  return NextResponse.json({ revoked: true })
}
