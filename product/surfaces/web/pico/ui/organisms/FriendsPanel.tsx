/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Friends / party rail drawer: presence rows with join/invite CTAs. Moved from
 * screens/PanelsScreens.tsx.
 */
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"

const FRIENDS: readonly {
  readonly id: string
  readonly name: string
  readonly status: "playing" | "online" | "away" | "offline"
  readonly playing: string | null
}[] = [
  { id: "f1", name: "PIXELPETE", status: "playing", playing: "Celeste" },
  { id: "f2", name: "RETRORHEA", status: "playing", playing: "Hollow Knight" },
  { id: "f3", name: "8BITBEN", status: "online", playing: null },
  { id: "f4", name: "MEGAMARA", status: "away", playing: null },
  { id: "f5", name: "VECTORVIV", status: "offline", playing: null },
]

export function FriendsPanel() {
  return (
    <div
      className="pcFr"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.friendsPanel)}
    >
      {FRIENDS.map(friend => (
        <div
          key={friend.id}
          className={`pcFr-row ${friend.status}`}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFrRow)}
        >
          <span
            className={`pcMp-pres ${friend.status}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpPres)}
          />
          <div
            className="pcFr-text"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFrText)}
          >
            <b>{friend.name}</b>
            <span>
              {friend.playing ? `playing ${friend.playing}` : friend.status}
            </span>
          </div>
          {friend.status !== "offline" ? (
            <span
              className="pcFr-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFrCta)}
            >
              {friend.playing ? "JOIN" : "INVITE"}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
