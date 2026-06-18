/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Replaces the flat A–E switcher with a grouped STATE MAP for the max-out
 * gallery. Dev-only chrome (NOT part of the design under evaluation, so it uses
 * plain fixed px, not the theme's intrinsic token scale) — hidden in PROD.
 *
 *   ◀  GROUP ▸ Screen name  (i / N)  ▶   [ MAP ]
 *
 * ←/→ step the flat list; M (or the MAP button) opens the grouped jump panel;
 * Esc closes it; click any screen to jump.
 */
import { useEffect, useState } from "react"
import type { PicoScreen } from "./screen-catalog"

export function PicoGallery({
  screens,
  groups,
  current,
  onSelect,
}: {
  readonly screens: readonly PicoScreen[]
  readonly groups: readonly string[]
  readonly current: string
  readonly onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const index = Math.max(
    0,
    screens.findIndex(screen => screen.id === current),
  )
  const active = screens[index] ?? screens[0]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (event.key === "ArrowLeft") {
        onSelect(
          screens[(index - 1 + screens.length) % screens.length]?.id ?? current,
        )
      } else if (event.key === "ArrowRight") {
        onSelect(screens[(index + 1) % screens.length]?.id ?? current)
      } else if (event.key === "m" || event.key === "M") {
        setOpen(value => !value)
      } else if (event.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, screens, current, onSelect])

  if (import.meta.env.PROD) return null
  if (!active) return null

  return (
    <div data-pico>
      {open ? (
        <div className="pico-gallerymap">
          <div className="pico-gallerymap-head">
            <span>STATE MAP — {screens.length} SCREENS</span>
            <button type="button" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
          <div className="pico-gallerymap-body">
            {groups.map(group => {
              const inGroup = screens.filter(screen => screen.group === group)
              if (inGroup.length === 0) return null
              return (
                <div className="pico-gallerymap-group" key={group}>
                  <div className="pico-gallerymap-gtitle">{group}</div>
                  {inGroup.map(screen => (
                    <button
                      type="button"
                      key={screen.id}
                      className={`pico-gallerymap-item ${
                        screen.id === current ? "on" : ""
                      }`}
                      onClick={() => {
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

      <div className="pico-gallerybar">
        <button
          type="button"
          aria-label="previous screen"
          onClick={() =>
            onSelect(
              screens[(index - 1 + screens.length) % screens.length]?.id ??
                current,
            )
          }
        >
          ◀
        </button>
        <button
          type="button"
          className="pico-gallerybar-label"
          onClick={() => setOpen(value => !value)}
        >
          <b>{active.group}</b> ▸ {active.name}
          <span className="pico-gallerybar-count">
            {index + 1} / {screens.length}
          </span>
        </button>
        <button
          type="button"
          aria-label="next screen"
          onClick={() =>
            onSelect(screens[(index + 1) % screens.length]?.id ?? current)
          }
        >
          ▶
        </button>
        <button
          type="button"
          className="pico-gallerybar-map"
          onClick={() => setOpen(value => !value)}
        >
          MAP
        </button>
      </div>
    </div>
  )
}
