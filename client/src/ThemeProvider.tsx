import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_THEME_ID,
  isThemeId,
  THEMES,
  type AppTheme,
  type ThemeId,
} from './themes'

const STORAGE_KEY = 'web-tty-settings'

type Settings = {
  themeId: ThemeId
}

type ThemeContextValue = {
  theme: AppTheme
  themeId: ThemeId
  setThemeId: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { themeId: DEFAULT_THEME_ID }
    const parsed = JSON.parse(raw) as { themeId?: string }
    if (parsed.themeId && isThemeId(parsed.themeId)) {
      return { themeId: parsed.themeId }
    }
  } catch {
    /* ignore */
  }
  return { themeId: DEFAULT_THEME_ID }
}

function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

function applyCssTheme(theme: AppTheme) {
  const root = document.documentElement
  const { css } = theme
  root.style.setProperty('--bg', css.bg)
  root.style.setProperty('--panel', css.panel)
  root.style.setProperty('--border', css.border)
  root.style.setProperty('--text', css.text)
  root.style.setProperty('--muted', css.muted)
  root.style.setProperty('--accent', css.accent)
  root.style.setProperty('--accent-dim', css.accentDim)
  root.style.setProperty('--accent-fg', css.accentFg)
  root.style.setProperty('--danger', css.danger)
  root.style.colorScheme = css.scheme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(() => loadSettings().themeId)
  const theme = THEMES[themeId]

  useEffect(() => {
    applyCssTheme(theme)
  }, [theme])

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id)
    saveSettings({ themeId: id })
  }, [])

  const value = useMemo(
    () => ({ theme, themeId, setThemeId }),
    [theme, themeId, setThemeId],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
