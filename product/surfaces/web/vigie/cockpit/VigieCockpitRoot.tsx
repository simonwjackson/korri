import { type ReactNode, useCallback, useMemo, useState } from "react"
import type {
  CockpitFixture,
  SessionCommandStatus,
  VigieSection,
} from "./VigieCockpit.context"
import { VigieCockpitProvider } from "./VigieCockpit.context"

// Root — the only component that owns state. For the fixtures-only spike the
// data strategy is a static CockpitFixture; the swap seam for live data later
// is this Root (same children, different source).

export function VigieCockpitRoot({
  fixture,
  children,
  sessionCommandStatus = "idle",
  sessionCommandMessage,
  stopSession = () => undefined,
}: {
  readonly fixture: CockpitFixture
  readonly children: ReactNode
  readonly sessionCommandStatus?: SessionCommandStatus
  readonly sessionCommandMessage?: string | undefined
  readonly stopSession?: () => void
}) {
  const [activeScenarioId, setActiveScenarioId] = useState(
    fixture.scenarios[0]?.id ?? "idle",
  )
  // Persist the picked device across reloads, validated against the live fleet
  // at resolve time (a stale id falls back to the current default device).
  const [activeDeviceId, setActiveDeviceId] = useState(
    () => readDevicePreference() ?? fixture.device.id,
  )
  const selectDevice = useCallback((id: string) => {
    setActiveDeviceId(id)
    writeDevicePreference(id)
  }, [])
  const [governor, setGovernorValue] = useState(fixture.governor.current)
  const [logOpen, setLogOpen] = useState(false)
  const [section, setSection] = useState<VigieSection>("overview")

  // The active device is the fixture device when its id is selected (it carries
  // the canonical role), otherwise the matching fleet member. Unknown ids fall
  // back to the fixture device rather than blanking the header.
  const device = useMemo(
    () =>
      activeDeviceId === fixture.device.id
        ? fixture.device
        : (fixture.fleet.find(member => member.id === activeDeviceId) ??
          fixture.device),
    [fixture.device, fixture.fleet, activeDeviceId],
  )

  const session = useMemo(() => {
    const match = fixture.scenarios.find(
      scenario => scenario.id === activeScenarioId,
    )
    return (match ?? fixture.scenarios[0]).session
  }, [fixture.scenarios, activeScenarioId])

  const value = useMemo(
    () => ({
      device,
      fleet: fixture.fleet,
      selectDevice,
      scenarios: fixture.scenarios,
      activeScenarioId,
      session,
      selectScenario: setActiveScenarioId,
      sessionCommandStatus,
      ...(sessionCommandMessage ? { sessionCommandMessage } : {}),
      stopSession,
      metrics: fixture.metrics,
      governor: { ...fixture.governor, current: governor },
      setGovernor: setGovernorValue,
      subsystems: fixture.subsystems,
      log: fixture.log,
      logOpen,
      toggleLog: () => setLogOpen(open => !open),
      section,
      setSection,
      sessionHistory: fixture.sessionHistory,
      lifecycle: fixture.lifecycle,
      library: fixture.library,
      inputDevices: fixture.inputDevices,
      inputEvents: fixture.inputEvents,
    }),
    [
      fixture,
      device,
      selectDevice,
      activeScenarioId,
      session,
      sessionCommandStatus,
      sessionCommandMessage,
      stopSession,
      governor,
      logOpen,
      section,
    ],
  )

  return <VigieCockpitProvider value={value}>{children}</VigieCockpitProvider>
}

const DEVICE_PREFERENCE_KEY = "vigie:selected-device"

function readDevicePreference(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(DEVICE_PREFERENCE_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function writeDevicePreference(id: string): void {
  try {
    globalThis.localStorage?.setItem(DEVICE_PREFERENCE_KEY, id)
  } catch {
    // storage unavailable (private mode, SSR) — selection stays in-memory only
  }
}
