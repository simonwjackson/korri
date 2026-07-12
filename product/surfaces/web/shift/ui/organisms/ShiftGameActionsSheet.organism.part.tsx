/**
 * Game Actions Sheet catalog entry — the game command menu.
 *
 * Renders the real sheet open over a framed host so the grouped command surface
 * — wired rows, disabled (unwired/inapplicable) rows, and the destructive tone
 * — can be reviewed in the lab. State is seeded to a played, local game with a
 * provider link and multiple releases so most rows resolve; only wired handlers
 * are passed, so unwired rows show disabled. `open` is fixed because a part
 * previews one state; production drives it from focus/hover.
 */
import { SHIFT_DESIGN_PARTS } from "../../shift-design-parts"
import { ShiftPartFrame } from "../ShiftPartFrame"
import { ShiftGameActionsSheet } from "./ShiftGameActionsSheet"

const noop = () => {}

export default {
  designPartId: SHIFT_DESIGN_PARTS.gameActionsSheet.id,
  name: "Game Actions Sheet",
  note: "Sheet",
  render: () => (
    <ShiftPartFrame>
      <ShiftGameActionsSheet
        open
        gameTitle="Hollow Knight"
        state={{
          favorite: true,
          played: true,
          running: false,
          releaseCount: 2,
          hasProviderLink: true,
          local: true,
        }}
        handlers={{
          onPlay: noop,
          onToggleFavorite: noop,
          onOpenDetails: noop,
        }}
        onClose={noop}
      />
    </ShiftPartFrame>
  ),
}
