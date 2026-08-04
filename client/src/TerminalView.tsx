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
import { apiURL } from './config'
import { SettingsButton } from './SettingsButton'
import { useTheme } from './ThemeProvider'

type Props = {
  onLogout: () => void
  onDisconnected: () => void
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i)
  }
  return out
}

export function TerminalView({ onLogout, onDisconnected }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { theme } = useTheme()
  const [status, setStatus] = useState('connecting…')
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

    async function ensureOpen() {
      try {
        await apiTerminalOpen()
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('already open')) {
          await apiTerminalClose()
          await apiTerminalOpen()
          return
        }
        throw err
      }
    }

    function sendResize() {
      if (!term || !fitAddon) return
      fitAddon.fit()
      void apiTerminalResize(term.rows, term.cols)
    }

    async function start() {
      try {
        await ensureOpen()
        if (cancelled) return

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

        term.onData((data) => {
          void apiTerminalInput(data)
        })

        es = new EventSource(apiURL('/api/terminal/stream'), { withCredentials: true })
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
            onDisconnected()
          }
        }

        onWinResize = () => sendResize()
        window.addEventListener('resize', onWinResize)
        resizeObserver = new ResizeObserver(() => sendResize())
        resizeObserver.observe(host!)
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : 'failed to start')
          onDisconnected()
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      termRef.current = null
      if (onWinResize) window.removeEventListener('resize', onWinResize)
      resizeObserver?.disconnect()
      es?.close()
      term?.dispose()
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

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase">
            web-tty
          </span>
          <span className="text-xs text-[var(--muted)]">{status}</span>
        </div>
        <div className="flex items-center gap-2">
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
