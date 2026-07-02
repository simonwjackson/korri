/**
 * pico surface. ATOMIC LAYER: organism.
 *
 * Achievements: an unlocked/total summary, a freshly-unlocked toast, and the
 * full list with rarity tags.
 */
import type { PicoAchievement } from "../../fixtures-extra"
import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { Badge } from "../atoms/Badge"
import { Icon } from "../atoms/Icon"
import { Title } from "../atoms/Title"
import { List } from "../molecules/List"
import { Row } from "../molecules/Row"

export function AchievementList({
  achievements,
}: {
  readonly achievements: readonly PicoAchievement[]
}) {
  const unlocked = achievements.filter(ach => ach.unlocked).length
  const total = achievements.length
  return (
    <>
      <div
        className="pcFut-ach-summary"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.achievementList)}
      >
        <Title size={0}>ACHIEVEMENTS</Title>
        <Badge tone="accent">
          {unlocked} / {total}
        </Badge>
      </div>
      <div
        className="pcFut-ach-toast"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAchToast)}
      >
        <span
          className="pcFut-ach-toast-ico"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAchToastIco)}
        >
          <Icon name="star" />
        </span>
        <span
          className="pcFut-ach-toast-text"
          {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAchToastText)}
        >
          <b>UNLOCKED · NIGHT OWL</b>
          Still playing past midnight · just now
        </span>
        <Badge tone="good">+10</Badge>
      </div>
      <List>
        {achievements.map((ach, index) => (
          <Row
            key={ach.id}
            state={index === 1 ? "selected" : "default"}
            icon={
              <span
                className={`pcFut-ach-ico ${ach.unlocked ? "got" : "locked"}`}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAchIco)}
              >
                {ach.unlocked ? <Icon name="star" /> : "✦"}
              </span>
            }
            label={
              <span
                className={ach.unlocked ? "" : "pc-dim"}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAchName)}
              >
                {ach.name}
              </span>
            }
            meta={ach.unlocked ? ach.desc : `LOCKED · ${ach.desc}`}
            trailing={
              <span
                className={`pcFut-rarity r-${ach.rarity.toLowerCase()}`}
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutRarity)}
              >
                {ach.rarity}
              </span>
            }
          />
        ))}
      </List>
    </>
  )
}
