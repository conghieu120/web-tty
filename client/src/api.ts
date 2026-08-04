import { apiURL } from './config'

export type ApiError = { error: string }

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ApiError
    return body.error || res.statusText
  } catch {
    return res.statusText || 'request failed'
  }
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiURL(path), {
    ...init,
    credentials: 'include',
  })
}

export async function apiMe(): Promise<boolean> {
  const res = await apiFetch('/api/me')
  return res.ok
}

export async function apiLogin(password: string): Promise<void> {
  const res = await apiFetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
}

export async function apiLogout(): Promise<void> {
  await apiFetch('/api/logout', { method: 'POST' })
}

export async function apiTerminalOpen(): Promise<number> {
  const res = await apiFetch('/api/terminal/open', { method: 'POST' })
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
  const body = (await res.json()) as { ok: boolean; id: number }
  return body.id
}

export async function apiTerminalClose(id: number): Promise<void> {
  await apiFetch(`/api/terminal/${id}/close`, { method: 'POST' })
}

export async function apiTerminalInput(id: number, data: string): Promise<void> {
  const res = await apiFetch(`/api/terminal/${id}/input`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
}

export async function apiTerminalResize(
  id: number,
  rows: number,
  cols: number,
): Promise<void> {
  const res = await apiFetch(`/api/terminal/${id}/resize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, cols }),
  })
  if (!res.ok) {
    throw new Error(await parseError(res))
  }
}
