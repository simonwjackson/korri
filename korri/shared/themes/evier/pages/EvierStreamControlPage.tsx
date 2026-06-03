import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"
import { useCallback, useEffect, useRef, useState } from "react"

const DEBOUNCE_MS = 500

const FPS_STEPS = [30, 40, 45, 60, 75, 90, 100, 120] as const
// Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240; 0 disables the
// compositor-side limiter entirely. We surface a small ladder rather than a
// freeform slider so the operator can dial through useful caps quickly.
const GAMESCOPE_FPS_STEPS = [0, 30, 45, 60, 75, 90, 120, 144, 165, 240] as const
const RESOLUTION_STEPS = [
  { label: "360p", width: 640, height: 360 },
  { label: "480p", width: 854, height: 480 },
  { label: "540p", width: 960, height: 540 },
  { label: "576p", width: 1024, height: 576 },
  { label: "720p", width: 1280, height: 720 },
  { label: "900p", width: 1600, height: 900 },
  { label: "1080p", width: 1920, height: 1080 },
] as const

export interface EvierStreamControlController {
  readonly getState: () => Promise<unknown>
  readonly setBrightness: (payload: {
    readonly percent: number
    readonly device?: string
  }) => Promise<unknown>
  readonly setMoonlightBitrate: (payload: {
    readonly bitrateKbps: number
  }) => Promise<unknown>
  readonly setMoonlightFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setMoonlightResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setGamescopeFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Promise<unknown>
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Promise<unknown>
}

type ControlAction = Exclude<keyof EvierStreamControlController, "getState">
type LinkedAction = "setLinkedResolution" | "setLinkedFps"
type ScheduledAction = ControlAction | LinkedAction

interface SliderSpec {
  readonly id: string
  readonly label: string
  readonly action: ScheduledAction
  readonly initial: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly stepper: number
  readonly accent: "moonlight" | "gamescope" | "linked"
  readonly hint?: string
  readonly format: (value: number) => string
  readonly payload: (value: number) => Record<string, unknown>
}

export function EvierStreamControlPage({
  controller,
}: {
  readonly controller: EvierStreamControlController
}) {
  const [status, setStatus] = useState("loading…")
  const [isRecovering, setIsRecovering] = useState(false)
  const [linkedControls, setLinkedControls] = useState(true)
  const [unifiedBrightness, setUnifiedBrightness] = useState(true)
  const [lastState, setLastState] = useState<unknown>(undefined)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const mounted = useRef(false)
  const recovering = useRef(false)
  const statusSerial = useRef(0)

  const publishStatus = useCallback((serial: number, value: unknown) => {
    if (mounted.current && serial === statusSerial.current) {
      setStatus(JSON.stringify(value, null, 2))
    }
  }, [])

  const run = useCallback(
    async (action: ScheduledAction, body: Record<string, unknown>) => {
      const serial = ++statusSerial.current
      try {
        const response = await runScheduledAction(controller, action, body)
        const readback = await controller.getState()
        if (mounted.current) setLastState(readback)
        publishStatus(serial, { command: response, readback })
      } catch (error) {
        publishStatus(serial, { error: errorMessage(error) })
      }
    },
    [controller, publishStatus],
  )

  const refresh = useCallback(async () => {
    const serial = ++statusSerial.current
    try {
      const state = await controller.getState()
      if (mounted.current) setLastState(state)
      publishStatus(serial, state)
    } catch (error) {
      publishStatus(serial, { error: errorMessage(error) })
    }
  }, [controller, publishStatus])

  const schedule = useCallback(
    (id: string, action: ScheduledAction, body: Record<string, unknown>) => {
      clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        setTimeout(() => {
          void run(action, body)
        }, DEBOUNCE_MS),
      )
    },
    [run],
  )

  const recover = useCallback(async () => {
    if (recovering.current) return
    recovering.current = true
    setIsRecovering(true)
    try {
      await run("setMoonlightBitrate", { bitrateKbps: 12_000 })
      await sleepWhileMounted(700, mounted)
      await run("setMoonlightFps", { fps: 60 })
      await sleepWhileMounted(700, mounted)
      await run("setMoonlightResolution", {
        width: 1920,
        height: 1080,
      })
    } finally {
      recovering.current = false
      if (mounted.current) setIsRecovering(false)
    }
  }, [run])

  useEffect(() => {
    mounted.current = true
    void refresh()
    const interval = setInterval(() => void refresh(), 3000)
    return () => {
      mounted.current = false
      clearInterval(interval)
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [refresh])

  return (
    <main className="evier-shell">
      <section className="evier-card" aria-labelledby="evier-stream-mode-heading">
        <div className="evier-section-heading-row">
          <h2 id="evier-stream-mode-heading">Stream controls</h2>
          <label className="evier-toggle-pill">
            <input
              type="checkbox"
              checked={linkedControls}
              onChange={event => setLinkedControls(event.currentTarget.checked)}
            />
            Unified stream controls
          </label>
        </div>
        <p className="evier-hint">
          {linkedControls
            ? "One set of controls for bitrate, FPS, resolution, sharpness, and scaling."
            : "Split mode exposes stream and presentation controls separately."}
        </p>
      </section>

      {linkedControls ? (
        <section className="evier-card" aria-labelledby="evier-session-heading">
          <h2 id="evier-session-heading">Session controls</h2>
          <div className="evier-grid">
            <EvierSliderControl
              spec={unifiedBitrateSpec}
              schedule={schedule}
              readbackValue={moonlightBitrateReadback(lastState)}
            />
            <EvierSliderControl
              spec={linkedFpsSpec}
              schedule={schedule}
              readbackValue={linkedFpsReadback(lastState)}
            />
            <EvierSliderControl
              spec={linkedResolutionSpec}
              schedule={schedule}
              readbackValue={linkedResolutionReadback(lastState)}
              wide
            />
            <EvierSliderControl
              spec={unifiedSharpnessSpec}
              schedule={schedule}
              readbackValue={gamescopeSharpnessReadback(lastState)}
            />
            <ScalingFilterControl
              schedule={schedule}
              name="evier-unified-filter"
              readbackValue={gamescopeFilterReadback(lastState)}
            />
          </div>
        </section>
      ) : (
        <>
          <section className="evier-card" aria-labelledby="evier-moonlight-heading">
            <h2 id="evier-moonlight-heading">Moonlight stream</h2>
            <div className="evier-grid">
              <EvierSliderControl
                spec={moonlightBitrateSpec}
                schedule={schedule}
                readbackValue={moonlightBitrateReadback(lastState)}
              />
              <EvierSliderControl
                spec={moonlightFpsSpec}
                schedule={schedule}
                readbackValue={moonlightFpsReadback(lastState)}
              />
              <EvierSliderControl
                spec={moonlightResolutionSpec}
                schedule={schedule}
                readbackValue={moonlightResolutionReadback(lastState)}
                wide
              />
            </div>
          </section>

          <section className="evier-card" aria-labelledby="evier-gamescope-heading">
            <h2 id="evier-gamescope-heading">Gamescope presentation</h2>
            <div className="evier-grid">
              <EvierSliderControl
                spec={gamescopeResolutionSpec}
                schedule={schedule}
                readbackValue={gamescopeResolutionReadback(lastState)}
              />
              <EvierSliderControl
                spec={gamescopeFpsSpec}
                schedule={schedule}
                readbackValue={gamescopeFpsReadback(lastState)}
              />
              <EvierSliderControl
                spec={gamescopeSharpnessSpec}
                schedule={schedule}
                readbackValue={gamescopeSharpnessReadback(lastState)}
              />
              <ScalingFilterControl
                schedule={schedule}
                name="evier-gamescope-filter"
                readbackValue={gamescopeFilterReadback(lastState)}
              />
            </div>
          </section>
        </>
      )}

      <section className="evier-card" aria-labelledby="evier-device-heading">
        <div className="evier-section-heading-row">
          <h2 id="evier-device-heading">Device controls</h2>
          <label className="evier-toggle-pill">
            <input
              type="checkbox"
              checked={unifiedBrightness}
              onChange={event => setUnifiedBrightness(event.currentTarget.checked)}
            />
            Unified display brightness
          </label>
        </div>
        <BatteryStatus state={lastState} />
        <div className="evier-grid evier-device-grid">
          {unifiedBrightness ? (
            <EvierSliderControl
              spec={brightnessSpec}
              schedule={schedule}
              readbackValue={brightnessReadback(lastState)}
            />
          ) : (
            brightnessDevicesFromState(lastState).map((device, index) => (
              <EvierSliderControl
                key={device.name}
                spec={brightnessDeviceSpec(device, index)}
                schedule={schedule}
                readbackValue={device.percent}
              />
            ))
          )}
          {!unifiedBrightness && brightnessDevicesFromState(lastState).length === 0 ? (
            <p className="evier-hint">Brightness devices will appear after state refresh.</p>
          ) : null}
        </div>
      </section>

      <section className="evier-card evier-status-card">
        <div className="evier-actions">
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button
            type="button"
            disabled={isRecovering}
            onClick={() => void recover()}
          >
            {isRecovering ? "Recovering…" : "Recover Moonlight 1080/60/12"}
          </button>
        </div>
        <pre className="evier-status">{status}</pre>
      </section>
    </main>
  )
}

function EvierSliderControl({
  spec,
  schedule,
  readbackValue,
  wide = false,
}: {
  readonly spec: SliderSpec
  readonly schedule: (
    id: string,
    action: ScheduledAction,
    body: Record<string, unknown>,
  ) => void
  readonly readbackValue?: number
  readonly wide?: boolean
}) {
  const hasReadback = typeof readbackValue === "number"
  const value = hasReadback ? clamp(readbackValue, spec.min, spec.max) : spec.initial

  const update = (nextValue: number) => {
    if (!hasReadback) return
    const clamped = clamp(nextValue, spec.min, spec.max)
    schedule(spec.id, spec.action, spec.payload(clamped))
  }

  return (
    <div
      className={
        wide
          ? `evier-control evier-control-${spec.accent} evier-control-wide`
          : `evier-control evier-control-${spec.accent}`
      }
    >
      <div className="evier-control-label-row">
        <label htmlFor={spec.id}>{spec.label}</label>
        <output
          className={`evier-output evier-output-${spec.accent}`}
          htmlFor={spec.id}
        >
          {hasReadback ? spec.format(value) : "Unknown"}
        </output>
      </div>
      <div className="evier-slider-row">
        <button
          aria-label={`Decrease ${spec.label}`}
          type="button"
          onClick={() => update(value - spec.stepper)}
        >
          −
        </button>
        <input
          id={spec.id}
          aria-label={spec.label}
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step}
          value={value}
          disabled={!hasReadback}
          onChange={event => update(Number(event.currentTarget.value))}
        />
        <button
          aria-label={`Increase ${spec.label}`}
          type="button"
          onClick={() => update(value + spec.stepper)}
        >
          +
        </button>
      </div>
      {spec.hint ? <p className="evier-hint">{spec.hint}</p> : null}
    </div>
  )
}

function ScalingFilterControl({
  schedule,
  name,
  readbackValue,
}: {
  readonly schedule: (
    id: string,
    action: ScheduledAction,
    body: Record<string, unknown>,
  ) => void
  readonly name: string
  readonly readbackValue?: GamescopeScalingFilter
}) {
  return (
    <fieldset className="evier-fieldset">
      <legend>Scaling filter</legend>
      <div className="evier-radio-row">
        {[
          ["linear", "Linear"],
          ["fsr", "FSR"],
          ["nearest", "Nearest"],
          ["integer", "Integer"],
          ["nis", "NIS"],
        ].map(([value, label]) => (
          <label className="evier-radio-pill" key={value}>
            <input
              type="radio"
              name={name}
              value={value}
              checked={readbackValue === value}
              disabled={!readbackValue}
              onChange={event => {
                if (event.currentTarget.checked) {
                  schedule("gamescope-filter", "setGamescopeFilter", {
                    filter: event.currentTarget.value,
                  })
                }
              }}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function BatteryStatus({ state }: { readonly state: unknown }) {
  const battery = batteryFromState(state)
  return (
    <div className="evier-device-status" aria-label="Battery status">
      <span className="evier-device-status-label">Battery</span>
      <strong>{battery.percent === null ? "Unknown" : `${battery.percent}%`}</strong>
      {battery.status ? <span>{battery.status}</span> : null}
    </div>
  )
}

interface BatteryViewState {
  readonly percent: number | null
  readonly status: string | null
}

function batteryFromState(state: unknown): BatteryViewState {
  const battery = isRecord(state) ? state.battery : undefined
  const response = isRecord(battery) ? battery.response : undefined
  if (!isRecord(response)) return { percent: null, status: null }
  return {
    percent:
      typeof response.percent === "number"
        ? clamp(response.percent, 0, 100)
        : null,
    status: typeof response.status === "string" ? response.status : null,
  }
}

function brightnessReadback(state: unknown): number | undefined {
  const response = okResponse(state, "brightness")
  const percent = isRecord(response) ? response.percent : undefined
  return typeof percent === "number" ? clamp(percent, 0, 100) : undefined
}

function moonlightBitrateReadback(state: unknown): number | undefined {
  const runtimeSettings = moonlightRuntimeSettings(state)
  const streamQuality = moonlightStreamQuality(state)
  return firstNumber(runtimeSettings?.appliedBitrateKbps, streamQuality?.bitrateKbps)
}

function moonlightFpsReadback(state: unknown): number | undefined {
  const fps = firstNumber(
    moonlightRuntimeSettings(state)?.appliedFps,
    moonlightStreamQuality(state)?.fps,
  )
  return indexOfStep(FPS_STEPS, fps)
}

function moonlightResolutionReadback(state: unknown): number | undefined {
  const runtimeResolution = recordField(
    moonlightRuntimeSettings(state),
    "appliedResolution",
  )
  const streamQuality = moonlightStreamQuality(state)
  return resolutionIndex(
    firstNumber(runtimeResolution?.width, streamQuality?.width),
    firstNumber(runtimeResolution?.height, streamQuality?.height),
  )
}

function gamescopeFpsReadback(state: unknown): number | undefined {
  return indexOfStep(GAMESCOPE_FPS_STEPS, numberField(gamescopeResult(state), "fps"))
}

function gamescopeResolutionReadback(state: unknown): number | undefined {
  const mode = recordField(gamescopeResult(state), "xwaylandMode")
  return resolutionIndex(numberField(mode, "width"), numberField(mode, "height"))
}

function gamescopeSharpnessReadback(state: unknown): number | undefined {
  return numberField(gamescopeResult(state), "sharpness")
}

function gamescopeFilterReadback(
  state: unknown,
): GamescopeScalingFilter | undefined {
  const filter = gamescopeResult(state)?.filter
  return filter === "linear" ||
    filter === "nearest" ||
    filter === "integer" ||
    filter === "fsr" ||
    filter === "nis"
    ? filter
    : undefined
}

function linkedFpsReadback(state: unknown): number | undefined {
  const moonlight = moonlightFpsReadback(state)
  const gamescope = gamescopeFpsReadback(state)
  if (moonlight === undefined || gamescope === undefined) return undefined
  const moonlightFps = FPS_STEPS[moonlight]
  const gamescopeFps = GAMESCOPE_FPS_STEPS[gamescope]
  return moonlightFps === gamescopeFps ? moonlight : undefined
}

function linkedResolutionReadback(state: unknown): number | undefined {
  const moonlight = moonlightResolutionReadback(state)
  const gamescope = gamescopeResolutionReadback(state)
  return moonlight !== undefined && moonlight === gamescope ? moonlight : undefined
}

function okResponse(state: unknown, key: string): unknown {
  const entry = isRecord(state) ? state[key] : undefined
  if (!isRecord(entry) || entry.status !== "ok") return undefined
  return entry.response
}

function rpcResult(response: unknown): Record<string, unknown> | undefined {
  if (!isRecord(response)) return undefined
  const result = response.result
  return isRecord(result) ? result : undefined
}

function moonlightResult(state: unknown): Record<string, unknown> | undefined {
  return rpcResult(okResponse(state, "moonlight"))
}

function gamescopeResult(state: unknown): Record<string, unknown> | undefined {
  return rpcResult(okResponse(state, "gamescope"))
}

function moonlightRuntimeSettings(
  state: unknown,
): Record<string, unknown> | undefined {
  return recordField(moonlightResult(state), "runtimeSettings")
}

function moonlightStreamQuality(
  state: unknown,
): Record<string, unknown> | undefined {
  return recordField(moonlightResult(state), "streamQuality")
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function numberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key]
  return typeof value === "number" ? value : undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number")
}

function resolutionIndex(
  width: number | undefined,
  height: number | undefined,
): number | undefined {
  if (width === undefined || height === undefined) return undefined
  const index = RESOLUTION_STEPS.findIndex(
    step => step.width === width && step.height === height,
  )
  return index >= 0 ? index : undefined
}

function indexOfStep(
  steps: readonly number[],
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined
  const index = steps.indexOf(value)
  return index >= 0 ? index : undefined
}

const brightnessSpec: SliderSpec = {
  id: "evier-brightness",
  label: "Display brightness",
  action: "setBrightness",
  initial: 50,
  min: 0,
  max: 100,
  step: 1,
  stepper: 5,
  accent: "linked",
  hint: "0–100%",
  format: value => `${value}%`,
  payload: value => ({ percent: value }),
}

function brightnessDeviceSpec(
  device: BrightnessDevice,
  index: number,
): SliderSpec {
  return {
    id: `evier-brightness-${device.name}`,
    label: `Display ${index + 1} brightness`,
    action: "setBrightness",
    initial: device.percent,
    min: 0,
    max: 100,
    step: 1,
    stepper: 5,
    accent: "linked",
    hint: device.name,
    format: value => `${value}%`,
    payload: value => ({ percent: value, device: device.name }),
  }
}

interface BrightnessDevice {
  readonly name: string
  readonly percent: number
}

function brightnessDevicesFromState(state: unknown): readonly BrightnessDevice[] {
  const brightness = isRecord(state) ? state.brightness : undefined
  const response = isRecord(brightness) ? brightness.response : undefined
  const devices = isRecord(response) ? response.devices : undefined
  if (!Array.isArray(devices)) return []
  return devices.flatMap(device => {
    if (!isRecord(device)) return []
    if (typeof device.name !== "string") return []
    if (typeof device.percent !== "number") return []
    return [{ name: device.name, percent: clamp(device.percent, 0, 100) }]
  })
}

const linkedResolutionSpec: SliderSpec = {
  id: "evier-linked-resolution",
  label: "Resolution",
  action: "setLinkedResolution",
  initial: RESOLUTION_STEPS.length - 1,
  min: 0,
  max: RESOLUTION_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "linked",
  hint: "Applies to the active session output and stream source",
  format: value => RESOLUTION_STEPS[value]?.label ?? "1080p",
  payload: value => {
    const resolution = RESOLUTION_STEPS[value] ?? RESOLUTION_STEPS.at(-1)
    return { width: resolution.width, height: resolution.height }
  },
}

const linkedFpsSpec: SliderSpec = {
  id: "evier-linked-fps",
  label: "FPS",
  action: "setLinkedFps",
  initial: FPS_STEPS.length - 1,
  min: 0,
  max: FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "linked",
  hint: "30–120 FPS",
  format: value => `${FPS_STEPS[value] ?? 120} FPS`,
  payload: value => ({ fps: FPS_STEPS[value] ?? 120 }),
}

const moonlightBitrateSpecBase: SliderSpec = {
  id: "evier-moonlight-bitrate",
  label: "Moonlight bitrate",
  action: "setMoonlightBitrate",
  initial: 12_000,
  min: 500,
  max: 150_000,
  step: 500,
  stepper: 500,
  accent: "moonlight",
  hint: "0.5–150 Mbps",
  format: value => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} Mbps`,
  payload: value => ({ bitrateKbps: value }),
}

const unifiedBitrateSpec: SliderSpec = {
  ...moonlightBitrateSpecBase,
  id: "evier-unified-bitrate",
  label: "Bitrate",
}

const moonlightBitrateSpec: SliderSpec = {
  ...moonlightBitrateSpecBase,
}

const moonlightFpsSpec: SliderSpec = {
  id: "evier-moonlight-fps",
  label: "Moonlight FPS",
  action: "setMoonlightFps",
  initial: 3,
  min: 0,
  max: FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "moonlight",
  hint: "30, 40, 45, 60, 75, 90, 100, 120",
  format: value => `${FPS_STEPS[value] ?? 60} FPS`,
  payload: value => ({ fps: FPS_STEPS[value] ?? 60 }),
}

const moonlightResolutionSpec: SliderSpec = {
  id: "evier-moonlight-resolution",
  label: "Moonlight resolution",
  action: "setMoonlightResolution",
  initial: RESOLUTION_STEPS.length - 1,
  min: 0,
  max: RESOLUTION_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "moonlight",
  hint: "360p, 480p, 540p, 576p, 720p, 900p, 1080p",
  format: value => RESOLUTION_STEPS[value]?.label ?? "1080p",
  payload: value => {
    const resolution = RESOLUTION_STEPS[value] ?? RESOLUTION_STEPS.at(-1)
    return { width: resolution.width, height: resolution.height }
  },
}

const gamescopeResolutionSpec: SliderSpec = {
  ...moonlightResolutionSpec,
  id: "evier-gamescope-resolution",
  label: "Gamescope resolution",
  action: "setGamescopeMode",
  accent: "gamescope",
}

const gamescopeFpsSpec: SliderSpec = {
  id: "evier-gamescope-fps",
  label: "Gamescope FPS cap",
  action: "setGamescopeFps",
  // Default the slider to "Off" (index 0 → fps=0) so the UI reflects the
  // unconfigured state of GAMESCOPE_FPS_LIMIT after a fresh gamescope launch.
  initial: 0,
  min: 0,
  max: GAMESCOPE_FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "gamescope",
  hint: "Off, 30, 45, 60, 75, 90, 120, 144, 165, 240",
  format: value => {
    const fps = GAMESCOPE_FPS_STEPS[value] ?? 0
    return fps === 0 ? "Off" : `${fps} FPS`
  },
  payload: value => ({ fps: GAMESCOPE_FPS_STEPS[value] ?? 0 }),
}

const gamescopeSharpnessSpecBase: SliderSpec = {
  id: "evier-gamescope-sharpness",
  label: "Gamescope sharpness",
  action: "setGamescopeSharpness",
  initial: 10,
  min: 0,
  max: 20,
  step: 1,
  stepper: 1,
  accent: "gamescope",
  hint: "0–20",
  format: value => String(value),
  payload: value => ({ sharpness: value }),
}

const unifiedSharpnessSpec: SliderSpec = {
  ...gamescopeSharpnessSpecBase,
  id: "evier-unified-sharpness",
  label: "Sharpness",
}

const gamescopeSharpnessSpec: SliderSpec = {
  ...gamescopeSharpnessSpecBase,
}

async function runScheduledAction(
  controller: EvierStreamControlController,
  action: ScheduledAction,
  body: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case "setLinkedResolution": {
      const requested = {
        width: Number(body.width),
        height: Number(body.height),
      }
      const gamescope = await controller.setGamescopeMode(requested)
      const moonlight = await controller.setMoonlightResolution(requested)
      return { action: "linked.resolution", requested, gamescope, moonlight }
    }
    case "setLinkedFps": {
      const requested = { fps: Number(body.fps) }
      const moonlight = await controller.setMoonlightFps(requested)
      const gamescope = await controller.setGamescopeFps(requested)
      return { action: "linked.fps", requested, moonlight, gamescope }
    }
    case "setBrightness":
      return controller.setBrightness({
        percent: Number(body.percent),
        ...(typeof body.device === "string" ? { device: body.device } : {}),
      })
    case "setMoonlightBitrate":
      return controller.setMoonlightBitrate({
        bitrateKbps: Number(body.bitrateKbps),
      })
    case "setMoonlightFps":
      return controller.setMoonlightFps({ fps: Number(body.fps) })
    case "setMoonlightResolution":
      return controller.setMoonlightResolution({
        width: Number(body.width),
        height: Number(body.height),
      })
    case "setGamescopeMode":
      return controller.setGamescopeMode({
        width: Number(body.width),
        height: Number(body.height),
      })
    case "setGamescopeFps":
      return controller.setGamescopeFps({ fps: Number(body.fps) })
    case "setGamescopeFilter":
      return controller.setGamescopeFilter({
        filter: gamescopeScalingFilterFrom(body.filter),
      })
    case "setGamescopeSharpness":
      return controller.setGamescopeSharpness({
        sharpness: Number(body.sharpness),
      })
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

async function sleepWhileMounted(
  ms: number,
  mounted: { readonly current: boolean },
) {
  await new Promise(resolve => setTimeout(resolve, ms))
  if (!mounted.current) throw new Error("Evier stream control unmounted")
}

function gamescopeScalingFilterFrom(value: unknown): GamescopeScalingFilter {
  if (
    value === "linear" ||
    value === "nearest" ||
    value === "integer" ||
    value === "fsr" ||
    value === "nis"
  ) {
    return value
  }
  return "linear"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message
    if (typeof message === "string") return message
  }
  return String(error)
}
