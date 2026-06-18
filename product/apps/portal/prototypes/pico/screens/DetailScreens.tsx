/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: DETAIL — game-detail variants. The page you land on after
 * picking a game, in its many shapes: release picker, emulator chooser,
 * community stats, media gallery, not-installed. Composed from screens/kit.tsx;
 * screen-specific layout in screens/detail.css (namespace pcDet-).
 */
import {
  Badge,
  BlockBar,
  Btn,
  Card,
  Chip,
  List,
  PicoCart,
  Row,
  Screen,
  Stat,
  Title,
} from "./kit"
import { picoGames } from "../fixtures"
import { picoAppChoices, picoReleases, picoStats } from "../fixtures-extra"

// A representative game for every detail screen (matches Variant D's pick).
const game = picoGames[1] ?? picoGames[0]

export function ReleasePickerScreen() {
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
            This game has multiple launchable releases — pick one.
          </p>
        </div>
      </div>
      <List>
        {picoReleases.map(release => (
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
}

export function EmulatorChooserScreen() {
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
            Multiple cores can run this release — pick which one launches.
          </p>
        </div>
      </div>
      <div className="pcDet-choices">
        {picoAppChoices.map((choice, index) => (
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
}

export function CommunityStatsScreen() {
  if (!game) return null
  const liked = Math.round(
    (picoStats.likes / (picoStats.likes + picoStats.dislikes)) * 100,
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
        <Stat label="PLAYS" value={picoStats.plays.toLocaleString()} />
        <Stat label="LIKES" value={picoStats.likes.toLocaleString()} />
        <Stat label="DISLIKES" value={picoStats.dislikes} />
        <Stat label="SCORE" value={picoStats.score} />
        <Stat label="LIKED" value={`${liked}%`} />
      </div>
      <Card title="DIFFICULTY" className="pcDet-diff">
        <div className="pcDet-diff-row">
          <BlockBar level={picoStats.difficulty} max={10} />
          <span className="pc-dim">{picoStats.difficulty} / 10</span>
        </div>
      </Card>
    </Screen>
  )
}

export function MediaGalleryScreen() {
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
          {picoGames.slice(0, 5).map((shot, index) => (
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
}

export function NotInstalledScreen() {
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
            This game must be acquired before it can launch.
          </p>
        </div>
      </div>
      <div className="pcDet-actions">
        <Btn kind="primary" sel>
          ⬇ DOWNLOAD
        </Btn>
        <Btn>DETAILS</Btn>
      </div>
    </Screen>
  )
}
