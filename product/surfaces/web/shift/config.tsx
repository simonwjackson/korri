/**
 * Shift — theme-workshop config (device-lab wiring).
 *
 * Surface #1 / the reference consumer of @korri/intrinsic-design. This module
 * exports data only: the device roster, the generator knobs (which write the
 * --shift-* indirection vars shift.css reads), and a fixture-backed screen
 * catalog. The workshop app imports `shiftConfig` and mounts it; Shift depends
 * on the workshop's *types* alone, never its runtime (mirrors pico/config.tsx).
 *
 * Shift's CSS is scoped under [data-shift-home] (created by ShiftHomeRoot), and
 * that element carries the `intrinsic` class, so the recipe re-derives the whole
 * scale against the device frame the lab renders it inside. The knob sliders
 * drive --shift-base-* / --shift-type-ratio / --shift-space-unit; TEXT / PAD use
 * the scaleVarPrefix ("shift") so the lab publishes --shift-text-scale /
 * --shift-pad-scale, which shift.css reads with a default of 1.
 */
import { games } from "@platform/fixtures/games/games"
import type {
  DeviceConfig,
  Screen,
  ThemeKnob,
  ThemeWorkshopConfig,
} from "@tools/theme-workshop"
import { ShiftHomeCaption } from "./molecules/ShiftHomeCaption"
import { ShiftHomeBottomBar } from "./organisms/ShiftHomeBottomBar"
import { ShiftHomeRail } from "./organisms/ShiftHomeRail"
import { ShiftHomeTopBar } from "./organisms/ShiftHomeTopBar"
import {
  type ShiftCinematicGame,
  ShiftCinematicHome,
} from "./pages/ShiftCinematicHome"
import {
  ShiftGameDetailScreen,
  type ShiftGameDetailView,
} from "./pages/ShiftGameDetailScreen"
import { ShiftHomeRoot } from "./templates/ShiftHomeRoot"
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
    textPct: 100,
    padPct: 100,
  },
  {
    id: "thor",
    name: "THOR",
    widthMm: 132,
    heightMm: 76,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "odin2portal",
    name: "ODIN 2 PORTAL",
    widthMm: 156,
    heightMm: 85,
    textPct: 100,
    padPct: 100,
  },
  {
    id: "tv65",
    name: '65" 4K TV',
    widthMm: 1439,
    heightMm: 809,
    textPct: 100,
    padPct: 100,
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
    default: 2.4,
  },
  {
    id: "min",
    label: "MIN",
    cssVar: "--shift-base-min",
    min: 8,
    max: 24,
    step: 1,
    default: 13,
    unit: "px",
  },
  {
    id: "max",
    label: "MAX",
    cssVar: "--shift-base-max",
    min: 14,
    max: 48,
    step: 1,
    default: 22,
    unit: "px",
  },
  {
    id: "ratio",
    label: "RATIO",
    cssVar: "--shift-type-ratio",
    min: 1.1,
    max: 1.6,
    step: 0.01,
    default: 1.25,
  },
  {
    id: "space",
    label: "SPACE",
    cssVar: "--shift-space-unit",
    min: 0.2,
    max: 1.2,
    step: 0.05,
    default: 0.5,
    unit: "em",
  },
]

const PLACEHOLDER_TIME = "4:24 PM"
const PLACEHOLDER_AVATAR_SRC = "https://i.pravatar.cc/96?u=korri-shift-user"

// Fixture-backed home composition. Mirrors ShiftHomeReadyBody's layout without
// the catalog/launch atom machinery — the device-lab is backend-free. The home
// organisms read state from ShiftHomeRoot's context; useInputAction safely
// no-ops when no spatial-navigation bus is running.
function ShiftHomeLabScreen() {
  return (
    <ShiftHomeRoot items={games}>
      <ShiftHomeTopBar
        time={PLACEHOLDER_TIME}
        avatarSrc={PLACEHOLDER_AVATAR_SRC}
      />
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-[var(--shift-space-1)]">
        <ShiftHomeRail />
        <ShiftHomeCaption />
      </div>
      <ShiftHomeBottomBar />
    </ShiftHomeRoot>
  )
}

// ── Game Detail fixtures ──────────────────────────────────────────────────
// The detail page takes a flat view model (decoupled from library wiring); the
// lab maps the shared game fixtures into it. Art reuses Shift's deterministic
// fixture-art seed (the home feature tile builds wide art the same way), here
// in a 3:4 poster crop for the portrait art card.
function detailArtUrl(id: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(`shift-${id}-poster`)}/900/1200`
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

const cineTileUrl = (id: string): string =>
  `https://picsum.photos/seed/${encodeURIComponent(`shift-${id}`)}/600/600`
const cineWideUrl = (id: string): string =>
  `https://picsum.photos/seed/${encodeURIComponent(`shift-${id}-wide`)}/1600/900`

const SHIFT_CINEMATIC_GAMES: readonly ShiftCinematicGame[] = games.map(
  game => ({
    id: game.id,
    title: game.metadata?.name ?? game.id,
    tileArtUrl: cineTileUrl(game.id),
    wideArtUrl: cineWideUrl(game.id),
    genre: game.metadata?.genre?.[0],
    developer: game.metadata?.developer,
    lastPlayedLabel: relativeLastPlayed(game.userData?.lastPlayed),
    playtimeLabel: playtimeLabel(game.userData?.playtime),
    favorite: game.userData?.favorite,
  }),
)

const SHIFT_DETAIL_GAMES: readonly ShiftGameDetailView[] = games.map(game => ({
  id: game.id,
  title: game.metadata?.name ?? game.id,
  artUrl: detailArtUrl(game.id),
  genre: game.metadata?.genre?.[0],
  developer: game.metadata?.developer,
  lastPlayedLabel: relativeLastPlayed(game.userData?.lastPlayed),
  playtimeLabel: playtimeLabel(game.userData?.playtime),
  favorite: game.userData?.favorite,
}))

const SHIFT_SCREENS: readonly Screen[] = [
  {
    id: "home-cinematic",
    group: "Home",
    name: "Home · Cinematic",
    render: () => (
      <ShiftCinematicHome
        games={SHIFT_CINEMATIC_GAMES}
        time={PLACEHOLDER_TIME}
        avatarSrc={PLACEHOLDER_AVATAR_SRC}
      />
    ),
  },
  {
    id: "home",
    group: "Home",
    name: "Home",
    render: () => <ShiftHomeLabScreen />,
  },
  {
    id: "game-detail",
    group: "Detail",
    name: "Game Detail",
    render: () => <ShiftGameDetailScreen games={SHIFT_DETAIL_GAMES} />,
  },
]

// Identity prototypes. Each is the SAME devices/knobs/screens re-skinned by a
// token-set selected via [data-shift-identity] (set here through rootProps; the
// overrides live in shift.css). Switch between them in the lab's theme switcher.
// Production ships the base identity (no attribute), so these are lab-only.
function makeShiftConfig(
  identity: "cozy" | "premium" | "art" | "bold",
): ThemeWorkshopConfig {
  return {
    id: `shift · ${identity}`,
    devices: SHIFT_DEVICES,
    knobs: SHIFT_KNOBS,
    defaultPxPerMm: SHIFT_DEFAULT_PX_PER_MM,
    // Lab publishes --shift-text-scale / --shift-pad-scale; shift.css reads them.
    scaleVarPrefix: "shift",
    screens: SHIFT_SCREENS,
    groups: ["Home", "Detail"],
    // Cascades into the surface so [data-shift-identity="…"] token overrides win.
    rootProps: { "data-shift-identity": identity },
  }
}

export const shiftCozyConfig = makeShiftConfig("cozy")
export const shiftPremiumConfig = makeShiftConfig("premium")
export const shiftArtConfig = makeShiftConfig("art")
export const shiftBoldConfig = makeShiftConfig("bold")
