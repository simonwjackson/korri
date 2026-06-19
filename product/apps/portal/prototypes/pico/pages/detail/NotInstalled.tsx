/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 *
 * Not-installed game: dimmed art, a NOT INSTALLED badge, and download actions.
 * Reads `picoDetailGameAtom` and composes ScreenShell + DetailHead + actions.
 */
import { picoDetailGameAtom } from "../../data/pico-detail-atoms"
import { Badge, Btn, Chip } from "../../screens/kit"
import { PicoData } from "../../screens/PicoData"
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
              dim
              tags={`${game.genre.toUpperCase()} · ${game.developer.toUpperCase()}`}
            >
              <div className="pcDet-chips">
                <Badge tone="info">NOT INSTALLED</Badge>
                <Chip>104 MB</Chip>
              </div>
              <p className="pcDet-note">
                You don't own this cart yet — grab it and it's good to go.
              </p>
            </DetailHead>
            <div className="pcDet-actions">
              <Btn kind="primary" sel>
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
