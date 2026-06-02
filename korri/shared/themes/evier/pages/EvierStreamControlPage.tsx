import { useCallback, useEffect, useRef, useState } from "react"

const DEBOUNCE_MS = 500

const FPS_STEPS = [30, 40, 45, 60, 75, 90, 100, 120] as const
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
    readonly filter: string
  }) => Promise<unknown>
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Promise<unknown>
}

type ControlAction = Exclude<keyof EvierStreamControlController, "getState">

interface SliderSpec {
  readonly id: string
  readonly label: string
  readonly action: ControlAction
  readonly initial: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly stepper: number
  readonly accent: "moonlight" | "gamescope"
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
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const run = useCallback(
    async (action: ControlAction, body: Record<string, unknown>) => {
      try {
        const response = await runControlAction(controller, action, body)
        setStatus(JSON.stringify(response, null, 2))
      } catch (error) {
        setStatus(JSON.stringify({ error: errorMessage(error) }, null, 2))
      }
    },
    [controller],
  )

  const refresh = useCallback(async () => {
    try {
      setStatus(JSON.stringify(await controller.getState(), null, 2))
    } catch (error) {
      setStatus(JSON.stringify({ error: errorMessage(error) }, null, 2))
    }
  }, [controller])

  const schedule = useCallback(
    (id: string, action: ControlAction, body: Record<string, unknown>) => {
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
    await run("setMoonlightBitrate", { bitrateKbps: 12_000 })
    await sleep(700)
    await run("setMoonlightFps", { fps: 60 })
    await sleep(700)
    await run("setMoonlightResolution", {
      width: 1920,
      height: 1080,
    })
  }, [run])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 3000)
    return () => {
      clearInterval(interval)
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [refresh])

  return (
    <main className="evier-shell">
      <header className="evier-hero">
        <p className="evier-kicker">Development theme</p>
        <h1>Evier</h1>
        <p>
          Kitchen-sink runtime controls for stream, GameScope, and handheld
          experiments. Slider changes are debounced by {DEBOUNCE_MS}ms.
        </p>
      </header>

      <section className="evier-card" aria-labelledby="evier-moonlight-heading">
        <h2 id="evier-moonlight-heading">Moonlight stream</h2>
        <div className="evier-grid">
          <EvierSliderControl spec={moonlightBitrateSpec} schedule={schedule} />
          <EvierSliderControl spec={moonlightFpsSpec} schedule={schedule} />
          <EvierSliderControl
            spec={moonlightResolutionSpec}
            schedule={schedule}
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
          />
          <EvierSliderControl spec={gamescopeFpsSpec} schedule={schedule} />
          <EvierSliderControl
            spec={gamescopeSharpnessSpec}
            schedule={schedule}
          />
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
                    name="evier-gamescope-filter"
                    value={value}
                    defaultChecked={value === "linear"}
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
        </div>
      </section>

      <section className="evier-card evier-status-card">
        <div className="evier-actions">
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" onClick={() => void recover()}>
            Recover Moonlight 1080/60/12
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
  wide = false,
}: {
  readonly spec: SliderSpec
  readonly schedule: (
    id: string,
    action: ControlAction,
    body: Record<string, unknown>,
  ) => void
  readonly wide?: boolean
}) {
  const [value, setValue] = useState(spec.initial)

  const update = (nextValue: number) => {
    const clamped = clamp(nextValue, spec.min, spec.max)
    setValue(clamped)
    schedule(spec.id, spec.action, spec.payload(clamped))
  }

  return (
    <div
      className={wide ? "evier-control evier-control-wide" : "evier-control"}
    >
      <div className="evier-control-label-row">
        <label htmlFor={spec.id}>{spec.label}</label>
        <output
          className={`evier-output evier-output-${spec.accent}`}
          htmlFor={spec.id}
        >
          {spec.format(value)}
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

const moonlightBitrateSpec: SliderSpec = {
  id: "evier-moonlight-bitrate",
  label: "Moonlight bitrate",
  action: "setMoonlightBitrate",
  initial: 12_000,
  min: 500,
  max: 100_000,
  step: 500,
  stepper: 500,
  accent: "moonlight",
  hint: "0.5–100 Mbps",
  format: value => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} Mbps`,
  payload: value => ({ bitrateKbps: value }),
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
  ...moonlightFpsSpec,
  id: "evier-gamescope-fps",
  label: "Gamescope FPS",
  action: "setGamescopeFps",
  accent: "gamescope",
}

const gamescopeSharpnessSpec: SliderSpec = {
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

function runControlAction(
  controller: EvierStreamControlController,
  action: ControlAction,
  body: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
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
      return controller.setGamescopeFilter({ filter: String(body.filter) })
    case "setGamescopeSharpness":
      return controller.setGamescopeSharpness({
        sharpness: Number(body.sharpness),
      })
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { readonly message?: unknown }).message
    if (typeof message === "string") return message
  }
  return String(error)
}
