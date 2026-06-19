/**
 * theme-workshop — app shell.
 *
 * Picks a theme from the registry and mounts the workshop for it. The theme
 * switcher (top-left) appears once more than one theme is registered; with a
 * single theme it stays out of the way. Remounting on theme change (`key`)
 * resets the device lab + screen selection cleanly. Dev-only chrome.
 */
import { type CSSProperties, useState } from "react"
import { ThemeWorkshop } from "./ThemeWorkshop"
import { DEFAULT_THEME_ID, THEMES } from "./themes"

const switcherStyle: CSSProperties = {
  position: "fixed",
  top: 12,
  left: 12,
  zIndex: 2000,
  display: "flex",
  gap: 6,
  padding: "6px 8px",
  borderRadius: 8,
  background: "rgba(0,0,0,0.8)",
  border: "1px solid #444",
  font: "12px/1 ui-monospace, monospace",
}

function tabStyle(active: boolean): CSSProperties {
  return {
    cursor: "pointer",
    border: "none",
    borderRadius: 5,
    padding: "4px 9px",
    background: active ? "#ddd" : "#333",
    color: active ? "#000" : "#ccc",
    font: "inherit",
  }
}

export function ThemeWorkshopApp() {
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID)
  const theme = THEMES.find(t => t.id === themeId) ?? THEMES[0]
  if (!theme) return null

  const showSwitcher = THEMES.length > 1 && !import.meta.env.PROD

  return (
    <>
      {showSwitcher ? (
        <div style={switcherStyle}>
          {THEMES.map(t => (
            <button
              key={t.id}
              type="button"
              style={tabStyle(t.id === theme.id)}
              onClick={() => setThemeId(t.id)}
            >
              {t.id}
            </button>
          ))}
        </div>
      ) : null}
      <ThemeWorkshop key={theme.id} config={theme} />
    </>
  )
}
