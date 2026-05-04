/**
 * Shift home — template Root.
 *
 * The single state owner for the Shift home surface. Per the React
 * skill, only the Root calls `useState`, creates the context value,
 * and renders the Provider. Every other Shift home component reads
 * via `useShiftHome()`.
 *
 * Responsibilities:
 *   - Decide what counts as the resume target (defaults to `items[0]`).
 *   - Track focused id and caption x-anchor.
 *   - On mount, place initial focus on the resume target so the spatial
 *     navigation graph has a visible anchor.
 *   - On focus / scroll / window resize, recompute the caption x-anchor
 *     so the caption snaps under the focused tile. The snap is
 *     intentionally instant (no transform transition) — see
 *     docs/solutions/best-practices/attached-ui-snaps-not-slides-2026-05-01.md.
 *
 * Layout shape:
 *   - Wraps children in a `<main data-shift-home>` host. The `main`
 *     role makes the home the page's main region (so BDD shared steps
 *     and assistive tech can reach it semantically); the
 *     `data-shift-home` attribute scopes every Shift CSS rule,
 *     declares the container query container, and applies the Shift
 *     surface background and ink color. Without `data-shift-home`,
 *     none of shift.css applies.
 *   - The page composes top bar, middle (rail + caption), and bottom
 *     bar regions as children. The Root does not impose a slot layout
 *     so a future variant of the home (drawer-open, search-open) is a
 *     different composition rather than a different prop.
 */

import type { GameRecord } from "@shared/fixtures/games/game"
import {
  DEFAULT_UI_SCALE,
  UI_SCALE_CSS_VARIABLE,
  clampUiScale,
  serializeUiScale,
} from "@shared/primitives/theme/ui-scale"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { type ShiftHomeContextValue, ShiftHomeCtx } from "./ShiftHome.context"

export interface ShiftHomeRootProps {
  readonly items: ReadonlyArray<GameRecord>
  /**
   * Resume target. Defaults to `items[0]`. Pass explicitly when the
   * resume signal comes from elsewhere (e.g., a future RPC root that
   * resolves "most recently played" against persisted user data).
   */
  readonly resumeTarget?: GameRecord
  readonly children: ReactNode
}

export function ShiftHomeRoot({
  items,
  resumeTarget: resumeTargetProp,
  children,
}: ShiftHomeRootProps) {
  const resumeTarget = resumeTargetProp ?? items[0]
  if (!resumeTarget) {
    throw new Error(
      "ShiftHomeRoot requires at least one item or an explicit resumeTarget",
    )
  }

  const [focusedId, setFocusedId] = useState<string>(resumeTarget.id)
  const [captionAnchorX, setCaptionAnchorX] = useState(0)
  const [isLabsOpen, setIsLabsOpen] = useState(false)
  const [uiScale, setUiScale] = useState(DEFAULT_UI_SCALE)
  const railRef = useRef<HTMLDivElement | null>(null)

  // Place initial focus on the resume target so spatial navigation has
  // a visible anchor on mount. Runs once per resume-target identity
  // change (effectively once on mount for the typical home flow).
  useEffect(() => {
    const node = railRef.current
    if (!node) return
    const target = node.querySelector<HTMLElement>(
      `[data-tile-id="${CSS.escape(resumeTarget.id)}"]`,
    )
    target?.focus()
  }, [resumeTarget.id])

  // Caption x-anchor measurement. Recomputed on focused-id change, on
  // rail scroll (capture-phase: scroll does not bubble), and on window
  // resize. Rounded to whole pixels so the snap-positioned caption
  // does not end up subpixel-aligned, which causes Chromium text blur.
  useEffect(() => {
    const region = railRef.current
    if (!region) return

    const compute = () => {
      const tile = region.querySelector<HTMLElement>(
        `[data-tile-id="${CSS.escape(focusedId)}"]`,
      )
      if (!tile) return
      const tileRect = tile.getBoundingClientRect()
      const regionRect = region.getBoundingClientRect()
      const paddingLeft =
        Number.parseFloat(getComputedStyle(region).paddingLeft) || 0
      setCaptionAnchorX(
        Math.round(tileRect.left - regionRect.left - paddingLeft),
      )
    }

    compute()

    region.addEventListener("scroll", compute, {
      capture: true,
      passive: true,
    })
    window.addEventListener("resize", compute)
    return () => {
      region.removeEventListener("scroll", compute, true)
      window.removeEventListener("resize", compute)
    }
  }, [focusedId])

  const focused = useMemo(
    () => items.find(g => g.id === focusedId) ?? resumeTarget,
    [items, focusedId, resumeTarget],
  )

  const focusTile = useCallback((id: string) => {
    setFocusedId(id)
  }, [])

  const openLabs = useCallback(() => {
    setIsLabsOpen(true)
  }, [])

  const closeLabs = useCallback(() => {
    setIsLabsOpen(false)
  }, [])

  const changeUiScale = useCallback((scale: number) => {
    setUiScale(clampUiScale(scale))
  }, [])

  const resetUiScale = useCallback(() => {
    setUiScale(DEFAULT_UI_SCALE)
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty(
      UI_SCALE_CSS_VARIABLE,
      serializeUiScale(uiScale),
    )

    return () => {
      document.documentElement.style.removeProperty(UI_SCALE_CSS_VARIABLE)
    }
  }, [uiScale])

  const value: ShiftHomeContextValue = useMemo(
    () => ({
      items,
      resumeTarget,
      focused,
      isResumeFocused: focused.id === resumeTarget.id,
      captionAnchorX,
      railRef,
      isLabsOpen,
      uiScale,
      focusTile,
      openLabs,
      closeLabs,
      changeUiScale,
      resetUiScale,
    }),
    [
      items,
      resumeTarget,
      focused,
      captionAnchorX,
      isLabsOpen,
      uiScale,
      focusTile,
      openLabs,
      closeLabs,
      changeUiScale,
      resetUiScale,
    ],
  )

  return (
    <ShiftHomeCtx.Provider value={value}>
      <main
        data-shift-home
        className="relative flex h-screen w-full flex-col overflow-hidden text-[color:var(--shift-ink)]"
      >
        {children}
      </main>
    </ShiftHomeCtx.Provider>
  )
}
