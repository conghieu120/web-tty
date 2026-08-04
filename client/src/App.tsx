import { useCallback, useEffect, useState } from 'react'
import { apiMe } from './api'
import { displayServerHost, getApiBase, hasApiBase } from './config'
import { LoginScreen } from './LoginScreen'
import { SettingsButton } from './SettingsButton'
import { TerminalView } from './TerminalView'

type Phase = 'boot' | 'login' | 'terminal' | 'disconnected'

const DEFAULT_TITLE = 'web-tty'

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot')
  const [disconnectReason, setDisconnectReason] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!hasApiBase()) {
        if (!cancelled) setPhase('login')
        return
      }
      try {
        const ok = await apiMe()
        if (!cancelled) {
          setPhase(ok ? 'terminal' : 'login')
        }
      } catch {
        if (!cancelled) setPhase('login')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const host = displayServerHost()
    const sess = sessionId != null ? `#${sessionId}` : null
    if (phase === 'terminal' && host) {
      document.title = sess
        ? `${sess} · ${DEFAULT_TITLE}`
        : `${DEFAULT_TITLE}`
    } else if (phase === 'disconnected' && host) {
      document.title = sess
        ? `Disconnected · $${sess} · ${DEFAULT_TITLE}`
        : `Disconnected · $${DEFAULT_TITLE}`
    } else {
      document.title = DEFAULT_TITLE
    }
  }, [phase, sessionId])

  const onDisconnected = useCallback((reason?: string) => {
    setDisconnectReason(reason ?? null)
    setPhase('disconnected')
  }, [])

  const onSessionId = useCallback((id: number | null) => {
    setSessionId(id)
  }, [])

  if (phase === 'boot') {
    return (
      <div className="relative flex min-h-full items-center justify-center px-4">
        <div className="absolute top-4 right-4">
          <SettingsButton />
        </div>
        <p className="font-mono text-xs tracking-[0.2em] text-[var(--muted)] uppercase">
          connecting…
        </p>
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <LoginScreen
        onSuccess={() => {
          setSessionId(null)
          setPhase('terminal')
        }}
      />
    )
  }

  if (phase === 'disconnected') {
    const server = getApiBase()
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="absolute top-4 right-4">
          <SettingsButton />
        </div>
        <p className="font-mono text-xs tracking-[0.2em] text-[var(--accent)] uppercase">
          web-tty
        </p>
        <h1 className="text-xl font-semibold">Connection lost</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          {disconnectReason ||
            'The terminal stream closed (network drop, server restart, or idle timeout).'}
        </p>
        {(server || sessionId != null) && (
          <p className="max-w-sm break-all font-mono text-xs text-[var(--muted)]">
            {[server, sessionId != null ? `#${sessionId}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              setDisconnectReason(null)
              setSessionId(null)
              setPhase('terminal')
            }}
            className="bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-dim)]"
          >
            Reconnect
          </button>
          <button
            type="button"
            onClick={() => {
              setDisconnectReason(null)
              setSessionId(null)
              setPhase('login')
            }}
            className="border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            Change server
          </button>
        </div>
      </div>
    )
  }

  return (
    <TerminalView
      onLogout={() => {
        setSessionId(null)
        setPhase('login')
      }}
      onDisconnected={onDisconnected}
      onSessionId={onSessionId}
    />
  )
}
