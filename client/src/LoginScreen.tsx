import { useState, type FormEvent } from 'react'
import { apiLogin } from './api'
import { SettingsButton } from './SettingsButton'

type Props = {
  onSuccess: () => void
}

export function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await apiLogin(password)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'login failed')
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
            Password
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 font-mono text-[var(--text)]"
              disabled={loading}
            />
          </label>
          {error ? (
            <p className="text-sm text-[var(--danger)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading || !password}
            className="mt-2 bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[var(--accent-dim)]"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
