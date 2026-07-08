/**
 * Shift store detail — acquisition-oriented detail page.
 *
 * Reuses the committed game-detail split atoms so Store detail feels native to
 * Shift, but swaps the library play-history verbs for acquisition verbs. Browse
 * results stay chrome-free; this is where Get/Play belongs.
 */
import { useInputAction } from "@platform/react/input/use-input-action"
import { SHIFT_DESIGN_PARTS, shiftDesignPartAttrs } from "../shift-design-parts"
import { ShiftDetailArt } from "./ShiftDetailArt"
import { ShiftDetailButton } from "./ShiftDetailButton"
import { ShiftDetailHint } from "./ShiftDetailHint"
import { ShiftDetailStats } from "./ShiftDetailStats"
import { ShiftDetailSynopsis } from "./ShiftDetailSynopsis"
import { ShiftDetailTags } from "./ShiftDetailTags"
import { ShiftDetailTitle } from "./ShiftDetailTitle"
import {
  type ShiftStoreEntry,
  shiftStoreSourcesLabel,
} from "./shift-store-entry"

export interface ShiftStoreDetailProps {
  readonly entry: ShiftStoreEntry
  readonly onBack?: () => void
  readonly onPrimary?: (id: string) => void
}

export function ShiftStoreDetail({
  entry,
  onBack,
  onPrimary,
}: ShiftStoreDetailProps) {
  useInputAction("back", () => onBack?.())

  const tags = [shiftStoreSourcesLabel(entry.sources), entry.platform]
    .filter(Boolean)
    .join(" · ")
  const action = shiftStorePrimaryAction(entry)

  return (
    <div
      data-shift-detail
      className="shift-detail-split intrinsic"
      {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailTemplate)}
    >
      <ShiftDetailArt artUrl={entry.artUrl} />

      <div className="shift-detail-split-info">
        <ShiftDetailTitle title={entry.title} />
        {tags ? <ShiftDetailTags tags={tags} /> : null}
        <ShiftDetailSynopsis>
          {shiftStoreDetailSynopsis(entry)}
        </ShiftDetailSynopsis>
        <ShiftDetailStats lastPlayedLabel="Not acquired" />
        <div
          className="shift-detail-actions"
          {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailActions)}
        >
          <ShiftDetailButton
            primary
            label={action.label}
            onClick={() => onPrimary?.(entry.id)}
          />
        </div>
        <div
          className="shift-detail-buttonbar"
          {...shiftDesignPartAttrs(SHIFT_DESIGN_PARTS.detailHints)}
        >
          <ShiftDetailHint glyph="A" label={action.hint} />
          <ShiftDetailHint glyph="B" label="Back" />
        </div>
      </div>
    </div>
  )
}

export function shiftStorePrimaryAction(entry: ShiftStoreEntry): {
  readonly label: string
  readonly hint: string
} {
  if (entry.status === "ready") return { label: "▶ Play", hint: "Play" }
  if (entry.status === "acquiring") {
    return { label: "Getting…", hint: "Getting…" }
  }
  return { label: "Get", hint: "Get" }
}

function shiftStoreDetailSynopsis(entry: ShiftStoreEntry): string {
  const source = shiftStoreSourcesLabel(entry.sources)
  const platform = entry.platform ? ` for ${entry.platform}` : ""
  if (source) {
    return `${entry.title} is available from ${source}${platform}. Open the item here to acquire it, then return to play from your library once it is ready.`
  }
  return `${entry.title} is available to acquire${platform}. Open the item here, then return to play from your library once it is ready.`
}
