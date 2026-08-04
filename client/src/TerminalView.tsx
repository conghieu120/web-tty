import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import {
  apiLogout,
  apiTerminalClose,
  apiTerminalInput,
  apiTerminalOpen,
  apiTerminalResize,
} from './api'
import { apiURL, displayServerHost, getApiBase } from './config'
import { SettingsButton } from './SettingsButton'
import { useTheme } from './ThemeProvider'

type Props = {
  onLogout: () => void
  onDisconnected: (reason?: string) => void
  onSessionId?: (id: number | null) => void
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export function TerminalView({ onLogout, onDisconnected, onSessionId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { theme } = useTheme()
  const [status, setStatus] = useState('connecting…')
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [busyLogout, setBusyLogout] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let es: EventSource | null = null
    let term: Terminal | null = null
    let fitAddon: FitAddon | null = null
    let resizeObserver: ResizeObserver | null = null
    let onWinResize: (() => void) | null = null
    let termId: number | null = null

    function sendResize() {
      if (!term || !fitAddon || termId == null) return
      fitAddon.fit()
      void apiTerminalResize(termId, term.rows, term.cols)
    }

    async function start() {
      try {
        termId = await apiTerminalOpen()
        if (cancelled) {
          await apiTerminalClose(termId)
          return
        }

        setSessionId(termId)
        onSessionId?.(termId)

        term = new Terminal({
          cursorBlink: true,
          fontFamily: '"IBM Plex Mono", Consolas, monospace',
          fontSize: 14,
          lineHeight: 1.2,
          theme: theme.xterm,
        })
        termRef.current = term
        fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(host!)
        fitAddon.fit()

        const id = termId
        term.onData((data) => {
          void apiTerminalInput(id, data)
        })

        es = new EventSource(apiURL(`/api/terminal/${id}/stream`), {
          withCredentials: true,
        })
        es.addEventListener('output', (ev) => {
          const data = (ev as MessageEvent).data as string
          term?.write(decodeBase64(data))
        })
        es.addEventListener('ping', () => {
          /* keepalive */
        })
        es.onopen = () => {
          if (!cancelled) {
            setStatus('connected')
            sendResize()
          }
        }
        es.onerror = () => {
          es?.close()
          if (!cancelled) {
            setStatus('disconnected')
            onDisconnected(
              'Stream closed. Check your network or whether the server is still reachable.',
            )
          }
        }

        onWinResize = () => sendResize()
        window.addEventListener('resize', onWinResize)
        resizeObserver = new ResizeObserver(() => sendResize())
        resizeObserver.observe(host!)
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'failed to start'
          setStatus(msg)
          onDisconnected(msg)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      termRef.current = null
      setSessionId(null)
      if (onWinResize) window.removeEventListener('resize', onWinResize)
      resizeObserver?.disconnect()
      es?.close()
      term?.dispose()
      // Stream defer also closes the PTY; explicit close is a safety net if
      // open succeeded but stream never started.
      if (termId != null) {
        void apiTerminalClose(termId)
      }
    }
    // theme applied via separate effect; only reconnect on disconnect handler change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDisconnected])

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = theme.xterm
    }
  }, [theme])

  async function handleLogout() {
    setBusyLogout(true)
    try {
      await apiLogout()
    } finally {
      onLogout()
    }
  }

  const serverHost = displayServerHost(getApiBase())

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase">
            web-tty
          </span>
          {serverHost ? (
            <span
              className="min-w-0 truncate font-mono text-xs text-[var(--text)]"
              title={getApiBase()}
            >
              {serverHost}
            </span>
          ) : null}
          {sessionId != null ? (
            <span className="shrink-0 font-mono text-xs text-[var(--muted)]">
              #{sessionId}
            </span>
          ) : null}
          <span className="shrink-0 text-xs text-[var(--muted)]">{status}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.open(window.location.href, '_blank', 'noopener,noreferrer')
            }}
            className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]"
            title="Open a new terminal in a new browser tab"
          >
            + New tab
          </button>
          <SettingsButton />
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={busyLogout}
            className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Logout
          </button>
        </div>
      </header>
      <div ref={hostRef} className="min-h-0 flex-1 p-2" />
    </div>
  )
}
