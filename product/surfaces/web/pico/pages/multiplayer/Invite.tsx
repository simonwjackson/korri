/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Invite a friend (remote). Reads `picoFriendsAtom`.
 */
import { picoFriendsAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { InviteList } from "../../ui/organisms/InviteList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Invite() {
  return (
    <PicoData atom={picoFriendsAtom} title="PICO ▸ INVITE">
      {friends => (
        <ScreenShell
          title="PICO ▸ INVITE"
          hints={[
            { key: "a", label: "INVITE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <InviteList friends={friends} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
