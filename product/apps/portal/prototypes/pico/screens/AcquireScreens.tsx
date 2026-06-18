/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: ACQUIRE — the download-resolution + install lifecycle. Confirm
 * a FinalDownload, watch it run, handle a NonFinalDownload that needs the
 * browser, fail, prepare a runtime, land installed, update, and repair. Mirrors
 * Korri's download-resolution + install states. Composed from screens/kit.tsx;
 * screen-specific layout in screens/acquire.css (namespace pcAcq-).
 */
import { picoGames } from "../fixtures"
import { picoHero, picoReleases, PICO_RUNTIMES } from "../fixtures-extra"
import {
  Badge,
  Btn,
  Card,
  Hero,
  PicoCart,
  PicoIcon,
  Progress,
  Screen,
  Spinner,
  Stat,
  Sub,
  Title,
} from "./kit"

const target = picoGames[2] ?? picoHero
const fexRelease = picoReleases.find(release => release.runtime === "FEX")

const INSTALL_STEPS: readonly {
  readonly label: string
  readonly state: string
}[] = [
  { label: "FETCH", state: "done" },
  { label: "VERIFY", state: "done" },
  { label: "UNPACK", state: "done" },
  { label: `PREPARE ${PICO_RUNTIMES[0]} RUNTIME`, state: "active" },
  { label: "REGISTER", state: "pending" },
]

const REPAIR_FILES: readonly {
  readonly name: string
  readonly state: string
}[] = [
  { name: "game.exe", state: "ok" },
  { name: "data/assets.pak", state: "ok" },
  { name: "data/audio.bank", state: "repairing" },
  { name: "config/default.ini", state: "ok" },
  { name: "runtime/fex.cfg", state: "ok" },
]

export function DownloadConfirmScreen() {
  return (
    <Screen
      title="PICO ▸ DOWNLOAD"
      hints={[
        { key: "a", label: "DOWNLOAD" },
        { key: "b", label: "CANCEL" },
      ]}
      className="center"
    >
      <div className="pcAcq-confirm">
        <div className="pc-art">
          <PicoCart game={target} showFav={false} />
        </div>
        <div className="pcAcq-confirm-body">
          <Title size={1}>{target.title}</Title>
          <Sub>{target.genre}</Sub>
          <div className="pcAcq-meta">
            <Stat label="SIZE" value={fexRelease?.size ?? "104 MB"} />
            <Stat label="SOURCE" value="PORTMASTER" />
            <Stat label="RUNTIME" value={PICO_RUNTIMES[0]} />
          </div>
          <div className="pc-hero-actions">
            <Btn kind="primary" sel>
              <PicoIcon name="download" /> DOWNLOAD
            </Btn>
            <Btn>CANCEL</Btn>
          </div>
        </div>
      </div>
    </Screen>
  )
}

export function DownloadingScreen() {
  return (
    <Screen
      title="PICO ▸ DOWNLOAD"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcAcq-progress">
        <Spinner />
        <Title size={1}>DOWNLOADING</Title>
        <Sub>{target.title}</Sub>
        <Progress pct={62} />
        <div className="pcAcq-stats">
          <Stat label="DONE" value="154 / 248 MB" />
          <Stat label="SPEED" value="6.4 MB/s" />
          <Stat label="ETA" value="0:15" />
        </div>
        <Btn>CANCEL</Btn>
      </div>
    </Screen>
  )
}

export function OpenInBrowserScreen() {
  return (
    <Screen
      title="PICO ▸ DOWNLOAD"
      hints={[
        { key: "a", label: "OPEN" },
        { key: "b", label: "CANCEL" },
      ]}
      className="center"
    >
      <Hero
        glyph="↗"
        glyphTone="info"
        title="OPEN IN BROWSER"
        message="this one won't fetch itself — the provider wants you to kick it off by hand. pop the page open, then hop back here."
      >
        <Badge tone="info">REQUIRES USER ACTION</Badge>
        <Btn kind="primary" sel>
          ↗ OPEN IN BROWSER
        </Btn>
        <code className="pcAcq-url">
          https://portmaster.games/get/{target.id}
        </code>
      </Hero>
    </Screen>
  )
}

export function DownloadFailedScreen() {
  return (
    <Screen
      tone="alert"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "CANCEL" },
      ]}
      className="center"
    >
      <Hero
        glyph="⚠"
        glyphTone="bad"
        title="DOWNLOAD FAILED"
        message="the download tripped on the way home. we tossed the half-finished bits — check your connection and retry?"
      >
        <Badge tone="bad">NETWORK</Badge>
        <Btn kind="primary" sel>
          <PicoIcon name="restart" /> RETRY
        </Btn>
        <Btn>CANCEL</Btn>
      </Hero>
    </Screen>
  )
}

export function InstallingScreen() {
  return (
    <Screen
      title="PICO ▸ INSTALL"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcAcq-progress">
        <Spinner />
        <Title size={1}>INSTALLING</Title>
        <Sub>WARMING UP THE {PICO_RUNTIMES[0]} RUNTIME</Sub>
        <Card title="STEPS" className="pcAcq-checklist">
          {INSTALL_STEPS.map(step => (
            <div key={step.label} className={`pcAcq-step ${step.state}`}>
              <span className="pcAcq-step-mark">
                {step.state === "done" ? (
                  <PicoIcon name="check" />
                ) : step.state === "active" ? (
                  "▸"
                ) : (
                  "·"
                )}
              </span>
              <span className="pcAcq-step-label">{step.label}</span>
            </div>
          ))}
        </Card>
        <Progress pct={74} />
      </div>
    </Screen>
  )
}

export function InstalledScreen() {
  return (
    <Screen
      title="PICO ▸ INSTALL"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "OPTIONS" },
      ]}
      className="center"
    >
      <Hero
        glyph={<PicoIcon name="check" />}
        glyphTone="good"
        title="READY TO PLAY"
        message={`${target.title} is tucked in and ready — all set, go play! nothing launches on its own.`}
      >
        <Badge tone="good">INSTALLED</Badge>
        <Btn kind="primary" sel>
          <PicoIcon name="play" /> PLAY
        </Btn>
      </Hero>
    </Screen>
  )
}

export function UpdateAvailableScreen() {
  return (
    <Screen
      title="PICO ▸ UPDATE"
      hints={[
        { key: "a", label: "UPDATE" },
        { key: "b", label: "SKIP" },
      ]}
    >
      <div className="pcAcq-update">
        <Title size={1}>UPDATE AVAILABLE</Title>
        <Sub>{target.title}</Sub>
        <div className="pcAcq-versions">
          <Stat label="CURRENT" value="v1.3.0" />
          <span className="pcAcq-arrow">▸</span>
          <Stat label="NEW" value="v1.4.0" />
        </div>
        <Card title="CHANGELOG" className="pcAcq-changelog">
          <ul className="pcAcq-notes">
            <li>Fixed FEX crash on level 3 boss</li>
            <li>Added 60 Hz mode + rebindable pause</li>
            <li>Smaller install footprint</li>
          </ul>
        </Card>
        <div className="pc-hero-actions">
          <Btn kind="primary" sel>
            <PicoIcon name="download" /> UPDATE
          </Btn>
          <Btn>SKIP</Btn>
        </div>
      </div>
    </Screen>
  )
}

export function RepairScreen() {
  return (
    <Screen
      title="PICO ▸ REPAIR"
      hints={[{ key: "b", label: "CANCEL" }]}
      className="center"
    >
      <div className="pcAcq-progress">
        <Spinner />
        <Title size={1}>VERIFYING FILES</Title>
        <Sub>{target.title}</Sub>
        <Progress pct={80} />
        <div className="pc-dim">4 / 5 FILES VALIDATED</div>
        <Card title="FILES" className="pcAcq-checklist">
          {REPAIR_FILES.map(file => (
            <div key={file.name} className={`pcAcq-file ${file.state}`}>
              <span className="pcAcq-file-name">{file.name}</span>
              <Badge tone={file.state === "ok" ? "good" : "bad"}>
                {file.state === "ok" ? "OK" : "REPAIRING"}
              </Badge>
            </div>
          ))}
        </Card>
      </div>
    </Screen>
  )
}
