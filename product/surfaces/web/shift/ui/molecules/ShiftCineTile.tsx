/** One game tile in the cinematic rail: a native focusable button wrapping the
 * cover art. Focus is driven by the platform focus engine (every input device),
 * so the tile only exposes `onFocus`/`onActivate` and a `focused` flag — no raw
 * key handling. `index` feeds the rail's centering math via `data-cine-index`. */
export interface ShiftCineTileProps {
  readonly index: number
  readonly title: string
  readonly artUrl: string
  readonly focused?: boolean
  readonly onFocus: () => void
  readonly onActivate: () => void
}

export function ShiftCineTile({
  index,
  title,
  artUrl,
  focused,
  onFocus,
  onActivate,
}: ShiftCineTileProps) {
  return (
    <button
      type="button"
      data-cine-index={index}
      data-focused={focused || undefined}
      className="shift-cine-tile"
      aria-label={title}
      onFocus={onFocus}
      onClick={onActivate}
    >
      <img src={artUrl} alt="" loading="lazy" />
    </button>
  )
}
