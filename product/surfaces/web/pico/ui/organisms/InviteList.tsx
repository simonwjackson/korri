/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Invite-a-friend list: presence dot, name, what they're playing, and an invite
 * CTA (disabled when offline). First row selected.
 */
import type { PicoFriend } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Dim } from "../atoms/Dim"

export function InviteList({
  friends,
}: {
  readonly friends: readonly PicoFriend[]
}) {
  return (
    <div
      className="pcMp-invite"
      {...picoDesignPartAttrs(PICO_DESIGN_PARTS.inviteList)}
    >
      {friends.map((friend, index) => (
        <div
          key={friend.id}
          className={`pcMp-invite-row ${index === 0 ? "sel" : ""} ${friend.status === "offline" ? "off" : ""}`}
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpInviteRow)}
        >
          <span
            className={`pcMp-pres ${friend.status}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpPres)}
          />
          <span
            className="pcMp-invite-name"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpInviteName)}
          >
            {friend.name}
          </span>
          <Dim>
            {friend.playing ? `playing ${friend.playing}` : friend.status}
          </Dim>
          {friend.status === "offline" ? (
            <span
              className="pcMp-invite-cta off"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpInviteCta)}
            >
              —
            </span>
          ) : (
            <span
              className="pcMp-invite-cta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcMpInviteCta)}
            >
              INVITE
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
