/**
 * pico surface.
 *
 * Adapts the shared game fixtures into a tiny read-only view model the
 * three pico home-screen variants render against. Real theme would read
 * the live library bridge; here we want fixed density to judge layout at
 * 640x480.
 */
// Relative (not @platform/*) so the throwaway standalone Vite config can
// resolve it without the repo alias plugin.
import { games } from "@platform/fixtures/games/games"
// SPIKE: real game cover art (SteamGridDB), pre-pixelized + remapped to the
// PICO-8 palette (flat, no dither — the look the pixelart research landed on),
// 72x96 native so the screen's `image-rendering: pixelated` upscales it crisp.
// Titles are overridden to the real game so labels match the art (prototype-
// only; the shared platform fixture is untouched).
import hero01 from "./art/hero-01.png"
import hero02 from "./art/hero-02.png"
import hero03 from "./art/hero-03.png"
import hero04 from "./art/hero-04.png"
import hero05 from "./art/hero-05.png"
import hero06 from "./art/hero-06.png"
import hero07 from "./art/hero-07.png"
import hero08 from "./art/hero-08.png"
import lib01 from "./art/lib-01.png"
import lib02 from "./art/lib-02.png"
import lib03 from "./art/lib-03.png"
import lib04 from "./art/lib-04.png"
import lib05 from "./art/lib-05.png"
import lib06 from "./art/lib-06.png"
import lib07 from "./art/lib-07.png"
import lib08 from "./art/lib-08.png"
import lib09 from "./art/lib-09.png"
import lib10 from "./art/lib-10.png"
import lib11 from "./art/lib-11.png"
import lib12 from "./art/lib-12.png"
import lib13 from "./art/lib-13.png"
import lib14 from "./art/lib-14.png"
import lib15 from "./art/lib-15.png"
import lib16 from "./art/lib-16.png"
import lib17 from "./art/lib-17.png"
import lib18 from "./art/lib-18.png"
import lib19 from "./art/lib-19.png"
import lib20 from "./art/lib-20.png"
import lib21 from "./art/lib-21.png"
import lib22 from "./art/lib-22.png"
import lib23 from "./art/lib-23.png"
import lib24 from "./art/lib-24.png"
import logo01 from "./art/logo-01.png"
import logo02 from "./art/logo-02.png"
import logo03 from "./art/logo-03.png"
import logo04 from "./art/logo-04.png"
import logo05 from "./art/logo-05.png"
import logo06 from "./art/logo-06.png"
import logo07 from "./art/logo-07.png"
import logo08 from "./art/logo-08.png"

export interface PicoGame {
  readonly id: string
  readonly title: string
  readonly genre: string
  readonly developer: string
  readonly favorite: boolean
  readonly lastPlayedAt: number | null
  readonly lastPlayedLabel: string | null
  readonly playtimeLabel: string | null
  /** Cover art URL (remapped at runtime). Absent → synthetic cart label. */
  readonly art?: string
  /** Wide hero/key-art URL for the Spotlight background (featured games only). */
  readonly heroUrl?: string
  /** Transparent logo URL for the Spotlight title (featured games only). */
  readonly logoUrl?: string
}

// SPIKE: every game gets a real converted cover so the whole gallery fills out.
// Order matches the platform fixture's game order; title overrides the fictional
// fixture name so the label matches the art. (Synthetic carts still render for
// any game beyond this list / when art is absent.)
const SPIKE: readonly {
  readonly art: string
  readonly title: string
  readonly heroUrl?: string
  readonly logoUrl?: string
}[] = [
  { art: lib01, title: "Hollow Knight", heroUrl: hero01, logoUrl: logo01 },
  { art: lib02, title: "Hades", heroUrl: hero02, logoUrl: logo02 },
  { art: lib03, title: "Celeste", heroUrl: hero03, logoUrl: logo03 },
  { art: lib04, title: "Stardew Valley", heroUrl: hero04, logoUrl: logo04 },
  { art: lib05, title: "Cuphead", heroUrl: hero05, logoUrl: logo05 },
  { art: lib06, title: "Doom Eternal", heroUrl: hero06, logoUrl: logo06 },
  { art: lib07, title: "Disco Elysium", heroUrl: hero07, logoUrl: logo07 },
  {
    art: lib08,
    title: "Hyper Light Drifter",
    heroUrl: hero08,
    logoUrl: logo08,
  },
  { art: lib09, title: "Dead Cells" },
  { art: lib10, title: "Ori and the Will of the Wisps" },
  { art: lib11, title: "Katana Zero" },
  { art: lib12, title: "Shovel Knight" },
  { art: lib13, title: "Undertale" },
  { art: lib14, title: "Slay the Spire" },
  { art: lib15, title: "Sonic Mania" },
  { art: lib16, title: "Mega Man 11" },
  { art: lib17, title: "Streets of Rage 4" },
  { art: lib18, title: "Blasphemous" },
  { art: lib19, title: "Cult of the Lamb" },
  { art: lib20, title: "Tunic" },
  { art: lib21, title: "Gris" },
  { art: lib22, title: "Hotline Miami" },
  { art: lib23, title: "Outer Wilds" },
  { art: lib24, title: "Sea of Stars" },
]

function relativeLabel(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function playtimeLabel(minutes: number | undefined): string | null {
  if (!minutes) return null
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const picoGames: readonly PicoGame[] = games.map((game, index) => {
  const lastPlayed = game.playStats?.lastPlayed
  const playtimeSeconds = game.playStats?.totalPlaytimeSeconds
  const spike = SPIKE[index]
  return {
    id: game.id,
    title: spike?.title ?? game.metadata?.name ?? game.id,
    genre: game.metadata?.genre?.[0] ?? "GAME",
    developer: game.metadata?.developer ?? "UNKNOWN",
    favorite: game.userData?.favorite ?? false,
    lastPlayedAt: lastPlayed ? lastPlayed.getTime() : null,
    lastPlayedLabel: lastPlayed ? relativeLabel(lastPlayed) : null,
    playtimeLabel: playtimeLabel(
      playtimeSeconds !== undefined
        ? Math.round(playtimeSeconds / 60)
        : undefined,
    ),
    art: spike?.art,
    heroUrl: spike?.heroUrl,
    logoUrl: spike?.logoUrl,
  }
})

/** Continue-playing rail: recently played, most-recent first. */
export const picoRecent: readonly PicoGame[] = [...picoGames]
  .filter(game => game.lastPlayedAt !== null)
  .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
