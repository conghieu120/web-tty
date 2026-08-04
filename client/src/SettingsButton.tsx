import { useEffect, useId, useRef, useState } from 'react'
import { useTheme } from './ThemeProvider'
import { THEME_LIST } from './themes'

function GearIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H10a1.7 1.7 0 0 0 1-1.5V5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V10c0 .7.4 1.3 1 1.5H19a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

type Props = {
  className?: string
}

export function SettingsButton({ className = '' }: Props) {
  const { themeId, setThemeId } = useTheme()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center border border-[var(--border)] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
      >
        <GearIcon />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 z-50 mt-2 w-72 border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg"
        >
          <p className="mb-3 font-mono text-[10px] tracking-[0.18em] text-[var(--muted)] uppercase">
            Theme
          </p>
          <ul className="flex flex-col gap-1.5" role="listbox" aria-label="Theme presets">
            {THEME_LIST.map((t) => {
              const selected = t.id === themeId
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setThemeId(t.id)
                      setOpen(false)
                    }}
                    className={`flex w-full items-center gap-3 px-2.5 py-2 text-left transition-colors ${
                      selected
                        ? 'bg-[var(--bg)] outline outline-1 outline-[var(--accent)]'
                        : 'hover:bg-[var(--bg)]'
                    }`}
                  >
                    <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                      {t.swatch.map((c) => (
                        <span
                          key={c}
                          className="h-4 w-4 border border-[var(--border)]"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--text)]">{t.label}</span>
                      <span className="block text-xs text-[var(--muted)]">{t.description}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
