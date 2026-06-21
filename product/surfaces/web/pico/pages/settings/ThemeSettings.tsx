/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page. Themes (static).
 */

import { Icon } from "../../ui/atoms/Icon"
import { Card } from "../../ui/molecules/Card"
import { ScreenShell } from "../../ui/templates/ScreenShell"

export function ThemeSettings() {
  return (
    <ScreenShell
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
          <span className="pcSet-theme-tick">
            <Icon name="check" />
          </span>
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
    </ScreenShell>
  )
}
