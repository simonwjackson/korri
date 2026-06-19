/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SHOWCASE — single-game "moment" heroes. Each is one screen, one
 * decision: art-forward, content-first, no rails/lists. They share `MomentHero`
 * (full-bleed pixelized key art + scrim + bottom-left kicker/logo/CTA) and read
 * real data through the same atom seam as the rest of Showcase (PicoData over
 * picoGamesAtom / picoHeroAtom / picoShowcaseAtom) — never a fixture import.
 * Layout in screens/moments.css (namespace pcM-).
 */
import type { ReactNode } from "react"
import {
  picoGamesAtom,
  picoHeroAtom,
  picoShowcaseAtom,
} from "../data/pico-library-atoms"
import type { PicoGame } from "../fixtures"
import { PicoArtImage } from "../PicoArtImage"
import { PicoData } from "./PicoData"
import { PicoIcon, PicoMascot, Screen } from "./kit"

type Hint = { readonly key: "a" | "b" | "y"; readonly label: string }

/** Shared cinematic hero shell: art backdrop + scrim + bottom-left content. */
function MomentHero({
  statusTitle,
  hints,
  game,
  kicker,
  children,
}: {
  readonly statusTitle: string
  readonly hints: readonly Hint[]
  readonly game: PicoGame
  readonly kicker: ReactNode
  readonly children: ReactNode
}) {
  const backdrop = game.heroUrl ?? game.art
  return (
    <Screen title={statusTitle} hints={hints} className="pad-0">
      <div className="pcM">
        {backdrop ? (
          <PicoArtImage
            src={backdrop}
            ratio={16 / 9}
            scale={2.8}
            className="pcM-bg"
          />
        ) : null}
        <div className="pcM-inner">
          <div className="pcM-kicker">{kicker}</div>
          {game.logoUrl ? (
            <PicoArtImage
              src={game.logoUrl}
              fit="contain"
              scale={3}
              className="pcM-logo"
            />
          ) : (
            <h1 className="pc-title pc-t3 pcM-title">{game.title}</h1>
          )}
          {children}
        </div>
      </div>
    </Screen>
  )
}

/* ── 1. Resume — right where you left off ─────────────────────────────────── */
export function ResumeScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ RESUME">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ RESUME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "RESTART" },
              { key: "b", label: "LIBRARY" },
            ]}
            game={game}
            kicker="▸ RIGHT WHERE YOU LEFT OFF"
          >
            <div className="pcM-save">
              <span className="pcM-slot">SAVE · CITY OF TEARS</span>
              <span className="pcM-meta">
                68% · {game.lastPlayedLabel ?? "recently"}
              </span>
            </div>
            <div className="pcM-progress">
              <div className="pcM-progress-fill" style={{ width: "68%" }} />
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> CONTINUE
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}

/* ── 2. Tonight's Pick — one confident recommendation ─────────────────────── */
export function TonightPickScreen() {
  return (
    <PicoData atom={picoShowcaseAtom} title="PICO ▸ TONIGHT">
      {({ games, recent }) => {
        const pick = games[1] ?? games[0]
        const reason = recent[0]?.title ?? games[0]?.title ?? "your favorites"
        if (!pick) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ TONIGHT"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "SHUFFLE" },
              { key: "b", label: "BACK" },
            ]}
            game={pick}
            kicker={`▸ BECAUSE YOU PLAYED ${reason.toUpperCase()}`}
          >
            <div className="pcM-meta">
              {pick.genre.toUpperCase()} · {pick.developer.toUpperCase()}
            </div>
            <div className="pcM-actions">
              <span className="pcM-cta">
                <PicoIcon name="play" /> PLAY
              </span>
              <span className="pcM-cta ghost">
                <PicoIcon name="restart" /> SHUFFLE
              </span>
            </div>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 3. Quick Session — content-first by available time ───────────────────── */
export function QuickSessionScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ QUICK">
      {games => {
        const pick = games[4] ?? games[0]
        if (!pick) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ QUICK"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "OTHER" },
              { key: "b", label: "BACK" },
            ]}
            game={pick}
            kicker="▸ GOT 20 MINUTES?"
          >
            <div className="pcM-tags">
              <span className="pcM-tag">~15 MIN RUNS</span>
              <span className="pcM-tag">PICK UP &amp; PLAY</span>
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> PLAY
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 4. Friends Are Playing — jump into their game ────────────────────────── */
const FRIEND = { name: "RETRORHEA", playing: "Hollow Knight" } as const
export function FriendPlayingScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ FRIENDS">
      {games => {
        const game =
          games.find(candidate => candidate.title === FRIEND.playing) ??
          games[0]
        if (!game) return null
        const avatar = games[14]?.art
        return (
          <MomentHero
            statusTitle="PICO ▸ FRIENDS"
            hints={[
              { key: "a", label: "JOIN" },
              { key: "y", label: "WATCH" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ A FRIEND IS PLAYING"
          >
            <div className="pcM-friend">
              {avatar ? (
                <PicoArtImage
                  src={avatar}
                  ratio={1}
                  className="pcM-friend-av"
                />
              ) : null}
              <div className="pcM-friend-text">
                <span className="pcM-pres" />
                <b>{FRIEND.name}</b> · PLAYING NOW
              </div>
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> JOIN GAME
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 5. Victory — you beat it (achievement payoff) ────────────────────────── */
export function VictoryScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ VICTORY">
      {games => {
        const game =
          games.find(candidate => candidate.title === "Celeste") ?? games[0]
        const next =
          games.find(candidate => candidate.title === "Hades") ?? games[1]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ VICTORY"
            hints={[
              { key: "a", label: "WHAT'S NEXT" },
              { key: "y", label: "SHARE" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="★ YOU BEAT IT ★"
          >
            <div className="pcM-badge">
              <PicoIcon name="star" /> NO HIT
              <span className="pcM-rarity">EPIC</span>
            </div>
            {next ? <div className="pcM-next">NEXT UP · {next.title}</div> : null}
            <span className="pcM-cta">
              <PicoIcon name="play" />{" "}
              {next ? `PLAY ${next.title.toUpperCase()}` : "CONTINUE"}
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 6. Fresh Install — ready to play (acquisition payoff) ─────────────────── */
export function FreshInstallScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ READY">
      {games => {
        const game = games[7] ?? games[0]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ READY"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "DETAILS" },
              { key: "b", label: "LIBRARY" },
            ]}
            game={game}
            kicker={
              <>
                <span className="pcM-new">★ NEW</span> READY TO PLAY
              </>
            }
          >
            <div className="pcM-meta">INSTALLED · 2.4 GB · ALL SET</div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> PLAY NOW
            </span>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 7. Welcome Back — personable re-entry (Pixl-led) ─────────────────────── */
export function WelcomeBackScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ WELCOME">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ WELCOME"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "WHAT'S NEW" },
              { key: "b", label: "HOME" },
            ]}
            game={game}
            kicker="▸ WELCOME BACK"
          >
            <div className="pcM-greet">
              <PicoMascot state="happy" className="pcM-greet-pixl" />
              <span>it&apos;s been 3 days — your crew missed you</span>
            </div>
            <div className="pcM-meta">
              WHILE YOU WERE GONE · 8BITBEN BEAT YOUR SCORE
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> JUMP BACK IN
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}

/* ── 8. Finish It — one boss left (completion nudge) ──────────────────────── */
export function FinishItScreen() {
  return (
    <PicoData atom={picoHeroAtom} title="PICO ▸ FINISH IT">
      {game =>
        game ? (
          <MomentHero
            statusTitle="PICO ▸ FINISH IT"
            hints={[
              { key: "a", label: "CONTINUE" },
              { key: "y", label: "INFO" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ ONE BOSS LEFT"
          >
            <div className="pcM-meta">92% COMPLETE · THE FINAL FIGHT AWAITS</div>
            <div className="pcM-progress">
              <div className="pcM-progress-fill" style={{ width: "92%" }} />
            </div>
            <span className="pcM-cta">
              <PicoIcon name="play" /> FINISH THE FIGHT
            </span>
          </MomentHero>
        ) : null
      }
    </PicoData>
  )
}

/* ── 9. Backlog Rescue — owned but never played ───────────────────────────── */
export function BacklogScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ BACKLOG">
      {games => {
        const game =
          games.find(g => g.lastPlayedAt === null && g.logoUrl) ??
          games.find(g => g.lastPlayedAt === null) ??
          games[3]
        if (!game) return null
        return (
          <MomentHero
            statusTitle="PICO ▸ BACKLOG"
            hints={[
              { key: "a", label: "GIVE IT A GO" },
              { key: "y", label: "NOT TONIGHT" },
              { key: "b", label: "BACK" },
            ]}
            game={game}
            kicker="▸ STILL IN YOUR BACKLOG"
          >
            <div className="pcM-meta">ADDED 3 MONTHS AGO · NEVER PLAYED</div>
            <div className="pcM-actions">
              <span className="pcM-cta">
                <PicoIcon name="play" /> GIVE IT A SHOT
              </span>
              <span className="pcM-cta ghost">
                <PicoIcon name="close" /> NOT TONIGHT
              </span>
            </div>
          </MomentHero>
        )
      }}
    </PicoData>
  )
}

/* ── 10. Mood Picker — curate by feeling, not genre (multi-tile sibling) ──── */
const MOODS: readonly { readonly label: string; readonly title: string }[] = [
  { label: "COZY", title: "Stardew Valley" },
  { label: "INTENSE", title: "Hades" },
  { label: "WEIRD", title: "Disco Elysium" },
]
export function MoodPickerScreen() {
  return (
    <PicoData atom={picoGamesAtom} title="PICO ▸ MOOD">
      {games => {
        const tiles = MOODS.map((mood, index) => ({
          ...mood,
          game: games.find(g => g.title === mood.title) ?? games[index],
        })).filter((tile): tile is typeof tile & { game: PicoGame } =>
          Boolean(tile.game),
        )
        return (
          <Screen
            title="PICO ▸ MOOD"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "RESHUFFLE" },
              { key: "b", label: "BACK" },
            ]}
            className="pad-0"
          >
            <div className="pcMood">
              <div className="pcMood-kicker">
                ▸ WHAT ARE YOU IN THE MOOD FOR?
              </div>
              <div className="pcMood-tiles">
                {tiles.map((tile, index) => (
                  <div
                    key={tile.label}
                    className={`pcMood-tile ${index === 1 ? "on" : ""}`}
                  >
                    <div className="pcMood-art">
                      {tile.game.art ? (
                        <PicoArtImage
                          src={tile.game.art}
                          className="pcMood-img"
                        />
                      ) : null}
                    </div>
                    <div className="pcMood-label">{tile.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}
