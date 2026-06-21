/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Floating variant switcher. Not part of the design under evaluation;
 * hidden in production builds so a stray merge can't ship it.
 */
import { useEffect } from "react"

export interface PicoVariantDef {
  readonly key: string
  readonly name: string
}

export function PicoPrototypeSwitcher({
  variants,
  current,
  onSelect,
}: {
  readonly variants: readonly PicoVariantDef[]
  readonly current: string
  readonly onSelect: (key: string) => void
}) {
  const index = Math.max(
    0,
    variants.findIndex(v => v.key === current),
  )
  const active = variants[index] ?? variants[0]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA") return
      if (event.key === "ArrowLeft") {
        onSelect(
          variants[(index - 1 + variants.length) % variants.length]?.key ??
            current,
        )
      } else if (event.key === "ArrowRight") {
        onSelect(variants[(index + 1) % variants.length]?.key ?? current)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [index, variants, current, onSelect])

  if (import.meta.env.PROD) return null
  if (!active) return null

  return (
    <div className="pico-switcher" data-pico>
      <button
        type="button"
        aria-label="previous variant"
        onClick={() =>
          onSelect(
            variants[(index - 1 + variants.length) % variants.length]?.key ??
              current,
          )
        }
      >
        ◀
      </button>
      <span className="pico-switcher-label">
        <b>{active.key}</b> — {active.name}
      </span>
      <button
        type="button"
        aria-label="next variant"
        onClick={() =>
          onSelect(variants[(index + 1) % variants.length]?.key ?? current)
        }
      >
        ▶
      </button>
    </div>
  )
}
