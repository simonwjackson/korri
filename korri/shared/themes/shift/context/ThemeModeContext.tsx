import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react"

export type ThemeMode = "light" | "dark"

interface ThemeModeContextValue {
  mode: ThemeMode
  toggleMode: () => void
  setMode: (mode: ThemeMode) => void
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(
  undefined,
)

const STORAGE_KEY = "shift.themeMode"

interface ThemeModeProviderProps {
  children: ReactNode
  initialMode?: ThemeMode
  /**
   * When true (default), the provider toggles the `dark` class on
   * `document.documentElement`. Storybook decorators that own the class
   * themselves should pass `false` to avoid fighting over the class.
   */
  syncDocumentClass?: boolean
}

function readInitialMode(initialMode: ThemeMode | undefined): ThemeMode {
  if (initialMode) return initialMode
  if (typeof window === "undefined") return "dark"
  const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null
  if (saved === "light" || saved === "dark") return saved
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  return prefersDark ? "dark" : "light"
}

export function ThemeModeProvider({
  children,
  initialMode,
  syncDocumentClass = true,
}: ThemeModeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    readInitialMode(initialMode),
  )

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const toggleMode = useCallback(() => {
    setMode(mode === "light" ? "dark" : "light")
  }, [mode, setMode])

  useEffect(() => {
    if (!syncDocumentClass) return
    const root = document.documentElement
    if (mode === "dark") root.classList.add("dark")
    else root.classList.remove("dark")
  }, [mode, syncDocumentClass])

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode, setMode }}>
      {children}
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode(): ThemeModeContextValue {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) {
    throw new Error("useThemeMode must be used within a ThemeModeProvider")
  }
  return ctx
}
