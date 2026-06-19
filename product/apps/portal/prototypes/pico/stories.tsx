/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * A starter set of component stories for the workshop's "parts" (component
 * catalog) view — atoms → molecules → organisms → templates. Each story renders
 * a component (or a row of variants) in isolation; the workshop frames it in the
 * pico screen scope so tokens + skin resolve. Grow coverage incrementally.
 */
import type { Story } from "@tools/theme-workshop"
import { picoGames } from "./fixtures"
import { Badge, Btn, Spinner, Stat } from "./screens/kit"
import { Title } from "./ui/atoms/Title"
import { DetailHead } from "./ui/molecules/DetailHead"
import { GameCart } from "./ui/molecules/GameCart"
import { HostBadge } from "./ui/molecules/HostBadge"
import { PlayCta } from "./ui/molecules/PlayCta"
import { QualityBar } from "./ui/molecules/QualityBar"
import { SettingRow } from "./ui/molecules/SettingRow"
import { CoverflowRail } from "./ui/organisms/CoverflowRail"
import { HudOverlay } from "./ui/organisms/HudOverlay"
import { LibraryRail } from "./ui/organisms/LibraryRail"
import { GameOverlay } from "./ui/templates/GameOverlay"
import { ScreenShell } from "./ui/templates/ScreenShell"

const rail = picoGames.slice(0, 5)
const hero = picoGames[0]

export const PICO_STORIES: readonly Story[] = [
  // ── Atoms ──────────────────────────────────────────────────────────────
  {
    id: "title",
    layer: "atom",
    name: "Title",
    note: "size -1 / 0 / 1",
    render: () => (
      <>
        <Title size={-1}>SMALL</Title>
        <Title size={0}>BASE</Title>
        <Title size={1}>BIG</Title>
      </>
    ),
  },
  {
    id: "btn",
    layer: "atom",
    name: "Button",
    note: "default / primary / danger",
    render: () => (
      <>
        <Btn>PLAIN</Btn> <Btn kind="primary">PLAY</Btn>{" "}
        <Btn kind="danger">QUIT</Btn>
      </>
    ),
  },
  {
    id: "badge",
    layer: "atom",
    name: "Badge",
    render: () => (
      <>
        <Badge tone="accent">NEW</Badge> <Badge tone="good">OK</Badge>{" "}
        <Badge tone="bad">FAIL</Badge> <Badge tone="info">INFO</Badge>
      </>
    ),
  },
  {
    id: "stat",
    layer: "atom",
    name: "Stat",
    render: () => <Stat label="PLAYS" value="12,480" />,
  },
  { id: "spinner", layer: "atom", name: "Spinner", render: () => <Spinner /> },

  // ── Molecules ──────────────────────────────────────────────────────────
  {
    id: "gamecart",
    layer: "molecule",
    name: "GameCart",
    render: () =>
      hero ? (
        <div className="pc-art sm">
          <GameCart game={hero} />
        </div>
      ) : null,
  },
  {
    id: "playcta",
    layer: "molecule",
    name: "PlayCta",
    render: () => <PlayCta label="CONTINUE" className="pcShow-play" />,
  },
  {
    id: "qualitybar",
    layer: "molecule",
    name: "QualityBar",
    render: () => (
      <>
        <QualityBar level={4} tone="good" tag="GOOD" />
        <QualityBar level={2} tone="drop" tag="DROPPING" />
      </>
    ),
  },
  {
    id: "hostbadge",
    layer: "molecule",
    name: "HostBadge",
    render: () => (
      <>
        <HostBadge status="online" /> <HostBadge status="busy" />{" "}
        <HostBadge status="paired" /> <HostBadge status="offline" />
      </>
    ),
  },
  {
    id: "settingrow",
    layer: "molecule",
    name: "SettingRow",
    render: () => (
      <div className="pcSet-list">
        <SettingRow label="Scanlines" sel>
          <Badge tone="good">ON</Badge>
        </SettingRow>
        <SettingRow label="Aspect">
          <span className="pcSet-info">4:3</span>
        </SettingRow>
      </div>
    ),
  },

  // ── Organisms ──────────────────────────────────────────────────────────
  {
    id: "coverflowrail",
    layer: "organism",
    name: "CoverflowRail",
    render: () => <CoverflowRail games={rail} activeIndex={2} />,
  },
  {
    id: "libraryrail",
    layer: "organism",
    name: "LibraryRail",
    render: () => <LibraryRail games={rail} focusedIndex={2} />,
  },
  {
    id: "hudoverlay",
    layer: "organism",
    name: "HudOverlay",
    surface: true, // absolutely-positioned corners — needs a sized framed canvas
    render: () => <HudOverlay />,
  },
  {
    id: "detailhead",
    layer: "molecule",
    name: "DetailHead",
    render: () =>
      hero ? (
        <DetailHead game={hero} tags={`${hero.genre} · ${hero.developer}`}>
          <p className="pcDet-note">A reusable detail header.</p>
        </DetailHead>
      ) : null,
  },

  // ── Templates ──────────────────────────────────────────────────────────
  {
    id: "screenshell",
    layer: "template",
    name: "ScreenShell",
    note: "statusbar + main + hints",
    render: () => (
      <ScreenShell
        title="PICO ▸ SHELL"
        hints={[{ key: "a", label: "OK" }, { key: "b", label: "BACK" }]}
      >
        <div className="pc-dim">page content goes here</div>
      </ScreenShell>
    ),
  },
  {
    id: "gameoverlay",
    layer: "template",
    name: "GameOverlay",
    note: "dimmed game backdrop",
    render: () => (
      <GameOverlay>
        <div className="pcIg-attempt">overlay content</div>
      </GameOverlay>
    ),
  },
]
