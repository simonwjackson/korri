/**
 * pico surface. ATOMIC LAYER: page. Accounts & profiles (static).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
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
      <div
        className="pcSet-list"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetList)}
      >
        <div
          className="pcSet-profile sel"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfile)}
        >
          <span
            className="pcSet-avatar you"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAvatar)}
          >
            P1
          </span>
          <span
            className="pcSet-profile-text"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfileText)}
          >
            <span
              className="pcSet-label"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
            >
              PIXELPETE
            </span>
            <span
              className="pcSet-profile-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfileMeta)}
            >
              Signed in · player one
            </span>
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            ▸
          </span>
        </div>
        <div
          className="pcSet-profile"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfile)}
        >
          <span
            className="pcSet-avatar member"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetAvatar)}
          >
            P2
          </span>
          <span
            className="pcSet-profile-text"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfileText)}
          >
            <span
              className="pcSet-label"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetLabel)}
            >
              RETRORHEA
            </span>
            <span
              className="pcSet-profile-meta"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetProfileMeta)}
            >
              Household · signed out
            </span>
          </span>
          <span
            className="pcSet-info"
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetInfo)}
          >
            ▸
          </span>
        </div>
      </div>
      <div
        className="pcSet-actions"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcSetActions)}
      >
        <Btn kind="primary">
          <Icon name="plus" /> ADD PROFILE
        </Btn>
        <Btn kind="ghost">MANAGE HOUSEHOLD</Btn>
      </div>
    </ScreenShell>
  )
}
