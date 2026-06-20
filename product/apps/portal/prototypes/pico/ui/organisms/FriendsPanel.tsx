/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Friends / party rail drawer: presence rows with join/invite CTAs. Moved from
 * screens/PanelsScreens.tsx.
 */
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
    <div className="pcFr">
      {FRIENDS.map(friend => (
        <div key={friend.id} className={`pcFr-row ${friend.status}`}>
          <span className={`pcMp-pres ${friend.status}`} />
          <div className="pcFr-text">
            <b>{friend.name}</b>
            <span>
              {friend.playing ? `playing ${friend.playing}` : friend.status}
            </span>
          </div>
          {friend.status !== "offline" ? (
            <span className="pcFr-cta">
              {friend.playing ? "JOIN" : "INVITE"}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
