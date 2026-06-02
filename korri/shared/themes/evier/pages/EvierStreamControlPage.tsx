import { useCallback, useEffect, useRef, useState } from "react"

const API_BASE = "/api/evier/stream"
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

interface SliderSpec {
  readonly id: string
  readonly label: string
  readonly endpoint: string
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

export function EvierStreamControlPage() {
  const [status, setStatus] = useState("loading…")
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      setStatus(JSON.stringify(await response.json(), null, 2))
    },
    [],
  )

  const refresh = useCallback(async () => {
    const response = await fetch(`${API_BASE}/state`)
    setStatus(JSON.stringify(await response.json(), null, 2))
  }, [])

  const schedule = useCallback(
    (id: string, endpoint: string, body: Record<string, unknown>) => {
      clearTimeout(timers.current.get(id))
      timers.current.set(
        id,
        setTimeout(() => {
          void post(endpoint, body)
        }, DEBOUNCE_MS),
      )
    },
    [post],
  )

  const recover = useCallback(async () => {
    await post(`${API_BASE}/moonlight/bitrate`, { bitrateKbps: 12000 })
    await sleep(700)
    await post(`${API_BASE}/moonlight/fps`, { fps: 60 })
    await sleep(700)
    await post(`${API_BASE}/moonlight/resolution`, {
      width: 1920,
      height: 1080,
    })
  }, [post])

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
                        schedule(
                          "gamescope-filter",
                          `${API_BASE}/gamescope/filter`,
                          { filter: event.currentTarget.value },
                        )
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
    endpoint: string,
    body: Record<string, unknown>,
  ) => void
  readonly wide?: boolean
}) {
  const [value, setValue] = useState(spec.initial)

  const update = (nextValue: number) => {
    const clamped = clamp(nextValue, spec.min, spec.max)
    setValue(clamped)
    schedule(spec.id, spec.endpoint, spec.payload(clamped))
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
  endpoint: `${API_BASE}/moonlight/bitrate`,
  initial: 12000,
  min: 0,
  max: 100000,
  step: 500,
  stepper: 500,
  accent: "moonlight",
  hint: "0–100 Mbps",
  format: value => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} Mbps`,
  payload: value => ({ bitrateKbps: value }),
}

const moonlightFpsSpec: SliderSpec = {
  id: "evier-moonlight-fps",
  label: "Moonlight FPS",
  endpoint: `${API_BASE}/moonlight/fps`,
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
  endpoint: `${API_BASE}/moonlight/resolution`,
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
  endpoint: `${API_BASE}/gamescope/mode`,
  accent: "gamescope",
}

const gamescopeFpsSpec: SliderSpec = {
  ...moonlightFpsSpec,
  id: "evier-gamescope-fps",
  label: "Gamescope FPS",
  endpoint: `${API_BASE}/gamescope/fps`,
  accent: "gamescope",
}

const gamescopeSharpnessSpec: SliderSpec = {
  id: "evier-gamescope-sharpness",
  label: "Gamescope sharpness",
  endpoint: `${API_BASE}/gamescope/sharpness`,
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
