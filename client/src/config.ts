/** Go API base URL (browser calls this directly). */
export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://localhost:8080'

export function apiURL(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}
