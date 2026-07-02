/**
 * pico surface. ATOMIC LAYER: page.
 * Profile. Reads `picoProfileAtom`.
 */
import { picoProfileAtom } from "../../data/pico-social-atoms"
import { PicoData } from "../../screens/PicoData"
import { ProfileCard } from "../../ui/organisms/ProfileCard"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function Profile() {
  return (
    <PicoData atom={picoProfileAtom} title="PICO ▸ PROFILE">
      {({ games, friends }) => (
        <ScreenShell
          title="PICO ▸ PROFILE"
          hints={[
            { key: "a", label: "EDIT" },
            { key: "b", label: "BACK" },
          ]}
        >
          <ProfileCard games={games} friends={friends} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
