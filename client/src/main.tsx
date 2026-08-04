import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-hidden">
          <App />
        </div>
        <footer className="shrink-0 border-t border-[var(--border)] px-4 py-1 text-center text-[10px] text-[var(--muted)]">
          Created by hieumc
        </footer>
      </div>
    </ThemeProvider>
  </StrictMode>,
)
