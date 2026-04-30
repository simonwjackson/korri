import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"

export interface ScalePreset {
  name: string
  width: number
  height: number
}

export const SCALE_PRESETS: ReadonlyArray<ScalePreset> = [
  { name: "Small", width: 100, height: 100 },
  { name: "Medium", width: 120, height: 120 },
  { name: "Large", width: 150, height: 150 },
  { name: "Extra Large", width: 180, height: 180 },
]

interface ScaleContextValue {
  scaleIndex: number
  currentScale: ScalePreset
  toggleScale: () => void
  setScaleIndex: (index: number) => void
}

const ScaleContext = createContext<ScaleContextValue | undefined>(undefined)

interface ScaleProviderProps {
  children: ReactNode
  initialIndex?: number
}

function clampIndex(index: number): number {
  if (Number.isNaN(index)) return 0
  const len = SCALE_PRESETS.length
  return ((index % len) + len) % len
}

export function ScaleProvider({
  children,
  initialIndex = 1,
}: ScaleProviderProps) {
  const [scaleIndex, setIndexState] = useState(() => clampIndex(initialIndex))

  const setScaleIndex = useCallback((index: number) => {
    setIndexState(clampIndex(index))
  }, [])

  const toggleScale = useCallback(() => {
    setIndexState(prev => (prev + 1) % SCALE_PRESETS.length)
  }, [])

  // SCALE_PRESETS is non-empty by construction; the fallback satisfies TS
  // without a non-null assertion.
  const fallbackScale: ScalePreset = SCALE_PRESETS[0] ?? {
    name: "Default",
    width: 100,
    height: 100,
  }
  const currentScale = SCALE_PRESETS[scaleIndex] ?? fallbackScale

  return (
    <ScaleContext.Provider
      value={{ scaleIndex, currentScale, toggleScale, setScaleIndex }}
    >
      {children}
    </ScaleContext.Provider>
  )
}

export function useScale(): ScaleContextValue {
  const ctx = useContext(ScaleContext)
  if (!ctx) {
    throw new Error("useScale must be used within a ScaleProvider")
  }
  return ctx
}
