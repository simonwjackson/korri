import { type ReactNode, useEffect, useRef, useState } from "react"

/**
 * Fits an arbitrarily-sized part preview into a fixed stage. Real discovered
 * parts range from tiny atoms to full-bleed pages; we measure the rendered
 * width and scale to fit the stage (never up past maxScale), anchoring to the
 * top. Small parts render at natural size; full screens read as a clean
 * "screenshot" thumbnail instead of blowing out of their card.
 *
 * Width-fit + top-anchor is deliberate: full-bleed parts use absolute/fixed
 * layout that under-reports height, so fitting height would crop unpredictably.
 * Fitting width keeps the whole layout width visible and consistent.
 */
export function LabScaledPreview({
  children,
  maxScale = 1,
}: {
  readonly children: ReactNode
  readonly maxScale?: number
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const stage = stageRef.current
    const content = contentRef.current
    if (!stage || !content) return
    const measure = () => {
      const sw = stage.clientWidth
      const cw = content.scrollWidth
      if (!sw || !cw) return
      const next = Math.min(sw / cw, maxScale)
      setScale(Number.isFinite(next) && next > 0 ? next : maxScale)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(content)
    return () => observer.disconnect()
  }, [maxScale])

  return (
    <div ref={stageRef} className="lab-scale-stage">
      <div ref={contentRef} className="lab-scale-content" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}
