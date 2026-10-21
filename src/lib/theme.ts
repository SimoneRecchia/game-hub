import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'gh.theme'

/** Il colore in cima alla pagina che si apre per prima, le Giornaliere: Safari ci tinge la zona dell'orologio. */
export const FONDO_CHIARO = '#ffe9d6'
export const FONDO_SCURO = '#2c2a56'

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch {
    /* storage negato (Safari privato): resta su auto */
  }
  return 'auto'
}

function apply(preference: ThemePreference) {
  const root = document.documentElement
  if (preference === 'auto') root.removeAttribute('data-theme')
  else root.dataset.theme = preference

  // Allinea la barra di stato di iOS al tema effettivo.
  const dark =
    preference === 'dark' ||
    (preference === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.remove()
  }
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = dark ? FONDO_SCURO : FONDO_CHIARO
  document.head.appendChild(meta)
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(read)

  useEffect(() => {
    apply(preference)
  }, [preference])

  const setTheme = useCallback((next: ThemePreference) => {
    try {
      if (next === 'auto') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* non bloccare il cambio tema se lo storage è negato */
    }
    setPreference(next)
  }, [])

  return { preference, setTheme }
}
