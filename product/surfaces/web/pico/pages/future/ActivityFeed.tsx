/**
 * pico surface. ATOMIC LAYER: page.
 * Activity feed (static demo data).
 */

import { PICO_DESIGN_PARTS, picoDesignPartAttrs } from "../../pico-design-parts"
import { ScreenShell } from "../../ui/templates/ScreenShell"

const FEED: readonly {
  readonly actor: string
  readonly verb: string
  readonly target: string
  readonly when: string
  readonly actorKind: "viewer" | "friend"
}[] = [
  {
    actor: "PIXELPETE",
    verb: "unlocked",
    target: "SPEEDRUNNER",
    when: "2m ago",
    actorKind: "friend",
  },
  {
    actor: "RETRORHEA",
    verb: "started",
    target: "Hollow Knight",
    when: "14m ago",
    actorKind: "friend",
  },
  {
    actor: "YOU",
    verb: "beat",
    target: "World 3",
    when: "1h ago",
    actorKind: "viewer",
  },
  {
    actor: "8BITBEN",
    verb: "topped the board on",
    target: "Celeste",
    when: "3h ago",
    actorKind: "friend",
  },
  {
    actor: "MEGAMARA",
    verb: "favorited",
    target: "Sonic Robo Blast 2",
    when: "yesterday",
    actorKind: "friend",
  },
]

export function ActivityFeed() {
  return (
    <ScreenShell
      title="PICO ▸ ACTIVITY"
      hints={[
        { key: "a", label: "OPEN" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div
        className="pcFut-feed"
        {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeed)}
      >
        {FEED.map((item, index) => (
          <div
            key={`${item.actor}-${item.target}`}
            className={`pcFut-feed-row ${index === 0 ? "fresh" : ""}`}
            {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeedRow)}
          >
            <span
              className={`pcFut-ava ${item.actorKind === "viewer" ? "you" : "on"}`}
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutAva)}
            >
              {item.actor.slice(0, 2)}
            </span>
            <span
              className="pcFut-feed-text"
              {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeedText)}
            >
              <span
                className="pcFut-feed-line"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutFeedLine)}
              >
                <b className={item.actorKind === "viewer" ? "pcFut-you" : ""}>
                  {item.actor}
                </b>{" "}
                {item.verb}{" "}
                <span
                  className="pcFut-target"
                  {...picoDesignPartAttrs(PICO_DESIGN_PARTS.pcFutTarget)}
                >
                  {item.target}
                </span>
              </span>
              <span
                className="pc-dim pcFut-when"
                {...picoDesignPartAttrs(PICO_DESIGN_PARTS.dim)}
              >
                {item.when}
              </span>
            </span>
          </div>
        ))}
      </div>
    </ScreenShell>
  )
}
