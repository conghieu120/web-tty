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
      const rows = term.rows
      const cols = term.cols
      void apiTerminalResize(rows, cols)
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
          theme: {
            background: '#0c0f0c',
            foreground: '#d6e0d6',
            cursor: '#8fbf4a',
            black: '#0c0f0c',
            red: '#d07060',
            green: '#8fbf4a',
            yellow: '#c4a35a',
            blue: '#6a9fb5',
            magenta: '#a87ca0',
            cyan: '#75b5aa',
            white: '#d6e0d6',
            brightBlack: '#5a6a5a',
            brightRed: '#e09080',
            brightGreen: '#a8d060',
            brightYellow: '#e0c070',
            brightBlue: '#8abfd0',
            brightMagenta: '#c09cb8',
            brightCyan: '#95d0c4',
            brightWhite: '#f0f4f0',
          },
        })
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
      if (onWinResize) window.removeEventListener('resize', onWinResize)
      resizeObserver?.disconnect()
      es?.close()
      term?.dispose()
    }
  }, [onDisconnected])

  async function handleLogout() {
    setBusyLogout(true)
    try {
      await apiLogout()
    } finally {
      onLogout()
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase">
            web-tty
          </span>
          <span className="text-xs text-[var(--muted)]">{status}</span>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={busyLogout}
          className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-50"
        >
          Logout
        </button>
      </header>
      <div ref={hostRef} className="min-h-0 flex-1 p-2" />
    </div>
  )
}
