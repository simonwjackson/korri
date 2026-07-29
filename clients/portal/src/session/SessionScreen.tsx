import { useEffect, useState } from "react"
import type { StreamStageId } from "@contracts/bridge/korri-native-bridge"
import type { SessionLifecycleAdapter } from "./lifecycle-adapter"
import {
  FIXTURE_TIMELINE_EVENTS,
  SessionLifecycleState,
  type StageRow,
} from "./state"

const STAGE_LABELS: Record<StreamStageId, string> = {
  "launching-app": "Launching game",
  initializing: "Getting ready",
  handshaking: "Contacting host",
  "establishing-streams": "Starting streams",
}

/** How long a failure stays on screen before the overlay returns itself. */
const FAILURE_AUTO_EXIT_MS = 8000

interface SessionScreenProps {
  readonly adapter: SessionLifecycleAdapter
  /** Called when the user (or the failure timer) asks to leave the session. */
  readonly onExit: () => void
}

/**
 * The session screen: rendered by the portal-origin overlay WebView inside
 * the stream Activity (entry via the treaty's session-screen query param).
 * It narrates the lifecycle ADT; the shell removes the overlay at reveal,
 * so `Connected` renders nothing enduring.
 */
export function SessionScreen({ adapter, onExit }: SessionScreenProps) {
  const [state, setState] = useState<SessionLifecycleState>(
    SessionLifecycleState.initial,
  )

  useEffect(() => adapter.start(setState), [adapter])

  // Failure is a dead end for the overlay: give the user time to read the
  // reason, then land back in the portal even without pointer input.
  useEffect(() => {
    if (state._tag !== "Failed") return
    const timer = setTimeout(onExit, FAILURE_AUTO_EXIT_MS)
    return () => clearTimeout(timer)
  }, [state._tag, onExit])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
      {state._tag === "Connecting" && (
        <StageTimeline rows={SessionLifecycleState.stageRows(state)} detail={state.detail} />
      )}
      {state._tag === "Connected" && (
        <p className="text-lg text-zinc-500">Starting…</p>
      )}
      {state._tag === "Failed" && (
        <div className="max-w-md space-y-4 p-8 text-center">
          <p className="text-xl font-semibold text-red-400">
            Couldn't start the stream
          </p>
          <p className="text-zinc-300">
            {state.reason}
            {state.detail !== null && (
              <span className="block text-sm text-zinc-500">{state.detail}</span>
            )}
            <span className="block text-sm text-zinc-600">
              error {state.errorCode}
            </span>
          </p>
          <button
            type="button"
            className="rounded-xl bg-zinc-100 px-5 py-3 text-lg font-semibold text-zinc-950"
            onClick={onExit}
          >
            Back to Korri
          </button>
        </div>
      )}
      {state._tag === "Ended" && (
        <p className="text-lg text-zinc-500">Stream ended</p>
      )}
    </main>
  )
}

interface StageTimelineProps {
  readonly rows: readonly StageRow[]
  readonly detail: string | null
}

function StageTimeline({ rows, detail }: StageTimelineProps) {
  return (
    <div className="w-full max-w-sm space-y-3 p-8">
      <h1 className="text-2xl font-bold tracking-tight">Starting stream</h1>
      <ul className="space-y-2">
        {rows.map(row => (
          <li
            key={row.stage}
            className={
              row.status === "active"
                ? "rounded-xl bg-zinc-100 px-5 py-3 font-semibold text-zinc-950"
                : row.status === "done"
                  ? "rounded-xl bg-zinc-900 px-5 py-3 text-zinc-500 line-through"
                  : "rounded-xl bg-zinc-900 px-5 py-3 text-zinc-600"
            }
          >
            {STAGE_LABELS[row.stage]}
          </li>
        ))}
      </ul>
      {detail !== null && <p className="text-sm text-zinc-600">{detail}</p>}
    </div>
  )
}

/**
 * Browser-dev stand-in for the shell's pushed events: replays the fixture
 * timeline with delays so the screen can be developed standalone.
 */
export function createFixtureLifecycleAdapter(): SessionLifecycleAdapter {
  return {
    start(onState) {
      let state = SessionLifecycleState.initial()
      onState(state)
      const timers = FIXTURE_TIMELINE_EVENTS.map((event, index) =>
        setTimeout(() => {
          state = SessionLifecycleState.applyEvent(state, event)
          onState(state)
        }, 600 * (index + 1)),
      )
      return () => {
        for (const timer of timers) clearTimeout(timer)
      }
    },
  }
}
