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

import { composeEntryKey } from "@platform/library/entry-key"
import { asPlayableLibraryEntry } from "@platform/library/playable-library"
import {
  clampUiScale,
  DEFAULT_UI_SCALE,
  serializeUiScale,
} from "@platform/react/primitives/theme/ui-scale"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  type ShiftHomeContextValue,
  ShiftHomeCtx,
  type ShiftHomeInputItem,
} from "./ShiftHome.context"

// Shift home items accept optional `source` so federation library
// entries can render alongside source-less fixtures. The rail keys
// every cell with `composeEntryKey` so same-id entries from different
// peers render as distinct focusables.
type ShiftHomeRootItem = ShiftHomeInputItem
export interface ShiftHomeRootProps {
  readonly items: ReadonlyArray<ShiftHomeRootItem>
  /**
   * Resume target. Defaults to `items[0]`. Pass explicitly when the
   * resume signal comes from elsewhere (e.g., a future RPC root that
   * resolves "most recently played" against persisted user data).
   */
  readonly resumeTarget?: ShiftHomeRootItem
  readonly children: ReactNode
}

export function ShiftHomeRoot({
  items,
  resumeTarget: resumeTargetProp,
  children,
}: ShiftHomeRootProps) {
  const normalizedItems = useMemo(
    () =>
      items.map(item => ({
        ...asPlayableLibraryEntry(item),
        source: item.source,
      })),
    [items],
  )
  const resumeTargetInput = resumeTargetProp ?? items[0]
  const resumeTarget = resumeTargetInput
    ? {
        ...asPlayableLibraryEntry(resumeTargetInput),
        source: resumeTargetInput.source,
      }
    : undefined
  if (!resumeTarget) {
    throw new Error(
      "ShiftHomeRoot requires at least one item or an explicit resumeTarget",
    )
  }

  // Composite focus key: `${hostId}::${id}` when source is present,
  // bare id otherwise. Always matches what the rail puts on
  // `data-tile-id`.
  const [focusedId, setFocusedId] = useState<string>(
    composeEntryKey(resumeTarget),
  )
  const [captionAnchorX, setCaptionAnchorX] = useState(0)
  const [isLabsOpen, setIsLabsOpen] = useState(false)
  const [isSystemPanelOpen, setIsSystemPanelOpen] = useState(false)
  const [uiScale, setUiScale] = useState(DEFAULT_UI_SCALE)
  const railRef = useRef<HTMLDivElement | null>(null)
  const hostRef = useRef<HTMLElement | null>(null)

  // Place initial focus on the resume target so spatial navigation has
  // a visible anchor on mount. Runs once per resume-target identity
  // change (effectively once on mount for the typical home flow).
  const resumeKey = composeEntryKey(resumeTarget)
  useEffect(() => {
    const node = railRef.current
    if (!node) return
    const target = node.querySelector<HTMLElement>(
      `[data-tile-id="${CSS.escape(resumeKey)}"]`,
    )
    target?.focus()
  }, [resumeKey])

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

  // `focusedId` carries the composite `${hostId}::${id}` key emitted by
  // the rail's `data-tile-id`. Match by composite key so duplicate-id
  // entries from different peers don't collide.
  const focused = useMemo(
    () =>
      normalizedItems.find(g => composeEntryKey(g) === focusedId) ??
      resumeTarget,
    [normalizedItems, focusedId, resumeTarget],
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

  const openSystemPanel = useCallback(() => {
    setIsSystemPanelOpen(true)
  }, [])

  const closeSystemPanel = useCallback(() => {
    setIsSystemPanelOpen(false)
  }, [])

  const changeUiScale = useCallback((scale: number) => {
    setUiScale(clampUiScale(scale))
  }, [])

  const resetUiScale = useCallback(() => {
    setUiScale(DEFAULT_UI_SCALE)
  }, [])

  // One slider drives the whole intrinsic scale: write BOTH the text and the
  // pad multiplier on the Shift surface element (not a documentElement
  // root-font zoom). text-scale multiplies the derived type family; pad-scale
  // multiplies the em space family. Scoping to the surface keeps the knob a
  // per-surface concern and lets art/media plateau against --intrinsic-base.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scale = serializeUiScale(uiScale)
    host.style.setProperty("--intrinsic-text-scale", scale)
    host.style.setProperty("--intrinsic-pad-scale", scale)

    return () => {
      host.style.removeProperty("--intrinsic-text-scale")
      host.style.removeProperty("--intrinsic-pad-scale")
    }
  }, [uiScale])

  const value: ShiftHomeContextValue = useMemo(
    () => ({
      items: normalizedItems,
      resumeTarget,
      focused,
      isResumeFocused: composeEntryKey(focused) === resumeKey,
      captionAnchorX,
      railRef,
      isLabsOpen,
      isSystemPanelOpen,
      uiScale,
      focusTile,
      openLabs,
      closeLabs,
      openSystemPanel,
      closeSystemPanel,
      changeUiScale,
      resetUiScale,
    }),
    [
      normalizedItems,
      resumeTarget,
      focused,
      captionAnchorX,
      isLabsOpen,
      isSystemPanelOpen,
      uiScale,
      focusTile,
      openLabs,
      closeLabs,
      openSystemPanel,
      closeSystemPanel,
      changeUiScale,
      resetUiScale,
      resumeKey,
    ],
  )

  return (
    <ShiftHomeCtx.Provider value={value}>
      <main
        ref={hostRef}
        data-shift-home
        className="intrinsic relative flex h-full w-full flex-col overflow-hidden text-[color:var(--shift-ink)]"
      >
        {children}
      </main>
    </ShiftHomeCtx.Provider>
  )
}
