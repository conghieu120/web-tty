import { useState, type FormEvent } from 'react'
import { apiLogin } from './api'
import { getApiBase, normalizeApiBase, setApiBase } from './config'
import { SettingsButton } from './SettingsButton'

type Props = {
  onSuccess: () => void
}

export function LoginScreen({ onSuccess }: Props) {
  const [serverUrl, setServerUrl] = useState(() => getApiBase())
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const base = normalizeApiBase(serverUrl)
    if (!base) {
      setError('Enter a valid server URL (e.g. https://tty.example.com)')
      return
    }

    setLoading(true)
    try {
      setApiBase(base)
      setServerUrl(base)
      await apiLogin(password)
      onSuccess()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'login failed'
      if (
        msg === 'Failed to fetch' ||
        msg === 'NetworkError when attempting to fetch resource.' ||
        msg.includes('NetworkError') ||
        msg.includes('fetch')
      ) {
        setError('Cannot reach server. Check the URL and your network.')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center px-4">
      <div className="absolute top-4 right-4">
        <SettingsButton />
      </div>

      <div
        className="w-full max-w-sm border border-[var(--border)] bg-[var(--panel)] p-8"
        style={{
          backgroundImage:
            'radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 12%, transparent), transparent 55%)',
        }}
      >
        <p className="mb-1 font-mono text-xs tracking-[0.2em] text-[var(--accent)] uppercase">
          web-tty
        </p>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Terminal</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
            Server URL
            <input
              type="text"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              placeholder="https://tty.example.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-mono text-sm text-[var(--text)]"
              disabled={loading}
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-[var(--muted)]">
            Password
            <input
              type="password"
              autoComplete="current-password"
              autoFocus={!serverUrl}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-mono text-[var(--text)]"
              disabled={loading}
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || !password || !serverUrl.trim()}
            className="mt-2 bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--accent-dim)]"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
