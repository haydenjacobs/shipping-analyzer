/**
 * Standardized API error shape: { error: { code, message, details? } }
 *
 * Codes:
 *   - VALIDATION_ERROR   — request body/params/query failed zod validation
 *   - NOT_FOUND          — referenced row does not exist
 *   - PARSE_ERROR        — uploaded file could not be parsed / had structural issues
 *   - ENGINE_ERROR       — calculation engine produced an unrecoverable failure
 *   - CONFLICT           — write rejected because state already exists (e.g. zone map present)
 *   - BAD_REQUEST        — malformed request (e.g. not multipart, unknown fields)
 *   - INTERNAL_ERROR     — uncaught server error
 */
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'PARSE_ERROR'
  | 'ENGINE_ERROR'
  | 'CONFLICT'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown }
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined ? { details } : {}) } }
  return NextResponse.json(body, { status })
}

export function zodErrorResponse(err: ZodError, message = 'Invalid request'): NextResponse<ApiErrorBody> {
  return apiError('VALIDATION_ERROR', message, 400, err.issues)
}

export function notFound(entity: string): NextResponse<ApiErrorBody> {
  return apiError('NOT_FOUND', `${entity} not found`, 404)
}
