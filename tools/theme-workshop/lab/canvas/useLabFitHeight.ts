import { useEffect, useState } from "react"

/** Reserved viewport chrome above/below a device stage (canvas bar, padding). */
const VIEWPORT_INSET = 112

/**
 * The max displayed device-frame height for a canvas stage: the viewport height
 * minus fixed chrome, tracked across resizes. Device frames taller than this are
 * scaled down to fit (see DeviceFrame). Shared by every view that mounts a real
 * device frame so the fit policy lives in one place.
 */
export function useLabFitHeight(): number | undefined {
  const [maxHeightPx, setMaxHeightPx] = useState(() =>
    typeof window === "undefined"
      ? undefined
      : window.innerHeight - VIEWPORT_INSET,
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setMaxHeightPx(window.innerHeight - VIEWPORT_INSET)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  return maxHeightPx
}
