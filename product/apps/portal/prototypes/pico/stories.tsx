/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Component stories for the workshop's "parts" (component catalog) view — atoms
 * → molecules → organisms → templates. Each story renders a component (or a row
 * of variants) in isolation; the workshop frames it in the pico screen scope so
 * tokens + skin resolve. Grow coverage incrementally.
 */
import type { Story } from "@tools/theme-workshop"
import { picoGames } from "./fixtures"
import { picoPlayers } from "./fixtures-extra"
import { Badge } from "./ui/atoms/Badge"
import { BlockBar } from "./ui/atoms/BlockBar"
import { Btn } from "./ui/atoms/Btn"
import { Chip } from "./ui/atoms/Chip"
import { Dim } from "./ui/atoms/Dim"
import { Glyph } from "./ui/atoms/Glyph"
import { Progress } from "./ui/atoms/Progress"
import { Spinner } from "./ui/atoms/Spinner"
import { Stat } from "./ui/atoms/Stat"
import { Sub } from "./ui/atoms/Sub"
import { Title } from "./ui/atoms/Title"
import { Toggle } from "./ui/atoms/Toggle"
import { Card } from "./ui/molecules/Card"
import { DetailHead } from "./ui/molecules/DetailHead"
import { GameCart } from "./ui/molecules/GameCart"
import { HostBadge } from "./ui/molecules/HostBadge"
import { List } from "./ui/molecules/List"
import { Opt } from "./ui/molecules/Opt"
import { PlayCta } from "./ui/molecules/PlayCta"
import { Player } from "./ui/molecules/Player"
import { QualityBar } from "./ui/molecules/QualityBar"
import { Row } from "./ui/molecules/Row"
import { SettingRow } from "./ui/molecules/SettingRow"
import { Tabs } from "./ui/molecules/Tabs"
import { ControlCenter } from "./ui/organisms/ControlCenter"
import { CoverflowRail } from "./ui/organisms/CoverflowRail"
import { FiltersPanel } from "./ui/organisms/FiltersPanel"
import { FriendsPanel } from "./ui/organisms/FriendsPanel"
import { Hero } from "./ui/organisms/Hero"
import { HudOverlay } from "./ui/organisms/HudOverlay"
import { LibraryRail } from "./ui/organisms/LibraryRail"
import { MiniHome } from "./ui/organisms/MiniHome"
import { Modal } from "./ui/organisms/Modal"
import { MomentHero } from "./ui/organisms/MomentHero"
import { QuickLook } from "./ui/organisms/QuickLook"
import { RunningGame } from "./ui/organisms/RunningGame"
import { SessionDock } from "./ui/organisms/SessionDock"
import { GameOverlay } from "./ui/templates/GameOverlay"
import { PanelScreen } from "./ui/templates/PanelScreen"
import { ScreenShell } from "./ui/templates/ScreenShell"

const rail = picoGames.slice(0, 5)
const hero = picoGames[0]
const players = picoPlayers.slice(0, 2)

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
  {
    id: "sub",
    layer: "atom",
    name: "Sub",
    render: () => <Sub>SECONDARY CAPTION LINE</Sub>,
  },
  {
    id: "dim",
    layer: "atom",
    name: "Dim",
    render: () => <Dim>dimmed inline text</Dim>,
  },
  {
    id: "chip",
    layer: "atom",
    name: "Chip",
    render: () => (
      <>
        <Chip>ACTION</Chip> <Chip>PUZZLE</Chip> <Chip>CO-OP</Chip>
      </>
    ),
  },
  {
    id: "glyph",
    layer: "atom",
    name: "Glyph",
    note: "good / bad / info",
    render: () => (
      <>
        <Glyph tone="good">✓</Glyph>
        <Glyph tone="bad">✕</Glyph>
        <Glyph tone="info">⚠</Glyph>
      </>
    ),
  },
  {
    id: "blockbar",
    layer: "atom",
    name: "BlockBar",
    render: () => <BlockBar level={7} max={10} />,
  },
  {
    id: "toggle",
    layer: "atom",
    name: "Toggle",
    render: () => (
      <>
        <Toggle on /> <Toggle on={false} />
      </>
    ),
  },
  {
    id: "progress",
    layer: "atom",
    name: "Progress",
    render: () => (
      <div style={{ width: "16ch" }}>
        <Progress pct={68} />
      </div>
    ),
  },

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
  {
    id: "listrow",
    layer: "molecule",
    name: "List + Row",
    render: () => (
      <List>
        <Row label="Continue" meta="68% · City of Tears" trailing="▸" sel />
        <Row label="Library" meta="142 games" />
        <Row label="Settings" />
      </List>
    ),
  },
  {
    id: "card",
    layer: "molecule",
    name: "Card",
    render: () => (
      <Card title="STORAGE">
        <Dim>card body content</Dim>
      </Card>
    ),
  },
  {
    id: "opt",
    layer: "molecule",
    name: "Opt",
    render: () => <Opt value="RECENT" />,
  },
  {
    id: "tabs",
    layer: "molecule",
    name: "Tabs",
    render: () => <Tabs items={["ALL", "FAVORITES", "RECENT"]} sel={0} />,
  },
  {
    id: "player",
    layer: "molecule",
    name: "Player",
    note: "mascot / tag rep",
    render: () => (
      <>
        {players[0] ? <Player player={players[0]} /> : null}
        {players[1] ? <Player player={players[1]} rep="tag" /> : null}
      </>
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
    id: "minihome",
    layer: "organism",
    name: "MiniHome",
    render: () => <MiniHome games={rail} focusIndex={1} />,
  },
  {
    id: "controlcenter",
    layer: "organism",
    name: "ControlCenter",
    render: () => <ControlCenter />,
  },
  {
    id: "quicklook",
    layer: "organism",
    name: "QuickLook",
    render: () => (hero ? <QuickLook game={hero} /> : null),
  },
  {
    id: "friendspanel",
    layer: "organism",
    name: "FriendsPanel",
    render: () => <FriendsPanel />,
  },
  {
    id: "filterspanel",
    layer: "organism",
    name: "FiltersPanel",
    render: () => <FiltersPanel />,
  },
  {
    id: "sessiondock",
    layer: "organism",
    name: "SessionDock",
    render: () => <SessionDock />,
  },
  {
    id: "hero",
    layer: "organism",
    name: "Hero",
    surface: true, // centered full-state column — reads best in a framed canvas
    render: () => (
      <Hero
        glyph="✓"
        glyphTone="good"
        title="ALL DONE"
        message="a reusable centered state for loading / error / empty / confirm."
      >
        <Btn kind="primary" sel>
          CONTINUE
        </Btn>
      </Hero>
    ),
  },
  {
    id: "momenthero",
    layer: "organism",
    name: "MomentHero",
    surface: true, // renders a full ScreenShell
    render: () =>
      hero ? (
        <MomentHero
          statusTitle="PICO ▸ RESUME"
          hints={[
            { key: "a", label: "CONTINUE" },
            { key: "b", label: "BACK" },
          ]}
          game={hero}
          kicker="▸ RIGHT WHERE YOU LEFT OFF"
        >
          <div className="pcM-meta">68% · CITY OF TEARS</div>
        </MomentHero>
      ) : null,
  },
  {
    id: "runninggame",
    layer: "organism",
    name: "RunningGame",
    surface: true, // full-bleed stage backdrop
    render: () => (hero ? <RunningGame game={hero} /> : null),
  },
  {
    id: "modal",
    layer: "organism",
    name: "Modal",
    surface: true, // full overlay over a dimmed game backdrop
    render: () => (
      <Modal
        title="QUIT TO LIBRARY?"
        hints={[
          { key: "a", label: "QUIT" },
          { key: "b", label: "CANCEL" },
        ]}
      >
        <Dim>unsaved progress will be lost.</Dim>
      </Modal>
    ),
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
        hints={[
          { key: "a", label: "OK" },
          { key: "b", label: "BACK" },
        ]}
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
  {
    id: "panelscreen",
    layer: "template",
    name: "PanelScreen",
    note: "push-drawer shell",
    render: () => (
      <PanelScreen
        title="PICO ▸ QUICK MENU"
        hints={[
          { key: "a", label: "SELECT" },
          { key: "b", label: "CLOSE" },
        ]}
        side="right"
        panelTitle="CONTROL CENTER"
        main={<MiniHome games={rail} />}
        panel={<ControlCenter />}
      />
    ),
  },
]
