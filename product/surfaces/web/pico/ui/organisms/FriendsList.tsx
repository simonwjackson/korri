/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Friends grouped by presence (playing / online / offline), each a list with an
 * avatar initial + presence dot.
 */
import type { PicoFriend } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
    <div
      className="pcFut-friends"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.friendsList)}
    >
      {[
        { label: "PLAYING NOW", list: playing },
        { label: "ONLINE", list: online },
        { label: "OFFLINE", list: offline },
      ].map(group =>
        group.list.length === 0 ? null : (
          <div
            key={group.label}
            className="pcFut-group"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutGroup)}
          >
            <div
              className="pcFut-group-h"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutGroupH)}
            >
              {group.label}
              <span
                className="pc-dim"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
              >
                {" "}
                · {group.list.length}
              </span>
            </div>
            <List>
              {group.list.map((friend, index) => (
                <Row
                  key={friend.id}
                  state={
                    group.label === "PLAYING NOW" && index === 0
                      ? "selected"
                      : "default"
                  }
                  icon={
                    <span
                      className={`pcFut-ava ${statusClass(friend.status)}`}
                      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAva)}
                    >
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
                      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutDot)}
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
