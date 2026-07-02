/**
 * pico surface. ATOMIC LAYER: page. Launch failure. Reads
 * `picoFailureKindsAtom`.
 */
import { picoFailureKindsAtom } from "../../data/pico-session-atoms"
import { PicoData } from "../../screens/PicoData"
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { FailureList } from "../../ui/organisms/FailureList"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function LaunchFailure() {
  return (
    <PicoData atom={picoFailureKindsAtom} title="PICO ▸ LAUNCH">
      {failureKinds => (
        <ScreenShell
          title="PICO ▸ LAUNCH"
          tone="alert"
          hints={[
            { key: "a", label: "RETRY" },
            { key: "b", label: "BACK" },
          ]}
        >
          <div className="pcSes-fail-banner">
            <span className="pcSes-fail-banner-ico">
              <Icon name="close" />
            </span>
            <span className="pcSes-fail-banner-text">
              <b>STREAM FAILED</b>
              Moonlight never picked up the line — couldn't start or connect.
              Give it another shot, or play locally.
            </span>
            <Btn kind="danger">
              <Icon name="restart" /> RETRY
            </Btn>
          </div>
          <FailureList failures={failureKinds} />
        </ScreenShell>
      )}
    </PicoData>
  )
}
