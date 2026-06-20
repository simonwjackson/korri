/**
 * theme-workshop — screen navigator (gallery bar + jump map).
 *
 * The generic bottom bar, in the single-screen view:
 *   ◀  GROUP ▸ Screen  (i / N)  ▶  view-toggle  MAP  {controls}
 *
 * The screen navigator (◀ / label / ▶) and the MAP jump only make sense when a
 * single screen is on the device lab, so they're shown ONLY in the "one" view —
 * the all-screens montage and the component catalog have no "current screen" to
 * step through or jump to. Those views keep just the view-toggle + {controls}.
 *
 * ←/→ step the flat list; M (or MAP) opens the grouped jump panel; Esc closes
 * it; click any screen to jump; the view toggle flips device-lab ↔ all-screens
 * montage ↔ catalog. A theme drops its own live knobs into the `controls` slot
 * (rendered inside the bar) and plays sound via `onCue`; the kit stays silent.
 * Dev-only chrome (plain px), hidden in PROD.
 */
import { type ReactNode, useEffect, useState } from "react"
import { cx, type ResolvedClassNames } from "./classnames"
import type { CueKind, Screen } from "./types"
import { cycleViewMode, useViewMode, type ViewMode } from "./view-store"

const VIEW_LABEL: Record<ViewMode, string> = {
  one: "◱ ONE",
  all: "▦ ALL",
  parts: "⬢ PARTS",
}

export function Gallery({
  screens,
  groups,
  current,
  onSelect,
  cn,
  controls,
  hasStories,
  onCue,
}: {
  readonly screens: readonly Screen[]
  readonly groups: readonly string[]
  readonly current: string
  readonly onSelect: (id: string) => void
  readonly cn: ResolvedClassNames
  readonly controls?: ReactNode
  readonly hasStories?: boolean
  readonly onCue?: (kind: CueKind) => void
}) {
  const [open, setOpen] = useState(false)
  const view = useViewMode()
  const index = Math.max(
    0,
    screens.findIndex(screen => screen.id === current),
  )
  const active = screens[index] ?? screens[0]
  const cue = (kind: CueKind) => onCue?.(kind)
  const viewOrder: readonly ViewMode[] = hasStories
    ? ["one", "all", "parts"]
    : ["one", "all"]
  const nextView =
    viewOrder[(viewOrder.indexOf(view) + 1) % viewOrder.length] ?? "one"
  // The screen navigator + MAP only apply to a single screen on the device lab.
  const onScreen = view === "one"

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (onScreen && event.key === "ArrowLeft") {
        cue("move")
        onSelect(
          screens[(index - 1 + screens.length) % screens.length]?.id ?? current,
        )
      } else if (onScreen && event.key === "ArrowRight") {
        cue("move")
        onSelect(screens[(index + 1) % screens.length]?.id ?? current)
      } else if (onScreen && (event.key === "m" || event.key === "M")) {
        cue("open")
        setOpen(value => !value)
      } else if (event.key === "Escape") {
        cue("back")
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  if (import.meta.env.PROD) return null
  if (!active) return null

  return (
    <>
      {open && onScreen ? (
        <div className={cn.mapPanel}>
          <div className={cn.mapHead}>
            <span>STATE MAP — {screens.length} SCREENS</span>
            <button
              type="button"
              onClick={() => {
                cue("back")
                setOpen(false)
              }}
            >
              ✕
            </button>
          </div>
          <div className={cn.mapBody}>
            {groups.map(group => {
              const inGroup = screens.filter(screen => screen.group === group)
              if (inGroup.length === 0) return null
              return (
                <div className={cn.mapGroup} key={group}>
                  <div className={cn.mapGroupTitle}>{group}</div>
                  {inGroup.map(screen => (
                    <button
                      type="button"
                      key={screen.id}
                      className={cx(cn.mapItem, screen.id === current && "on")}
                      onClick={() => {
                        cue("confirm")
                        onSelect(screen.id)
                        setOpen(false)
                      }}
                    >
                      {screen.name}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className={cn.bar}>
        {onScreen ? (
          <div className={cn.nav}>
            <button
              type="button"
              aria-label="previous screen"
              onClick={() => {
                cue("move")
                onSelect(
                  screens[(index - 1 + screens.length) % screens.length]?.id ??
                    current,
                )
              }}
            >
              ◀
            </button>
            <button
              type="button"
              className={cn.label}
              onClick={() => {
                cue("open")
                setOpen(value => !value)
              }}
            >
              <b>{active.group}</b> ▸ {active.name}
              <span className={cn.count}>
                {index + 1} / {screens.length}
              </span>
            </button>
            <button
              type="button"
              aria-label="next screen"
              onClick={() => {
                cue("move")
                onSelect(screens[(index + 1) % screens.length]?.id ?? current)
              }}
            >
              ▶
            </button>
            <button
              type="button"
              className={cn.mapToggle}
              onClick={() => {
                cue("open")
                setOpen(value => !value)
              }}
            >
              MAP
            </button>
          </div>
        ) : null}
        {/* Always-present cluster: view toggle + the theme's live controls, in
            their own container so they stay grouped and consistent across views. */}
        <div className={cn.tools}>
          <button
            type="button"
            className={cx(cn.view, view)}
            aria-label="cycle view"
            title="device lab · all-screens montage · component catalog"
            onClick={() => {
              cycleViewMode(viewOrder)
              cue("toggle")
            }}
          >
            {VIEW_LABEL[nextView]}
          </button>
          {controls}
        </div>
      </div>
    </>
  )
}
