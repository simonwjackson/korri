/**
 * PROTOTYPE — pico theme. Throwaway. ATOMIC LAYER: page.
 * Activity feed (static demo data).
 */
import { ScreenShell } from "../../ui/templates/ScreenShell"

const FEED: readonly {
  readonly actor: string
  readonly verb: string
  readonly target: string
  readonly when: string
  readonly you: boolean
}[] = [
  {
    actor: "PIXELPETE",
    verb: "unlocked",
    target: "SPEEDRUNNER",
    when: "2m ago",
    you: false,
  },
  {
    actor: "RETRORHEA",
    verb: "started",
    target: "Hollow Knight",
    when: "14m ago",
    you: false,
  },
  { actor: "YOU", verb: "beat", target: "World 3", when: "1h ago", you: true },
  {
    actor: "8BITBEN",
    verb: "topped the board on",
    target: "Celeste",
    when: "3h ago",
    you: false,
  },
  {
    actor: "MEGAMARA",
    verb: "favorited",
    target: "Sonic Robo Blast 2",
    when: "yesterday",
    you: false,
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
      <div className="pcFut-feed">
        {FEED.map((item, index) => (
          <div
            key={`${item.actor}-${item.target}`}
            className={`pcFut-feed-row ${index === 0 ? "fresh" : ""}`}
          >
            <span className={`pcFut-ava ${item.you ? "you" : "on"}`}>
              {item.actor.slice(0, 2)}
            </span>
            <span className="pcFut-feed-text">
              <span className="pcFut-feed-line">
                <b className={item.you ? "pcFut-you" : ""}>{item.actor}</b>{" "}
                {item.verb} <span className="pcFut-target">{item.target}</span>
              </span>
              <span className="pc-dim pcFut-when">{item.when}</span>
            </span>
          </div>
        ))}
      </div>
    </ScreenShell>
  )
}
