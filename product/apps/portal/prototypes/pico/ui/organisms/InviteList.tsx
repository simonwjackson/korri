/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: organism.
 *
 * Invite-a-friend list: presence dot, name, what they're playing, and an invite
 * CTA (disabled when offline). First row selected.
 */
import type { PicoFriend } from "../../fixtures-extra"
import { Dim } from "../../screens/kit"

export function InviteList({
  friends,
}: {
  readonly friends: readonly PicoFriend[]
}) {
  return (
    <div className="pcMp-invite">
      {friends.map((friend, index) => (
        <div
          key={friend.id}
          className={`pcMp-invite-row ${index === 0 ? "sel" : ""} ${friend.status === "offline" ? "off" : ""}`}
        >
          <span className={`pcMp-pres ${friend.status}`} />
          <span className="pcMp-invite-name">{friend.name}</span>
          <Dim>
            {friend.playing ? `playing ${friend.playing}` : friend.status}
          </Dim>
          {friend.status === "offline" ? (
            <span className="pcMp-invite-cta off">—</span>
          ) : (
            <span className="pcMp-invite-cta">INVITE</span>
          )}
        </div>
      ))}
    </div>
  )
}
