/**
 * pico surface. ATOMIC LAYER: page.
 *
 * Not-installed game: dimmed art, a NOT INSTALLED badge, and download actions.
 * Reads `picoDetailGameAtom` and composes ScreenShell + DetailHead + actions.
 */
import { picoDetailGameAtom } from "../../data/pico-detail-atoms"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { Badge } from "../../ui/atoms/Badge"
import { Btn } from "../../ui/atoms/Btn"
import { Chip } from "../../ui/atoms/Chip"
import { Icon } from "../../ui/atoms/Icon"
import { DetailHead } from "../../ui/molecules/DetailHead"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function NotInstalled() {
  return (
    <PicoData atom={picoDetailGameAtom} title="PICO ▸ GAME">
      {game => {
        if (!game) return null
        return (
          <ScreenShell
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "DOWNLOAD" },
              { key: "b", label: "BACK" },
            ]}
          >
            <DetailHead
              game={game}
              artTone="dim"
              tags={`${game.genre.toUpperCase()} · ${game.developer.toUpperCase()}`}
            >
              <div
                className="pcDet-chips"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetChips)}
              >
                <Badge tone="info">NOT INSTALLED</Badge>
                <Chip>104 MB</Chip>
              </div>
              <p
                className="pcDet-note"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetNote)}
              >
                You don't own this cart yet — grab it and it's good to go.
              </p>
            </DetailHead>
            <div
              className="pcDet-actions"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcDetActions)}
            >
              <Btn kind="primary" state="selected">
                <Icon name="download" /> DOWNLOAD
              </Btn>
              <Btn>DETAILS</Btn>
            </div>
          </ScreenShell>
        )
      }}
    </PicoData>
  )
}
