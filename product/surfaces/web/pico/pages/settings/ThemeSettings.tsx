/**
 * pico surface. ATOMIC LAYER: page. Themes (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
      <div
        className="pcSet-themes"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemes)}
      >
        <div
          className="pcSet-theme"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetTheme)}
        >
          <span
            className="pcSet-theme-swatch shift"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeSwatch)}
          />
          <span
            className="pcSet-theme-name"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeName)}
          >
            SHIFT
          </span>
        </div>
        <div
          className="pcSet-theme sel"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetTheme)}
        >
          <span
            className="pcSet-theme-swatch pico"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeSwatch)}
          />
          <span
            className="pcSet-theme-name"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeName)}
          >
            PICO
          </span>
          <span
            className="pcSet-theme-tick"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeTick)}
          >
            <Icon name="check" />
          </span>
        </div>
        <div
          className="pcSet-theme"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetTheme)}
        >
          <span
            className="pcSet-theme-swatch demo"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeSwatch)}
          />
          <span
            className="pcSet-theme-name"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetThemeName)}
          >
            DEMO
          </span>
        </div>
      </div>
      <Card title="ACCENT COLOR">
        <div
          className="pcSet-accents"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccents)}
        >
          <span
            className="pcSet-accent yellow sel"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent red"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent orange"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent lime"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent blue"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent pink"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent lilac"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
          <span
            className="pcSet-accent peach"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAccent)}
          />
        </div>
      </Card>
    </ScreenShell>
  )
}
