import { describe, expect, it } from "bun:test"
import { act, render, renderHook } from "@testing-library/react"
import { ThemeModeProvider, useThemeMode } from "./ThemeModeContext"

const wrapper =
  (initialMode?: "light" | "dark") =>
  ({ children }: { children: React.ReactNode }) => (
    <ThemeModeProvider initialMode={initialMode} syncDocumentClass={false}>
      {children}
    </ThemeModeProvider>
  )

describe("ThemeModeContext", () => {
  it("throws when useThemeMode is used outside a provider", () => {
    expect(() => renderHook(() => useThemeMode())).toThrow(
      /must be used within a ThemeModeProvider/,
    )
  })

  it("uses the initialMode prop when provided", () => {
    const { result } = renderHook(() => useThemeMode(), {
      wrapper: wrapper("light"),
    })
    expect(result.current.mode).toBe("light")
  })

  it("toggleMode flips between light and dark", () => {
    const { result } = renderHook(() => useThemeMode(), {
      wrapper: wrapper("light"),
    })
    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe("dark")
    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe("light")
  })

  it("setMode persists to localStorage", () => {
    window.localStorage.clear()
    const { result } = renderHook(() => useThemeMode(), {
      wrapper: wrapper("dark"),
    })
    act(() => result.current.setMode("light"))
    expect(window.localStorage.getItem("shift.themeMode")).toBe("light")
  })

  it("toggles `dark` class on documentElement when syncDocumentClass is true", () => {
    document.documentElement.classList.remove("dark")
    function Probe() {
      const { toggleMode } = useThemeMode()
      return (
        <button type="button" onClick={toggleMode} data-testid="t">
          toggle
        </button>
      )
    }
    const { getByTestId } = render(
      <ThemeModeProvider initialMode="light" syncDocumentClass={true}>
        <Probe />
      </ThemeModeProvider>,
    )
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    act(() => getByTestId("t").click())
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})
