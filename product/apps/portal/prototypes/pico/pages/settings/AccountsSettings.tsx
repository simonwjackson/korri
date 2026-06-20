/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Accounts & profiles (static).
 */
import { Btn } from "../../ui/atoms/Btn"
import { Icon } from "../../ui/atoms/Icon"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function AccountsSettings() {
  return (
    <ScreenShell
      title="PICO ▸ ACCOUNTS"
      hints={[
        { key: "a", label: "SELECT" },
        { key: "y", label: "ADD" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-list">
        <div className="pcSet-profile sel">
          <span className="pcSet-avatar you">P1</span>
          <span className="pcSet-profile-text">
            <span className="pcSet-label">PIXELPETE</span>
            <span className="pcSet-profile-meta">Signed in · player one</span>
          </span>
          <span className="pcSet-info">▸</span>
        </div>
        <div className="pcSet-profile">
          <span className="pcSet-avatar member">P2</span>
          <span className="pcSet-profile-text">
            <span className="pcSet-label">RETRORHEA</span>
            <span className="pcSet-profile-meta">Household · signed out</span>
          </span>
          <span className="pcSet-info">▸</span>
        </div>
      </div>
      <div className="pcSet-actions">
        <Btn kind="primary">
          <Icon name="plus" /> ADD PROFILE
        </Btn>
        <Btn kind="ghost">MANAGE HOUSEHOLD</Btn>
      </div>
    </ScreenShell>
  )
}
