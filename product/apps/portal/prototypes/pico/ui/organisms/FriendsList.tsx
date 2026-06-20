/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Friends grouped by presence (playing / online / offline), each a list with an
 * avatar initial + presence dot.
 */
import type { PicoFriend } from "../../fixtures-extra"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

function statusClass(status: string): string {
  if (status === "playing" || status === "online") return "on"
  if (status === "away") return "away"
  return "off"
}

export function FriendsList({
  friends,
}: {
  readonly friends: readonly PicoFriend[]
}) {
  const playing = friends.filter(friend => friend.status === "playing")
  const online = friends.filter(
    friend => friend.status === "online" || friend.status === "away",
  )
  const offline = friends.filter(friend => friend.status === "offline")
  return (
    <div className="pcFut-friends">
      {[
        { label: "PLAYING NOW", list: playing },
        { label: "ONLINE", list: online },
        { label: "OFFLINE", list: offline },
      ].map(group =>
        group.list.length === 0 ? null : (
          <div key={group.label} className="pcFut-group">
            <div className="pcFut-group-h">
              {group.label}
              <span className="pc-dim"> · {group.list.length}</span>
            </div>
            <List>
              {group.list.map((friend, index) => (
                <Row
                  key={friend.id}
                  sel={group.label === "PLAYING NOW" && index === 0}
                  icon={
                    <span className={`pcFut-ava ${statusClass(friend.status)}`}>
                      {friend.name.slice(0, 2)}
                    </span>
                  }
                  label={friend.name}
                  meta={
                    friend.playing
                      ? `deep in ${friend.playing}`
                      : friend.status === "offline"
                        ? "off doing other things"
                        : friend.status.toUpperCase()
                  }
                  trailing={
                    <span
                      className={`pcFut-dot ${statusClass(friend.status)}`}
                    />
                  }
                />
              ))}
            </List>
          </div>
        ),
      )}
    </div>
  )
}
