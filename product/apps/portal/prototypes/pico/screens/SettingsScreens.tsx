/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SETTINGS — additional settings surfaces beyond the two-pane
 * Variant B. Each detail pane is a list of label + control rows (one focused);
 * Labs / System are the real kiosk dialogs modelled as kit modals. Composed
 * from screens/kit.tsx; screen-specific layout in screens/settings.css
 * (namespace pcSet-).
 */
import {
  BlockBar,
  Btn,
  Card,
  Modal,
  Opt,
  Progress,
  Screen,
  Toggle,
} from "./kit"

export function DisplaySettingsScreen() {
  return (
    <Screen
      title="PICO ▸ DISPLAY"
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "y", label: "DEFAULTS" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-label">Brightness</span>
          <BlockBar level={6} max={10} />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Color Mode</span>
          <Opt value="VIVID" />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Scanlines</span>
          <Toggle on />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Integer Scale</span>
          <Toggle on />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Aspect</span>
          <Opt value="4:3" />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Shader</span>
          <Opt value="CRT" />
        </div>
      </div>
    </Screen>
  )
}

export function NetworkSettingsScreen() {
  return (
    <Screen
      title="PICO ▸ NETWORK"
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "y", label: "FORGET" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-label">Wi-Fi</span>
          <Toggle on />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Network</span>
          <span className="pcSet-info">PICO-NET</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Stream Quality</span>
          <Opt value="BALANCED" />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Max Bitrate</span>
          <BlockBar level={7} max={10} />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Host Discovery</span>
          <Toggle on />
        </div>
      </div>
    </Screen>
  )
}

export function StorageSettingsScreen() {
  return (
    <Screen
      title="PICO ▸ STORAGE"
      hints={[
        { key: "a", label: "MANAGE" },
        { key: "y", label: "CLEAR" },
        { key: "b", label: "BACK" },
      ]}
    >
      <Card title="DEVICE STORAGE">
        <Progress pct={41} />
        <div className="pcSet-usage">
          <span className="pcSet-used">26 GB USED</span>
          <span className="pcSet-free">64 GB TOTAL</span>
        </div>
      </Card>
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-swatch games" />
          <span className="pcSet-label">Games</span>
          <span className="pcSet-info">18.4 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch saves" />
          <span className="pcSet-label">Saves</span>
          <span className="pcSet-info">2.1 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch system" />
          <span className="pcSet-label">System</span>
          <span className="pcSet-info">5.5 GB</span>
        </div>
        <div className="pcSet-row">
          <span className="pcSet-swatch free" />
          <span className="pcSet-label">Free</span>
          <span className="pcSet-info">38.0 GB</span>
        </div>
      </div>
      <div className="pcSet-actions">
        <Btn kind="primary">▸ MANAGE</Btn>
        <Btn>CLEAR CACHE · 1.2 GB</Btn>
      </div>
    </Screen>
  )
}

export function ThemeSettingsScreen() {
  return (
    <Screen
      title="PICO ▸ THEME"
      hints={[
        { key: "a", label: "APPLY" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSet-themes">
        <div className="pcSet-theme">
          <span className="pcSet-theme-swatch shift" />
          <span className="pcSet-theme-name">SHIFT</span>
        </div>
        <div className="pcSet-theme sel">
          <span className="pcSet-theme-swatch pico" />
          <span className="pcSet-theme-name">PICO</span>
          <span className="pcSet-theme-tick">✓</span>
        </div>
        <div className="pcSet-theme">
          <span className="pcSet-theme-swatch demo" />
          <span className="pcSet-theme-name">DEMO</span>
        </div>
      </div>
      <Card title="ACCENT COLOR">
        <div className="pcSet-accents">
          <span className="pcSet-accent yellow sel" />
          <span className="pcSet-accent red" />
          <span className="pcSet-accent orange" />
          <span className="pcSet-accent lime" />
          <span className="pcSet-accent blue" />
          <span className="pcSet-accent pink" />
          <span className="pcSet-accent lilac" />
          <span className="pcSet-accent peach" />
        </div>
      </Card>
    </Screen>
  )
}

export function AccountsSettingsScreen() {
  return (
    <Screen
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
            <span className="pcSet-profile-meta">Signed in · you</span>
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
        <Btn kind="primary">＋ ADD PROFILE</Btn>
        <Btn kind="ghost">MANAGE HOUSEHOLD</Btn>
      </div>
    </Screen>
  )
}

export function LabsPanelScreen() {
  return (
    <Modal
      title="β LABS"
      hints={[
        { key: "a", label: "TOGGLE" },
        { key: "b", label: "CLOSE" },
      ]}
    >
      <p className="pcSet-modal-desc">
        Experimental controls for tuning this kiosk surface.
      </p>
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-label">UI Scale</span>
          <BlockBar level={5} max={10} />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Holographic Carts</span>
          <Toggle on />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Predictive Preload</span>
          <Toggle on={false} />
        </div>
      </div>
    </Modal>
  )
}

export function SystemPanelScreen() {
  return (
    <Modal
      title="⚙ SYSTEM"
      hints={[
        { key: "a", label: "ADJUST" },
        { key: "b", label: "CLOSE" },
      ]}
    >
      <p className="pcSet-modal-desc">
        Device controls for the active session.
      </p>
      <div className="pcSet-list">
        <div className="pcSet-row sel">
          <span className="pcSet-label">Brightness</span>
          <BlockBar level={6} max={10} />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Volume</span>
          <BlockBar level={7} max={10} />
        </div>
        <div className="pcSet-row">
          <span className="pcSet-label">Battery</span>
          <span className="pcSet-info">82% · 3h 40m</span>
        </div>
      </div>
    </Modal>
  )
}
