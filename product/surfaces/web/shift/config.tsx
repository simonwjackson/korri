/**
 * Shift — theme-workshop config (device-lab wiring).
 *
 * Surface #1 / the reference consumer of @korri/intrinsic-design. This module
 * exports data only: the device roster, the generator knobs (which write the
 * --shift-* indirection vars shift.css reads), and a fixture-backed screen
 * catalog. The workshop app imports `shiftConfig` and mounts it; Shift depends
 * on the workshop's *types* alone, never its runtime (mirrors pico/config.tsx).
 *
 * Shift's CSS is scoped under [data-shift-home] (created by ShiftCinematicHome), and
 * that element carries the `intrinsic` class, so the recipe re-derives the whole
 * scale against the device frame the lab renders it inside. The knob sliders
 * drive the generators only: --shift-base-* / --shift-type-ratio /
 * --shift-space-unit, which shift.css reads with committed defaults.
 */
import type {
  DeviceConfig,
  Screen,
  ThemeKnob,
  ThemeWorkshopConfig,
} from "@tools/theme-workshop"
import { DEV_GAME_MEDIA } from "./dev-game-media"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./pages/ShiftCinematicHome"
import {
  ShiftGameDetailScreen,
  type ShiftGameDetailView,
} from "./pages/ShiftGameDetailScreen"
import "./shift.css"

const SHIFT_DEFAULT_PX_PER_MM = 6.78

// Same physical roster pico calibrates against, so a single composition can be
// stressed across the handheld → panel → TV range the knobs target.
const SHIFT_DEVICES: readonly DeviceConfig[] = [
  {
    id: "rg353m",
    name: "RG353M",
    widthMm: 72,
    heightMm: 52,
  },
  {
    id: "thor",
    name: "THOR",
    widthMm: 132,
    heightMm: 76,
    // Dual-screen: the main panel plus a smaller one beneath it. The bottom
    // screen is a placeholder slot for now (quick controls / music / a guide
    // will mount here). Sizes are provisional — calibrate against the hardware.
    screens: [
      {
        id: "thor-top",
        label: "Top",
        widthMm: 132,
        heightMm: 76,
        role: "primary",
      },
      {
        id: "thor-bottom",
        label: "Bottom",
        widthMm: 75,
        heightMm: 65,
        role: "secondary",
        placement: "below",
      },
    ],
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
  },
  {
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    bezel: false,
  },
]

// Generator knobs. cssVar targets the --shift-* indirection vars shift.css reads
// (with the committed defaults as fallbacks); the lab applies each on the stage
// so it cascades into [data-shift-home].
const SHIFT_KNOBS: readonly ThemeKnob[] = [
  {
    id: "base",
    label: "BASE",
    cssVar: "--shift-base-cqi",
    min: 0.5,
    max: 6,
    step: 0.1,
    default: 1.8,
  },
  {
    id: "min",
    label: "MIN",
    cssVar: "--shift-base-min",
    min: 8,
    max: 24,
    step: 1,
    default: 14,
    unit: "px",
  },
  {
    // Height-relative ceiling (cqh): base never exceeds CEIL% of the screen
    // height. Replaces the old fixed px MAX so the TV scales by width while a
    // wide-short frame stays capped by height. Higher = ceiling bites later.
    id: "ceil",
    label: "CEIL",
    cssVar: "--shift-base-cqh",
    min: 1,
    max: 12,
    step: 0.1,
    default: 4,
    // Far-right of the slider = ∞: writes `infinity`, disabling the height
    // ceiling entirely (pure width-driven base).
    infinityAtMax: true,
  },
  {
    id: "ratio",
    label: "RATIO",
    cssVar: "--shift-type-ratio",
    min: 1.1,
    max: 1.6,
    step: 0.01,
    default: 1.44,
  },
  {
    id: "space",
    label: "SPACE",
    cssVar: "--shift-space-unit",
    min: 0.2,
    max: 1.2,
    step: 0.05,
    default: 0.2,
    unit: "em",
  },
]

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

// ── Real-media prototype catalog ──────────────────────────────────────────
// Every Shift lab screen renders real games with SteamGridDB art (see
// dev-game-media). Play state is synthesised per entry so the chips/stats vary
// across the rail without a backend.
const minutesAgo = (n: number): Date => new Date(Date.now() - n * 60_000)

function syntheticUserData(index: number): {
  lastPlayed?: Date
  playtime?: number
  favorite?: boolean
} {
  const recentMinutes = [12, 95, 300, 1560, 3000, 60 * 24 * 3]
  const recent = recentMinutes[index]
  return {
    lastPlayed: recent === undefined ? undefined : minutesAgo(recent),
    playtime: index < 9 ? (index + 1) * 180 + 40 : undefined,
    favorite: index % 4 === 0,
  }
}

function relativeLastPlayed(date: Date | undefined): string | undefined {
  if (!date) return undefined
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

function playtimeLabel(minutes: number | undefined): string | undefined {
  if (!minutes) return undefined
  if (minutes < 60) return `${minutes}m`
  return `${(minutes / 60).toFixed(1)}h`
}

const DEV_GAMES = DEV_GAME_MEDIA.map((media, index) => ({
  media,
  userData: syntheticUserData(index),
}))

export const SHIFT_CINEMATIC_GAMES: readonly ShiftCinematicGame[] =
  DEV_GAMES.map(({ media, userData }) => ({
    id: media.id,
    title: media.title,
    tileArtUrl: media.gridUrl,
    wideArtUrl: media.heroUrl,
    genre: media.genre,
    developer: media.developer,
    lastPlayedLabel: relativeLastPlayed(userData.lastPlayed),
    playtimeLabel: playtimeLabel(userData.playtime),
    favorite: userData.favorite,
  }))

const SHIFT_DETAIL_GAMES: readonly ShiftGameDetailView[] = DEV_GAMES.map(
  ({ media, userData }) => ({
    id: media.id,
    title: media.title,
    artUrl: media.gridUrl,
    genre: media.genre,
    developer: media.developer,
    lastPlayedLabel: relativeLastPlayed(userData.lastPlayed),
    playtimeLabel: playtimeLabel(userData.playtime),
    favorite: userData.favorite,
  }),
)

const SHIFT_SCREENS: readonly Screen[] = [
  {
    id: "home",
    group: "Home",
    name: "Home",
    render: () => (
      <ShiftCinematicHome
        games={SHIFT_CINEMATIC_GAMES}
        time={PLACEHOLDER_TIME}
        avatarSrc={PLACEHOLDER_AVATAR_SRC}
      />
    ),
  },
  {
    id: "game-detail",
    group: "Detail",
    name: "Game Detail",
    render: () => <ShiftGameDetailScreen games={SHIFT_DETAIL_GAMES} />,
  },
]

export const shiftConfig: ThemeWorkshopConfig = {
  id: "shift",
  devices: SHIFT_DEVICES,
  knobs: SHIFT_KNOBS,
  defaultPxPerMm: SHIFT_DEFAULT_PX_PER_MM,
  screens: SHIFT_SCREENS,
  groups: ["Home", "Detail"],
}
