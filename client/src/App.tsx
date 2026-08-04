import { useCallback, useState } from 'react'
import { LoginScreen } from './LoginScreen'
import { TerminalView } from './TerminalView'

type Phase = 'login' | 'terminal' | 'disconnected'

export default function App() {
  const [phase, setPhase] = useState<Phase>('login')

  const onDisconnected = useCallback(() => {
    setPhase('disconnected')
  }, [])

  if (phase === 'login') {
    return <LoginScreen onSuccess={() => setPhase('terminal')} />
  }

  if (phase === 'disconnected') {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="font-mono text-xs tracking-[0.2em] text-[var(--accent)] uppercase">
          web-tty
        </p>
        <h1 className="text-xl font-semibold">Disconnected</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Stream closed. Reload the page to start a new session.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[#0c0f0c] hover:bg-[var(--accent-dim)]"
        >
          Reload
        </button>
      </div>
    )
  }

  return (
    <TerminalView
      onLogout={() => setPhase('login')}
      onDisconnected={onDisconnected}
    />
  )
}
