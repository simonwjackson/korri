import { createContext, useContext } from "react"

// Tier 1 — unified launch+stream session, grounded on the real
// ForegroundSessionGateState spine: Ready → Preparing → Running → Cooling,
// with Recovering as the off-nominal branch. Streaming is observed *within*
// Running, so launch and stream are shaped as one unit.

export type SessionHealth =
  | "idle"
  | "active"
  | "nominal"
  | "caution"
  | "critical"

export type SessionPhaseStatus = "done" | "active" | "pending" | "failed"

export interface SessionPhaseStep {
  readonly id: string
  readonly label: string
  readonly substate?: string
  readonly status: SessionPhaseStatus
}

export interface SessionReadout {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly accent?: SessionHealth
}

export interface CockpitSession {
  readonly health: SessionHealth
  readonly headline: string
  readonly gameId?: string
  readonly requestId?: string
  readonly phases: readonly SessionPhaseStep[]
  readonly stream: readonly SessionReadout[]
  readonly note?: string
}

// Tier 2 — device metrics + control (governors).

export type MetricStatus = "nominal" | "caution" | "critical"

export interface DeviceMetric {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly status: MetricStatus
  readonly series: readonly number[]
}

export interface GovernorControl {
  readonly current: string
  readonly options: readonly string[]
}

// Tier 3 — subsystem observability.

export type SubsystemStatus = "nominal" | "degraded" | "down"

export interface Subsystem {
  readonly id: string
  readonly label: string
  readonly status: SubsystemStatus
  readonly detail: string
}

// Per-device frame (fleet-ready dimension).

export interface CockpitDevice {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly online: boolean
}

// Last-resort log.

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface LogLine {
  readonly ts: string
  readonly level: LogLevel
  readonly source: string
  readonly message: string
}

export interface CockpitScenario {
  readonly id: string
  readonly label: string
  readonly session: CockpitSession
}

// Sessions page.

export type SessionMode = "local" | "stream"
export type SessionOutcome = "running" | "ended" | "failed" | "recovering"

export interface SessionHistoryEntry {
  readonly id: string
  readonly game: string
  readonly mode: SessionMode
  readonly outcome: SessionOutcome
  readonly duration: string
  readonly requestId: string
  readonly when: string
}

export interface LifecycleEvent {
  readonly ts: string
  readonly phase: string
  readonly detail: string
  readonly level?: LogLevel
}

// Library page.

export interface LibraryGameEntry {
  readonly id: string
  readonly title: string
  readonly system: string
  readonly source: string
  readonly releaseCount: number
  readonly launchable: boolean
  readonly collections: readonly string[]
}

// Inputs page.

export type InputDeviceClass = "gamepad" | "keyboard" | "mouse" | "touch"
export type InputDeviceStatus = "connected" | "reconnecting" | "disconnected"

export interface InputDevice {
  readonly id: string
  readonly name: string
  readonly deviceClass: InputDeviceClass
  readonly status: InputDeviceStatus
  readonly driver: string
}

export type InputEventKind = "semantic" | "button" | "axis"

export interface InputEvent {
  readonly ts: string
  readonly device: string
  readonly kind: InputEventKind
  readonly label: string
  readonly value?: string
}

export type VigieSection =
  | "overview"
  | "sessions"
  | "library"
  | "telemetry"
  | "inputs"
  | "logs"

export interface CockpitFixture {
  readonly device: CockpitDevice
  readonly fleet: readonly CockpitDevice[]
  readonly scenarios: readonly CockpitScenario[]
  readonly metrics: readonly DeviceMetric[]
  readonly governor: GovernorControl
  readonly subsystems: readonly Subsystem[]
  readonly log: readonly LogLine[]
  readonly sessionHistory: readonly SessionHistoryEntry[]
  readonly lifecycle: readonly LifecycleEvent[]
  readonly library: readonly LibraryGameEntry[]
  readonly inputDevices: readonly InputDevice[]
  readonly inputEvents: readonly InputEvent[]
}

export type SessionCommandStatus = "idle" | "pending" | "failed" | "applied"

export interface VigieCockpitContextValue {
  readonly device: CockpitDevice
  readonly fleet: readonly CockpitDevice[]
  readonly selectDevice: (id: string) => void
  readonly scenarios: readonly CockpitScenario[]
  readonly activeScenarioId: string
  readonly session: CockpitSession
  readonly selectScenario: (id: string) => void
  readonly sessionCommandStatus: SessionCommandStatus
  readonly sessionCommandMessage?: string
  readonly stopSession: () => void
  readonly metrics: readonly DeviceMetric[]
  readonly governor: GovernorControl
  readonly setGovernor: (value: string) => void
  readonly subsystems: readonly Subsystem[]
  readonly log: readonly LogLine[]
  readonly logOpen: boolean
  readonly toggleLog: () => void
  readonly section: VigieSection
  readonly setSection: (section: VigieSection) => void
  readonly sessionHistory: readonly SessionHistoryEntry[]
  readonly lifecycle: readonly LifecycleEvent[]
  readonly library: readonly LibraryGameEntry[]
  readonly inputDevices: readonly InputDevice[]
  readonly inputEvents: readonly InputEvent[]
}

const VigieCockpitContext = createContext<VigieCockpitContextValue | null>(null)

export const VigieCockpitProvider = VigieCockpitContext.Provider

export function useVigieCockpit(): VigieCockpitContextValue {
  const ctx = useContext(VigieCockpitContext)
  if (!ctx) {
    throw new Error("useVigieCockpit must be used within a VigieCockpitRoot")
  }
  return ctx
}
