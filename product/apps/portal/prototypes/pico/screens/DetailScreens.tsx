/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: DETAIL — game-detail variants. The page you land on after
 * picking a game, in its many shapes: release picker, emulator chooser,
 * community stats, media gallery, not-installed. Composed from screens/kit.tsx;
 * screen-specific layout in screens/detail.css (namespace pcDet-).
 *
 * Data comes from PicoLibrary + PicoReleases/PicoStats via atoms (never a
 * fixture import). Each screen reads ONE combined atom (`AsyncResult.all`).
 */

import {
  picoCommunityStatsAtom,
  picoDetailGameAtom,
  picoEmulatorChooserAtom,
  picoMediaGalleryAtom,
  picoReleasePickerAtom,
} from "../data/pico-detail-atoms"
import { PicoData } from "./PicoData"
import {
  Badge,
  BlockBar,
  Btn,
  Card,
  Chip,
  List,
  PicoCart,
  PicoIcon,
  Row,
  Screen,
  Stat,
  Title,
} from "./kit"

export function ReleasePickerScreen() {
  return (
    <PicoData atom={picoReleasePickerAtom} title="PICO ▸ GAME">
      {({ game, releases }) => {
        if (!game) return null
        return (
          <Screen
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcDet-head">
              <div className="pc-art sm">
                <PicoCart game={game} showFav={false} />
              </div>
              <div className="pcDet-head-info">
                <Title size={1}>{game.title}</Title>
                <div className="pcDet-tags">
                  {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
                </div>
                <p className="pcDet-note">
                  This cart ships in a few flavors — pick the one you want to
                  boot.
                </p>
              </div>
            </div>
            <List>
              {releases.map(release => (
                <Row
                  key={release.id}
                  sel={release.recommended}
                  icon={release.recommended ? "▸" : " "}
                  label={release.app}
                  meta={`${release.system}${release.runtime ? ` · ${release.runtime}` : ""} · ${release.size}`}
                  trailing={
                    release.installed ? (
                      <Badge tone="good">INSTALLED</Badge>
                    ) : (
                      <Badge>GET</Badge>
                    )
                  }
                />
              ))}
            </List>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function EmulatorChooserScreen() {
  return (
    <PicoData atom={picoEmulatorChooserAtom} title="PICO ▸ GAME">
      {({ game, appChoices }) => {
        if (!game) return null
        return (
          <Screen
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "USE" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcDet-head">
              <div className="pc-art sm">
                <PicoCart game={game} showFav={false} />
              </div>
              <div className="pcDet-head-info">
                <Title size={1}>{game.title}</Title>
                <div className="pcDet-tags">CHOOSE EMULATOR · GBA</div>
                <p className="pcDet-note">
                  A few cores know how to run this one — pick who drives.
                </p>
              </div>
            </div>
            <div className="pcDet-choices">
              {appChoices.map((choice, index) => (
                <Card
                  key={choice.id}
                  title={choice.name}
                  className={`pcDet-choice ${index === 0 ? "sel" : ""}`}
                >
                  <div className="pcDet-choice-meta">
                    <Chip>{choice.runtime}</Chip>
                    {index === 0 ? <Badge tone="accent">PICK</Badge> : null}
                  </div>
                  <span className="pc-dim">{choice.note}</span>
                </Card>
              ))}
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function CommunityStatsScreen() {
  return (
    <PicoData atom={picoCommunityStatsAtom} title="PICO ▸ GAME">
      {({ game, stats }) => {
        if (!game) return null
        const liked = Math.round(
          (stats.likes / (stats.likes + stats.dislikes)) * 100,
        )
        return (
          <Screen
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcDet-head">
              <div className="pc-art sm">
                <PicoCart game={game} showFav={false} />
              </div>
              <div className="pcDet-head-info">
                <Title size={1}>{game.title}</Title>
                <div className="pcDet-tags">COMMUNITY · PORTMASTER</div>
                <div className="pcDet-chips">
                  <Chip>FANGAME</Chip>
                  <Chip>CO-OP</Chip>
                  <Chip>CONTROLLER</Chip>
                </div>
              </div>
            </div>
            <div className="pcDet-stats">
              <Stat label="PLAYS" value={stats.plays.toLocaleString()} />
              <Stat label="LIKES" value={stats.likes.toLocaleString()} />
              <Stat label="DISLIKES" value={stats.dislikes} />
              <Stat label="SCORE" value={stats.score} />
              <Stat label="LIKED" value={`${liked}%`} />
            </div>
            <Card title="DIFFICULTY" className="pcDet-diff">
              <div className="pcDet-diff-row">
                <BlockBar level={stats.difficulty} max={10} />
                <span className="pc-dim">{stats.difficulty} / 10</span>
              </div>
            </Card>
          </Screen>
        )
      }}
    </PicoData>
  )
}

export function MediaGalleryScreen() {
  return (
    <PicoData atom={picoMediaGalleryAtom} title="PICO ▸ GAME">
      {({ game, games }) => {
        if (!game) return null
        return (
          <Screen
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "PLAY" },
              { key: "y", label: "NEXT" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcDet-gallery">
              <div className="pcDet-shot">
                <div className="pcDet-shot-art">
                  <PicoCart game={game} showFav={false} />
                </div>
                <div className="pcDet-shot-cap">
                  <Title size={-1}>{game.title}</Title>
                  <span className="pc-dim">SCREENSHOT 2 / 5 · WORLD 1-1</span>
                </div>
              </div>
              <div className="pcDet-strip">
                {games.slice(0, 5).map((shot, index) => (
                  <div
                    key={shot.id}
                    className={`pc-art sm pcDet-thumb ${index === 1 ? "sel" : ""}`}
                  >
                    <PicoCart game={shot} showFav={false} />
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

export function NotInstalledScreen() {
  return (
    <PicoData atom={picoDetailGameAtom} title="PICO ▸ GAME">
      {game => {
        if (!game) return null
        return (
          <Screen
            title="PICO ▸ GAME"
            hints={[
              { key: "a", label: "DOWNLOAD" },
              { key: "b", label: "BACK" },
            ]}
          >
            <div className="pcDet-head">
              <div className="pc-art sm pcDet-dim">
                <PicoCart game={game} showFav={false} />
              </div>
              <div className="pcDet-head-info">
                <Title size={1}>{game.title}</Title>
                <div className="pcDet-tags">
                  {game.genre.toUpperCase()} · {game.developer.toUpperCase()}
                </div>
                <div className="pcDet-chips">
                  <Badge tone="info">NOT INSTALLED</Badge>
                  <Chip>104 MB</Chip>
                </div>
                <p className="pcDet-note">
                  You don't own this cart yet — grab it and it's good to go.
                </p>
              </div>
            </div>
            <div className="pcDet-actions">
              <Btn kind="primary" sel>
                <PicoIcon name="download" /> DOWNLOAD
              </Btn>
              <Btn>DETAILS</Btn>
            </div>
          </Screen>
        )
      }}
    </PicoData>
  )
}
