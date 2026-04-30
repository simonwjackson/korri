import { useCallback, useEffect, useState } from "react"

/*
 * Theme switcher backed by the .theme-dark / .theme-light classes
 * declared in tokens.css. Reads/writes the class on the <html>
 * element directly so CSS variables update without a re-render of
 * any component tree, and persists the choice to localStorage so the
 * dev tool reopens with the user's preference.
 */

export type Theme = "dark" | "light"

const STORAGE_KEY = "feature-map-explorer:theme"

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark"
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === "light" || raw === "dark") return raw
  return "dark"
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("theme-dark", theme === "dark")
  root.classList.toggle("theme-light", theme === "light")
}

export type UseTheme = {
  theme: Theme
  setTheme: (next: Theme) => void
  toggleTheme: () => void
}

export function useTheme(): UseTheme {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, theme)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => (prev === "dark" ? "light" : "dark"))
  }, [])

  return { theme, setTheme, toggleTheme }
}
