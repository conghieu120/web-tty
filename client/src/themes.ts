import type { ITheme } from '@xterm/xterm'

export type ThemeId =
  | 'moss'
  | 'midnight'
  | 'paper'
  | 'solarized'
  | 'nord'
  | 'monokai'

export type AppTheme = {
  id: ThemeId
  label: string
  description: string
  /** Swatch colors for the picker preview */
  swatch: [string, string, string]
  css: {
    bg: string
    panel: string
    border: string
    text: string
    muted: string
    accent: string
    accentDim: string
    accentFg: string
    danger: string
    scheme: 'dark' | 'light'
  }
  xterm: ITheme
}

export const THEMES: Record<ThemeId, AppTheme> = {
  moss: {
    id: 'moss',
    label: 'Moss',
    description: 'Dark green terminal',
    swatch: ['#0c0f0c', '#8fbf4a', '#d6e0d6'],
    css: {
      bg: '#0c0f0c',
      panel: '#141914',
      border: '#2a332a',
      text: '#d6e0d6',
      muted: '#7f8f7f',
      accent: '#8fbf4a',
      accentDim: '#6a8f35',
      accentFg: '#0c0f0c',
      danger: '#d07060',
      scheme: 'dark',
    },
    xterm: {
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
  },
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Cool dark blue',
    swatch: ['#0b1220', '#5b9fd4', '#d7e2f0'],
    css: {
      bg: '#0b1220',
      panel: '#121a2b',
      border: '#243049',
      text: '#d7e2f0',
      muted: '#7f8fa8',
      accent: '#5b9fd4',
      accentDim: '#3f7fad',
      accentFg: '#0b1220',
      danger: '#e06c75',
      scheme: 'dark',
    },
    xterm: {
      background: '#0b1220',
      foreground: '#d7e2f0',
      cursor: '#5b9fd4',
      black: '#0b1220',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#e5c07b',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#d7e2f0',
      brightBlack: '#5c677a',
      brightRed: '#f08a92',
      brightGreen: '#b5d99a',
      brightYellow: '#f0d29a',
      brightBlue: '#8fc7f5',
      brightMagenta: '#d9a0ea',
      brightCyan: '#7ecdd6',
      brightWhite: '#ffffff',
    },
  },
  paper: {
    id: 'paper',
    label: 'Paper',
    description: 'Light clean',
    swatch: ['#f4f1ea', '#2f5d50', '#1c1c1c'],
    css: {
      bg: '#f4f1ea',
      panel: '#fffdf8',
      border: '#d9d2c4',
      text: '#1c1c1c',
      muted: '#6b6560',
      accent: '#2f5d50',
      accentDim: '#244a40',
      accentFg: '#f4f1ea',
      danger: '#b42318',
      scheme: 'light',
    },
    xterm: {
      background: '#f4f1ea',
      foreground: '#1c1c1c',
      cursor: '#2f5d50',
      black: '#1c1c1c',
      red: '#b42318',
      green: '#2f5d50',
      yellow: '#8a6a1d',
      blue: '#2b5ea7',
      magenta: '#7a3e9d',
      cyan: '#1f6f6a',
      white: '#f4f1ea',
      brightBlack: '#6b6560',
      brightRed: '#d92d20',
      brightGreen: '#3d7a68',
      brightYellow: '#a67c1f',
      brightBlue: '#3b74c4',
      brightMagenta: '#964db8',
      brightCyan: '#2a8a83',
      brightWhite: '#ffffff',
    },
  },
  solarized: {
    id: 'solarized',
    label: 'Solarized',
    description: 'Classic dark solarized',
    swatch: ['#002b36', '#268bd2', '#839496'],
    css: {
      bg: '#002b36',
      panel: '#073642',
      border: '#586e75',
      text: '#839496',
      muted: '#657b83',
      accent: '#268bd2',
      accentDim: '#1a6fa8',
      accentFg: '#fdf6e3',
      danger: '#dc322f',
      scheme: 'dark',
    },
    xterm: {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#268bd2',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#002b36',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3',
    },
  },
  nord: {
    id: 'nord',
    label: 'Nord',
    description: 'Arctic bluish dark',
    swatch: ['#2e3440', '#88c0d0', '#eceff4'],
    css: {
      bg: '#2e3440',
      panel: '#3b4252',
      border: '#4c566a',
      text: '#eceff4',
      muted: '#a0a8b8',
      accent: '#88c0d0',
      accentDim: '#6fa3b3',
      accentFg: '#2e3440',
      danger: '#bf616a',
      scheme: 'dark',
    },
    xterm: {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#88c0d0',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4',
    },
  },
  monokai: {
    id: 'monokai',
    label: 'Monokai',
    description: 'Warm editor dark',
    swatch: ['#272822', '#a6e22e', '#f8f8f2'],
    css: {
      bg: '#272822',
      panel: '#2f302a',
      border: '#49483e',
      text: '#f8f8f2',
      muted: '#a8a89e',
      accent: '#a6e22e',
      accentDim: '#86c01a',
      accentFg: '#272822',
      danger: '#f92672',
      scheme: 'dark',
    },
    xterm: {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#a6e22e',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#e6db74',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5',
    },
  },
}

export const THEME_LIST = Object.values(THEMES)
export const DEFAULT_THEME_ID: ThemeId = 'moss'

export function isThemeId(value: string): value is ThemeId {
  return value in THEMES
}
