import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react"

/**
 * Fits an arbitrarily-sized part preview into its stage. Real discovered parts
 * range from tiny atoms to full-screen pages; we measure the rendered content
 * and scale it to fit the stage width (never up past maxScale), anchored to the
 * top, so a full screen reads as a clean "screenshot" thumbnail.
 *
 * Crucially, `transform: scale()` does NOT shrink an element's layout box, so
 * the stage is given an explicit height equal to the SCALED content height.
 * Otherwise the unscaled (e.g. 650px) content would stretch the surrounding
 * artboard/card while the visible content only fills a fraction of it, leaving
 * dead space below.
 */
export function LabScaledPreview({
  children,
  maxScale = 1,
  fill = false,
}: {
  readonly children: ReactNode
  readonly maxScale?: number
  /** When true the stage fills its (fixed-size) container instead of shrinking
   * to the scaled content height — used by uniform gallery cards. Default
   * false: the stage sizes to the scaled content so artboards
   * and canvas objects have no dead space below the preview. */
  readonly fill?: boolean
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(
    undefined,
  )

  useEffect(() => {
    const stage = stageRef.current
    const content = contentRef.current
    if (!stage || !content) return
    const measure = () => {
      const sw = stage.clientWidth
      const cw = content.scrollWidth
      const ch = content.scrollHeight
      if (!sw || !cw) return
      const next = Math.min(sw / cw, maxScale)
      const resolved = Number.isFinite(next) && next > 0 ? next : maxScale
      setScale(resolved)
      setScaledHeight(ch > 0 ? Math.ceil(ch * resolved) : undefined)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(content)
    return () => observer.disconnect()
  }, [maxScale])

  const stageStyle: CSSProperties =
    fill || scaledHeight === undefined ? {} : { height: scaledHeight }
  return (
    <div ref={stageRef} className="lab-scale-stage" style={stageStyle}>
      <div
        ref={contentRef}
        className="lab-scale-content"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  )
}
