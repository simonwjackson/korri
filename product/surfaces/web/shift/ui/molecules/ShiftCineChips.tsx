import { ShiftCineChip } from "../atoms/ShiftCineChip"

/** The single glanceable metadata row under the hero title — composed of
 * `ShiftCineChip` atoms. Full metadata lives on Game Detail; this is the
 * at-a-glance summary, so every field is optional and absent ones are skipped. */
export interface ShiftCineChipsProps {
  readonly genre?: string
  readonly developer?: string
  readonly lastPlayedLabel?: string
  readonly playtimeLabel?: string
  readonly favorite?: boolean
  /** Marks a fresh/recommended pick — leads the row with a reason chip. */
  readonly fresh?: boolean
}

export function ShiftCineChips({
  genre,
  developer,
  lastPlayedLabel,
  playtimeLabel,
  favorite,
  fresh,
}: ShiftCineChipsProps) {
  return (
    <div className="shift-cine-chips">
      {fresh ? <ShiftCineChip tone="reason">Fresh pick</ShiftCineChip> : null}
      {genre ? <ShiftCineChip>{genre}</ShiftCineChip> : null}
      {developer ? <ShiftCineChip>{developer}</ShiftCineChip> : null}
      {lastPlayedLabel ? (
        <ShiftCineChip>{lastPlayedLabel}</ShiftCineChip>
      ) : null}
      {playtimeLabel ? <ShiftCineChip>{playtimeLabel}</ShiftCineChip> : null}
      {favorite ? (
        <ShiftCineChip tone="favorite">★ Favorite</ShiftCineChip>
      ) : null}
    </div>
  )
}
