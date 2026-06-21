/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Friends & presence. Reads `picoFriendsAtom`.
 */
import { picoFriendsAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { FriendsList } from "../../ui/organisms/FriendsList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Friends() {
  return (
    <PicoData atom={picoFriendsAtom} title="PICO ▸ FRIENDS">
      {friends => (
        <ScreenShell
          title="PICO ▸ FRIENDS"
          hints={[
            { key: "a", label: "JOIN" },
            { key: "y", label: "INVITE" },
            { key: "b", label: "BACK" },
          ]}
        >
          <FriendsList friends={friends} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
