// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareButton } from '@/components/results/ShareButton'

// Build a minimal Response-like object that satisfies what ShareButton calls.
function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }
}

function mockFetch(handler: (url: string, init?: RequestInit) => ReturnType<typeof mockResponse>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => handler(url, init)))
}

function mockClipboard(): string[] {
  const written: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(async (text: string) => { written.push(text) }) },
    writable: true,
    configurable: true,
  })
  return written
}

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── no existing token ────────────────────────────────────────────────────────

describe('ShareButton — no existing token', () => {
  it('renders Share button only when no token', () => {
    render(<ShareButton analysisId={1} initialToken={null} />)
    expect(screen.getByRole('button', { name: /Share/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Revoke/i })).toBeNull()
  })

  it('calls POST /api/analyses/1/share on click', async () => {
    const captured: string[] = []
    mockFetch((url, init) => {
      captured.push(`${init?.method ?? 'GET'}:${url}`)
      return mockResponse(200, { token: 'abc-123', url: 'http://localhost/share/abc-123' })
    })
    mockClipboard()

    render(<ShareButton analysisId={1} initialToken={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Share/i }))

    await waitFor(() => {
      expect(captured.some((c) => c.startsWith('POST') && c.includes('/api/analyses/1/share'))).toBe(true)
    })
  })

  it('shows "Link copied!" after successful generate', async () => {
    mockFetch(() => mockResponse(200, { token: 't1', url: 'http://localhost/share/t1' }))
    mockClipboard()

    render(<ShareButton analysisId={1} initialToken={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Share/i }))

    await waitFor(() => {
      expect(screen.getByText('Link copied!')).toBeDefined()
    })
  })

  it('copies the share URL to clipboard', async () => {
    mockFetch(() => mockResponse(200, { token: 'tok-xyz', url: 'http://localhost/share/tok-xyz' }))
    const written = mockClipboard()

    render(<ShareButton analysisId={1} initialToken={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Share/i }))

    await waitFor(() => expect(written.length).toBeGreaterThan(0))
    expect(written[0]).toContain('/share/tok-xyz')
  })

  it('shows Revoke button after successful generate', async () => {
    mockFetch(() => mockResponse(200, { token: 'tok-new', url: 'http://localhost/share/tok-new' }))
    mockClipboard()

    render(<ShareButton analysisId={1} initialToken={null} />)
    await userEvent.click(screen.getByRole('button', { name: /Share/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Revoke link/i })).not.toBeNull()
    })
  })
})

// ─── existing token ───────────────────────────────────────────────────────────

describe('ShareButton — existing token', () => {
  it('renders Share and Revoke link buttons when token exists', () => {
    render(<ShareButton analysisId={1} initialToken="existing-token" />)
    expect(screen.getByRole('button', { name: /Share/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Revoke link/i })).toBeDefined()
  })

  it('calls DELETE /api/analyses/1/share on revoke click', async () => {
    const captured: string[] = []
    mockFetch((url, init) => {
      captured.push(`${init?.method ?? 'GET'}:${url}`)
      return mockResponse(200, { revoked: true })
    })

    render(<ShareButton analysisId={1} initialToken="existing-token" />)
    await userEvent.click(screen.getByRole('button', { name: /Revoke link/i }))

    await waitFor(() => {
      expect(captured.some((c) => c.startsWith('DELETE') && c.includes('/api/analyses/1/share'))).toBe(true)
    })
  })

  it('hides Revoke link button after successful revocation', async () => {
    mockFetch(() => mockResponse(200, { revoked: true }))

    render(<ShareButton analysisId={1} initialToken="existing-token" />)
    await userEvent.click(screen.getByRole('button', { name: /Revoke link/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Revoke link/i })).toBeNull()
    })
  })
})
