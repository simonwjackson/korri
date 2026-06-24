import { useMemo, useState } from "react"
import { useLab } from "../Lab.context"

export function LabRouteBar() {
  const { surfacePath } = useLab()
  const [copied, setCopied] = useState(false)
  const href = useMemo(() => {
    if (typeof window === "undefined") return surfacePath
    return window.location.href
  }, [surfacePath])

  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return
    await navigator.clipboard.writeText(href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="lab-route-bar">
      <span className="lab-route-label">Route</span>
      <code>{surfacePath}</code>
      <button type="button" className="lab-focus-tab" onClick={copy}>
        {copied ? "COPIED" : "COPY LINK"}
      </button>
    </div>
  )
}
