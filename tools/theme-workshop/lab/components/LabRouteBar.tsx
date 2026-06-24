import { useMemo, useState } from "react"
import { useLab } from "../Lab.context"

export function LabRouteBar() {
  const { screens, surfacePath, setSurfacePath } = useLab()
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
