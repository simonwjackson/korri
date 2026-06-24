import { useMemo, useState } from "react"
import { useLab } from "../Lab.context"
import { labSurfaceAdapters } from "../surface-registry"

export function LabRouteBar() {
  const { screens, surfacePath, setSurfacePath, themeId, setThemeId } = useLab()
  const adapters = labSurfaceAdapters()
  const [copied, setCopied] = useState(false)
  const href = useMemo(
    () => (typeof window === "undefined" ? surfacePath : window.location.href),
    [surfacePath],
  )

  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    await navigator.clipboard.writeText(href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const isActive = (path: string) =>
    path === "/" ? surfacePath === "/" : surfacePath.startsWith(path)

  return (
    <div className="lab-controlbar" aria-label="Surface controls">
      {adapters.length > 1 ? (
        <>
          <label className="lab-theme">
            <span className="lab-route-label">Surface</span>
            <select
              className="lab-theme-select"
              aria-label="Surface"
              value={themeId}
              onChange={event => setThemeId(event.target.value)}
            >
              {adapters.map(adapter => (
                <option key={adapter.id} value={adapter.id}>
                  {adapter.id}
                </option>
              ))}
            </select>
          </label>
          <span className="lab-sep" />
        </>
      ) : null}
      {screens.length > 0 ? (
        <div
          className="lab-switch"
          role="tablist"
          aria-label="Surface switcher"
        >
          {screens.map(screen => (
            <button
              key={screen.path}
              type="button"
              role="tab"
              aria-selected={isActive(screen.path)}
              className={cx(
                "lab-switch-tab",
                isActive(screen.path) ? "on" : undefined,
              )}
              onClick={() => setSurfacePath(screen.path)}
            >
              {screen.label}
            </button>
          ))}
          <span className="lab-sep" />
        </div>
      ) : null}
      <span className="lab-route-label">Route</span>
      <code>{surfacePath}</code>
      <button type="button" className="lab-copy" onClick={copy}>
        {copied ? "COPIED" : "COPY LINK"}
      </button>
    </div>
  )
}

const cx = (...classes: readonly (string | undefined)[]) =>
  classes.filter(Boolean).join(" ")
