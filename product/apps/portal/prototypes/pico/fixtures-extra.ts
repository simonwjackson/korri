/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Extra fake view-models for the max-out state gallery. None of this is wired
 * to real RPC / plugins / sessions — it is fixed-density fixture data so every
 * gallery screen has something believable to render. Mirrors the read-only,
 * `readonly`-everywhere style of fixtures.ts. Shapes loosely echo the real
 * Korri concepts they stand in for (releases, app-choices, download resolution,
 * session lifecycle, seats, presence) but are deliberately lightweight.
 */
import { picoGames, picoRecent } from "./fixtures"

/** A launchable target for a game (RetroArch core, FEX/Proton app, native). */
export interface PicoRelease {
  readonly id: string
  readonly system: string
  readonly app: string
  readonly runtime: string | null
  readonly size: string
  readonly installed: boolean
  readonly recommended: boolean
}

/** An emulator / app choice for a release (app-choice-selection stand-in). */
export interface PicoAppChoice {
  readonly id: string
  readonly name: string
  readonly runtime: string
  readonly note: string
}

/** Community facets some providers contribute (PortMaster / Mega Man Maker). */
export interface PicoCommunityStats {
  readonly plays: number
  readonly likes: number
  readonly dislikes: number
  readonly difficulty: number
  readonly score: number
}

/** A save-state slot. */
export interface PicoSaveSlot {
  readonly index: number
  readonly label: string
  readonly stamp: string | null
  readonly empty: boolean
}

/** A discovered LAN stream host (moonlight). */
export interface PicoHost {
  readonly id: string
  readonly name: string
  readonly addr: string
  readonly status: "online" | "busy" | "paired" | "offline"
  readonly latencyMs: number | null
}

/** A connected seat / device (seat-metadata stand-in). */
export interface PicoSeat {
  readonly id: string
  readonly name: string
  readonly kind: string
  readonly battery: number | null
  readonly active: boolean
}

/** A friend / presence entry. */
export interface PicoFriend {
  readonly id: string
  readonly name: string
  readonly status: "playing" | "online" | "away" | "offline"
  readonly playing: string | null
}

/** A player in a local/remote session (seat + readiness + controller kind). */
export interface PicoPlayer {
  readonly id: string
  readonly name: string
  readonly seat: 1 | 2 | 3 | 4
  readonly status: "host" | "ready" | "joining" | "open"
  readonly controller: "HANDHELD" | "GAMEPAD" | "PHONE" | "KEYBOARD"
  /** Pixelized avatar art (reuses cover art as a stand-in). */
  readonly avatar?: string
  readonly you?: boolean
}

/** An achievement. */
export interface PicoAchievement {
  readonly id: string
  readonly name: string
  readonly desc: string
  readonly unlocked: boolean
  readonly rarity: string
}

/** A leaderboard row. */
export interface PicoScoreRow {
  readonly rank: number
  readonly name: string
  readonly score: string
  readonly you: boolean
}

/** A storefront / discovery tile. */
export interface PicoStoreItem {
  readonly id: string
  readonly title: string
  readonly tag: string
  readonly price: string
  readonly source: string
}

/** The eight launch-failure kinds the real launch-action gate surfaces. */
export const PICO_FAILURE_KINDS: readonly {
  readonly kind: string
  readonly title: string
  readonly detail: string
}[] = [
  {
    kind: "host-unavailable",
    title: "NO HOST",
    detail:
      "No connected Korri server. Check the host is awake on your network.",
  },
  {
    kind: "moonlight-failed",
    title: "STREAM FAILED",
    detail: "Moonlight could not start or connect. Retry, or play locally.",
  },
  {
    kind: "prepare-failed",
    title: "HOST BUSY",
    detail: "The server can't prepare streams right now. Try again shortly.",
  },
  {
    kind: "no-such-game",
    title: "GONE",
    detail: "This game is no longer available on the server.",
  },
  {
    kind: "input-unavailable",
    title: "NO PAD",
    detail: "No gamepad detected. Connect a controller and retry.",
  },
  {
    kind: "input-ambiguous",
    title: "WHICH PAD?",
    detail: "Multiple controllers found. Pick one, then retry.",
  },
  {
    kind: "session-busy",
    title: "IN USE",
    detail: "Another stream is already active on this host.",
  },
  {
    kind: "command-failed",
    title: "LAUNCH FAILED",
    detail: "The game's launch command exited unexpectedly.",
  },
]

/** The boot / foreground-session lifecycle steps, in order. */
export const PICO_BOOT_STEPS: readonly string[] = [
  "PREPARING",
  "SPAWNING",
  "FOREGROUNDING",
  "RUNNING",
]

/** The runtimes Korri can resolve. */
export const PICO_RUNTIMES: readonly string[] = [
  "FEX",
  "PROTON 10",
  "PROTON-GE",
  "NATIVE",
]

/** The systems / cores content can come from. */
export const PICO_SYSTEMS: readonly {
  readonly id: string
  readonly name: string
  readonly count: number
}[] = [
  { id: "gba", name: "GAME BOY ADV", count: 18 },
  { id: "snes", name: "SUPER NES", count: 24 },
  { id: "nes", name: "NES", count: 31 },
  { id: "pico8", name: "PICO-8 BBS", count: 57 },
  { id: "portmaster", name: "PORTMASTER", count: 42 },
  { id: "windows", name: "WINDOWS (FEX)", count: 9 },
]

export const picoReleases: readonly PicoRelease[] = [
  {
    id: "rel-ra-gba",
    system: "GBA",
    app: "RETROARCH · mGBA",
    runtime: null,
    size: "8 MB",
    installed: true,
    recommended: true,
  },
  {
    id: "rel-ra-gba-vba",
    system: "GBA",
    app: "RETROARCH · VBA-M",
    runtime: null,
    size: "8 MB",
    installed: true,
    recommended: false,
  },
  {
    id: "rel-fex",
    system: "WINDOWS",
    app: "NATIVE · FEX",
    runtime: "FEX",
    size: "104 MB",
    installed: false,
    recommended: false,
  },
]

export const picoAppChoices: readonly PicoAppChoice[] = [
  {
    id: "mgba",
    name: "mGBA",
    runtime: "libretro",
    note: "Accurate, recommended",
  },
  {
    id: "vbam",
    name: "VBA-M",
    runtime: "libretro",
    note: "Faster, less accurate",
  },
  { id: "gpsp", name: "gpSP", runtime: "libretro", note: "Lightweight" },
]

export const picoStats: PicoCommunityStats = {
  plays: 14820,
  likes: 1342,
  dislikes: 28,
  difficulty: 7,
  score: 314,
}

export const picoSaveSlots: readonly PicoSaveSlot[] = [
  { index: 1, label: "WORLD 3-2", stamp: "2h ago", empty: false },
  { index: 2, label: "BOSS RUSH", stamp: "yesterday", empty: false },
  { index: 3, label: "100% RUN", stamp: "3d ago", empty: false },
  { index: 4, label: "EMPTY", stamp: null, empty: true },
  { index: 5, label: "EMPTY", stamp: null, empty: true },
  { index: 6, label: "AUTO", stamp: "1m ago", empty: false },
]

export const picoHosts: readonly PicoHost[] = [
  {
    id: "den",
    name: "DEN-RIG",
    addr: "192.168.1.10",
    status: "online",
    latencyMs: 4,
  },
  {
    id: "office",
    name: "OFFICE-NUC",
    addr: "192.168.1.22",
    status: "busy",
    latencyMs: 11,
  },
  {
    id: "thor",
    name: "THOR-DECK",
    addr: "192.168.1.31",
    status: "paired",
    latencyMs: 7,
  },
  {
    id: "attic",
    name: "ATTIC-PI",
    addr: "192.168.1.44",
    status: "offline",
    latencyMs: null,
  },
]

export const picoSeats: readonly PicoSeat[] = [
  { id: "s1", name: "RG353M", kind: "HANDHELD", battery: 82, active: true },
  { id: "s2", name: "THOR", kind: "HANDHELD", battery: 64, active: false },
  {
    id: "s3",
    name: "8BITDO PRO 2",
    kind: "GAMEPAD",
    battery: 91,
    active: true,
  },
  {
    id: "s4",
    name: '65" 4K TV',
    kind: "DISPLAY",
    battery: null,
    active: false,
  },
]

export const picoFriends: readonly PicoFriend[] = [
  { id: "f1", name: "PIXELPETE", status: "playing", playing: "Celeste" },
  { id: "f2", name: "RETRORHEA", status: "playing", playing: "Hollow Knight" },
  { id: "f3", name: "8BITBEN", status: "online", playing: null },
  { id: "f4", name: "MEGAMARA", status: "away", playing: null },
  { id: "f5", name: "VECTORVIV", status: "offline", playing: null },
]

export const picoPlayers: readonly PicoPlayer[] = [
  {
    id: "p1",
    name: "YOU",
    seat: 1,
    status: "host",
    controller: "HANDHELD",
    avatar: picoGames[12]?.art,
    you: true,
  },
  {
    id: "p2",
    name: "PIXELPETE",
    seat: 2,
    status: "ready",
    controller: "GAMEPAD",
    avatar: picoGames[14]?.art,
  },
  {
    id: "p3",
    name: "8BITBEN",
    seat: 3,
    status: "joining",
    controller: "PHONE",
    avatar: picoGames[18]?.art,
  },
  { id: "p4", name: "OPEN", seat: 4, status: "open", controller: "KEYBOARD" },
]

export const picoAchievements: readonly PicoAchievement[] = [
  {
    id: "a1",
    name: "FIRST BLOOD",
    desc: "Win your first match",
    unlocked: true,
    rarity: "COMMON",
  },
  {
    id: "a2",
    name: "SPEEDRUNNER",
    desc: "Finish under 30 minutes",
    unlocked: true,
    rarity: "RARE",
  },
  {
    id: "a3",
    name: "NO HIT",
    desc: "Beat a boss without taking damage",
    unlocked: false,
    rarity: "EPIC",
  },
  {
    id: "a4",
    name: "COMPLETIONIST",
    desc: "Collect every item",
    unlocked: false,
    rarity: "LEGENDARY",
  },
  {
    id: "a5",
    name: "NIGHT OWL",
    desc: "Play after midnight",
    unlocked: true,
    rarity: "COMMON",
  },
]

export const picoScores: readonly PicoScoreRow[] = [
  { rank: 1, name: "PIXELPETE", score: "999,999", you: false },
  { rank: 2, name: "RETRORHEA", score: "874,210", you: false },
  { rank: 3, name: "YOU", score: "812,500", you: true },
  { rank: 4, name: "8BITBEN", score: "640,000", you: false },
  { rank: 5, name: "MEGAMARA", score: "512,300", you: false },
]

export const picoStoreItems: readonly PicoStoreItem[] = [
  {
    id: "st1",
    title: "PORTMASTER PICKS",
    tag: "CURATED",
    price: "FREE",
    source: "PortMaster",
  },
  {
    id: "st2",
    title: "PICO-8 SPLORE",
    tag: "BBS",
    price: "FREE",
    source: "PICO-8",
  },
  {
    id: "st3",
    title: "FANGAME VAULT",
    tag: "FEX",
    price: "FREE",
    source: "Community",
  },
  {
    id: "st4",
    title: "ROM HACK ARCHIVE",
    tag: "SMW",
    price: "FREE",
    source: "SMW Central",
  },
]

/** Convenience: a representative "current" game for in-session screens. */
export const picoHero = picoRecent[0] ?? picoGames[0]
