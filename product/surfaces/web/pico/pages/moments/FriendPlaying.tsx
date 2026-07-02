/**
 * pico surface. ATOMIC LAYER: page.
 * SHOWCASE moment — jump into a friend's game. Reads picoGamesAtom.
 */
import { picoGamesAtom } from "../../data/pico-library-atoms"
import { PicoArtImage } from "../../PicoArtImage"
import { PicoIcon } from "../../PicoIcon"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { PicoData } from "../../screens/PicoData"
import { MomentHero } from "../../ui/organisms/MomentHero"

const FRIEND = { name: "RETRORHEA", playing: "Hollow Knight" } as const

export function FriendPlaying() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ FRIENDS">
      {games => {
        const game =
          games.find(candidate => candidate.title === FRIEND.playing) ??
          games[0]
        if (!game) return null
        const avatar = games[14]?.art
        return (
          <MomentHero
            statusTitle="PICO ▸ FRIENDS"
            hints={[
              { key: "a", label: "JOIN" },
              { key: "y", label: "WATCH" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ A FRIEND IS PLAYING"
          >
            <div
              className="pcM-friend"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMFriend)}
            >
              {avatar ? (
                <PicoArtImage
                  src={avatar}
                  ratio={1}
                  className="pcM-friend-av"
                />
              ) : null}
              <div
                className="pcM-friend-text"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMFriendText)}
              >
                <span
                  className="pcM-pres"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMPres)}
                />
                <b>{FRIEND.name}</b> · PLAYING NOW
              </div>
            </div>
            <span
              className="pcM-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMCta)}
            >
              <PicoIcon name="play" /> JOIN GAME
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}
