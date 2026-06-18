/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SESSION — the launch gate + foreground-session lifecycle. The
 * states Korri's launch-action-state and foreground-session FSM pass through:
 * launching, blocked, unknown-status, launch-failure, boot stepper, exit,
 * cooldown, recovery, crash. Composed from screens/kit.tsx; screen-specific
 * layout in screens/session.css (namespace pcSes-).
 */
import { PICO_BOOT_STEPS, PICO_FAILURE_KINDS, picoHero } from "../fixtures-extra"
import {
  Badge,
  Btn,
  Hero,
  PicoCart,
  Progress,
  Screen,
  Spinner,
  Title,
} from "./kit"

/** The four host-busy reasons the Blocked gate distinguishes. */
const BLOCK_REASONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: "preparing", label: "PREPARING STREAM" },
  { id: "running", label: "GAME RUNNING" },
  { id: "cooling", label: "COOLING DOWN" },
  { id: "recovering", label: "RECOVERING" },
]

export function LaunchingScreen() {
  return (
    <Screen title="PICO ▸ LAUNCH" hints={[{ key: "b", label: "CANCEL" }]} className="center">
      <div className="pcSes-launch">
        <div className="pc-art">
          <PicoCart game={picoHero} showFav={false} />
        </div>
        <Title size={1}>{picoHero.title}</Title>
        <div className="pcSes-launch-status">
          <Spinner />
          <span className="pc-sub">STARTING STREAM…</span>
        </div>
      </div>
    </Screen>
  )
}

export function BlockedScreen() {
  return (
    <Screen
      title="PICO ▸ LAUNCH"
      tone="alert"
      hints={[
        { key: "a", label: "WAIT" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph="⊘"
        glyphTone="bad"
        title="LAUNCH BLOCKED"
        message="Another game is using this host. You can launch once it frees up."
      >
        <div className="pcSes-reasons">
          {BLOCK_REASONS.map(reason => (
            <span
              key={reason.id}
              className={`pcSes-reason ${reason.id === "running" ? "active" : ""}`}
            >
              {reason.label}
            </span>
          ))}
        </div>
      </Hero>
    </Screen>
  )
}

export function UnknownStatusScreen() {
  return (
    <Screen
      title="PICO ▸ LAUNCH"
      hints={[
        { key: "a", label: "LAUNCH" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph="?"
        glyphTone="info"
        title="STATUS UNKNOWN"
        message="Session status unknown; launch still allowed. We couldn't reach the host to confirm it's free."
      >
        <Badge tone="info">UNKNOWN</Badge>
        <Btn kind="primary">▶ LAUNCH ANYWAY</Btn>
      </Hero>
    </Screen>
  )
}

export function LaunchFailureScreen() {
  return (
    <Screen
      title="PICO ▸ LAUNCH"
      tone="alert"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "BACK" },
      ]}
    >
      <div className="pcSes-fail-banner">
        <span className="pcSes-fail-banner-ico">✕</span>
        <span className="pcSes-fail-banner-text">
          <b>STREAM FAILED</b>
          Moonlight could not start or connect. Retry, or play locally.
        </span>
        <Btn kind="danger">↻ RETRY</Btn>
      </div>
      <div className="pcSes-fail-list pc-fill">
        {PICO_FAILURE_KINDS.map(failure => (
          <span
            key={failure.kind}
            className={`pcSes-fail ${failure.kind === "moonlight-failed" ? "active" : ""}`}
          >
            <b className="pcSes-fail-title">{failure.title}</b>
            <span className="pcSes-fail-detail">{failure.detail}</span>
          </span>
        ))}
      </div>
    </Screen>
  )
}

export function BootSequenceScreen() {
  return (
    <Screen title="PICO ▸ SESSION" hints={[{ key: "b", label: "CANCEL" }]} className="center">
      <div className="pcSes-boot">
        <Title size={1}>BRINGING UP SESSION</Title>
        <ol className="pcSes-steps">
          {PICO_BOOT_STEPS.map((step, index) => {
            const state = index < 2 ? "done" : index === 2 ? "active" : "pending"
            return (
              <li key={step} className={`pcSes-step ${state}`}>
                <span className="pcSes-step-mark">
                  {state === "done" ? "✓" : state === "active" ? <Spinner /> : "·"}
                </span>
                <span className="pcSes-step-label">{step}</span>
              </li>
            )
          })}
        </ol>
        <div className="pcSes-boot-bar">
          <Progress pct={66} />
          <div className="pc-dim">FOREGROUNDING · 2 / 4</div>
        </div>
      </div>
    </Screen>
  )
}

export function ExitingScreen() {
  return (
    <Screen title="PICO ▸ SESSION" hints={[{ key: "b", label: "FORCE QUIT" }]} className="center">
      <Hero
        title="EXITING…"
        message="Saving & tearing down. VerifyingReady → IdleReady. The host will be free in a moment."
        spinner
      >
        <Badge tone="info">VERIFYING READY</Badge>
      </Hero>
    </Screen>
  )
}

export function CoolingScreen() {
  return (
    <Screen title="PICO ▸ SESSION" hints={[{ key: "a", label: "DISMISS" }]} className="center">
      <Hero
        glyph="❄"
        glyphTone="info"
        title="COOLING DOWN"
        message="The host is cooling before the next launch. This keeps streams stable."
      >
        <div className="pcSes-countdown">READY IN 0:08</div>
      </Hero>
    </Screen>
  )
}

export function RecoveryScreen() {
  return (
    <Screen title="PICO ▸ SESSION" hints={[{ key: "b", label: "CANCEL" }]} className="center">
      <Hero
        glyph="↻"
        glyphTone="accent"
        title="RECOVERING SESSION"
        message="The previous session crashed; restoring a clean state before we try again."
        spinner
      >
        <Badge tone="bad">FAILED → RECOVERING</Badge>
      </Hero>
    </Screen>
  )
}

export function CrashScreen() {
  return (
    <Screen
      title="PICO ▸ SESSION"
      tone="alert"
      hints={[
        { key: "a", label: "RETRY" },
        { key: "b", label: "BACK" },
      ]}
      className="center"
    >
      <Hero
        glyph="✕"
        glyphTone="bad"
        title="GAME CRASHED"
        message="The game exited unexpectedly during teardown. Your saves are safe."
      >
        <div className="pcSes-stage">
          <span className="pcSes-stage-k">STAGE</span>
          <span className="pcSes-stage-v">exit</span>
          <span className="pcSes-stage-k">CODE</span>
          <span className="pcSes-stage-v">139</span>
        </div>
        <Btn kind="primary">↻ RETRY</Btn>
        <Btn>BACK</Btn>
      </Hero>
    </Screen>
  )
}
