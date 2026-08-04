const STORAGE_KEY = 'web-tty-api-base'

/** Build-time default (optional). Empty = user must enter a server URL. */
const ENV_DEFAULT =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || ''

/** Normalize user input into an absolute API base (no trailing slash). */
export function normalizeApiBase(raw: string): string {
  let u = raw.trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`
  }
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
    // Drop path/query/hash — API base is origin (+ optional path prefix later if needed)
    const path = parsed.pathname.replace(/\/$/, '')
    return `${parsed.origin}${path === '/' ? '' : path}`
  } catch {
    return ''
  }
}

export function getApiBase(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored != null && stored !== '') {
      return normalizeApiBase(stored) || stored.replace(/\/$/, '')
    }
  } catch {
    /* ignore */
  }
  return ENV_DEFAULT
}

export function setApiBase(url: string): void {
  const normalized = normalizeApiBase(url)
  if (!normalized) {
    throw new Error('invalid server URL')
  }
  localStorage.setItem(STORAGE_KEY, normalized)
}

export function hasApiBase(): boolean {
  return getApiBase() !== ''
}

export function apiURL(path: string): string {
  const base = getApiBase()
  if (!base) {
    throw new Error('server URL not configured')
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Compact label for header / tab title (host[:port][/path]). */
export function displayServerHost(base = getApiBase()): string {
  if (!base) return ''
  try {
    const u = new URL(base)
    const path = u.pathname.replace(/\/$/, '')
    return `${u.host}${path && path !== '/' ? path : ''}`
  } catch {
    return base.replace(/^https?:\/\//i, '')
  }
}
