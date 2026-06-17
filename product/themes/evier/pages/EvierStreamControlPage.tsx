import {
  FPS_STEPS,
  GAMESCOPE_FPS_STEPS,
  LINKED_FPS_STEPS,
  type StreamControlSurfaceState,
} from "@platform/stream-control/control-surface"
import type { GamescopeScalingFilter } from "@platform/stream-control/state-normalizer"
import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import { useState } from "react"
import {
  brightnessDeviceSpec,
  brightnessSpec,
  gamescopeFpsSpec,
  gamescopeResolutionSpec,
  gamescopeSharpnessSpec,
  knownStepIndex,
  knownUnifiedNumber,
  knownValue,
  linkedFpsSpec,
  linkedResolutionSpec,
  moonlightBitrateSpec,
  moonlightFpsSpec,
  moonlightResolutionSpec,
  type SliderSpec,
  unifiedBitrateSpec,
  unifiedSharpnessSpec,
} from "./evier-control-catalog"
import {
  type ScheduledAction,
  useEvierControlState,
} from "./evier-control-state"

export type {
  EvierStreamControlController,
  StreamControlClient,
} from "@platform/stream-control/stream-control-client"

export function EvierStreamControlPage({
  controller,
}: {
  readonly controller: StreamControlClient
}) {
  const [linkedControls, setLinkedControls] = useState(true)
  const [unifiedBrightness, setUnifiedBrightness] = useState(true)
  const { status, isRecovering, surface, refresh, recover, schedule } =
    useEvierControlState(controller)

  return (
    <main className="evier-shell">
      <section
        className="evier-card"
        aria-labelledby="evier-stream-mode-heading"
      >
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
              readbackValue={knownValue(surface.moonlight.bitrate)}
            />
            <EvierSliderControl
              spec={linkedFpsSpec}
              schedule={schedule}
              readbackValue={knownStepIndex(
                surface.linked.fps,
                LINKED_FPS_STEPS,
              )}
            />
            <EvierSliderControl
              spec={linkedResolutionSpec}
              schedule={schedule}
              readbackValue={knownUnifiedNumber(surface.linked.resolution)}
              wide
            />
            <EvierSliderControl
              spec={unifiedSharpnessSpec}
              schedule={schedule}
              readbackValue={knownValue(surface.gamescope.sharpness)}
            />
            <ScalingFilterControl
              schedule={schedule}
              name="evier-unified-filter"
              readbackValue={knownValue(surface.gamescope.filter)}
            />
          </div>
        </section>
      ) : (
        <>
          <section
            className="evier-card"
            aria-labelledby="evier-moonlight-heading"
          >
            <h2 id="evier-moonlight-heading">Moonlight stream</h2>
            <div className="evier-grid">
              <EvierSliderControl
                spec={moonlightBitrateSpec}
                schedule={schedule}
                readbackValue={knownValue(surface.moonlight.bitrate)}
              />
              <EvierSliderControl
                spec={moonlightFpsSpec}
                schedule={schedule}
                readbackValue={knownStepIndex(surface.moonlight.fps, FPS_STEPS)}
              />
              <EvierSliderControl
                spec={moonlightResolutionSpec}
                schedule={schedule}
                readbackValue={knownValue(surface.moonlight.resolution)}
                wide
              />
            </div>
          </section>

          <section
            className="evier-card"
            aria-labelledby="evier-gamescope-heading"
          >
            <h2 id="evier-gamescope-heading">Gamescope presentation</h2>
            <div className="evier-grid">
              <EvierSliderControl
                spec={gamescopeResolutionSpec}
                schedule={schedule}
                readbackValue={knownValue(surface.gamescope.resolution)}
              />
              <EvierSliderControl
                spec={gamescopeFpsSpec}
                schedule={schedule}
                readbackValue={knownStepIndex(
                  surface.gamescope.fps,
                  GAMESCOPE_FPS_STEPS,
                )}
              />
              <EvierSliderControl
                spec={gamescopeSharpnessSpec}
                schedule={schedule}
                readbackValue={knownValue(surface.gamescope.sharpness)}
              />
              <ScalingFilterControl
                schedule={schedule}
                name="evier-gamescope-filter"
                readbackValue={knownValue(surface.gamescope.filter)}
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
              onChange={event =>
                setUnifiedBrightness(event.currentTarget.checked)
              }
            />
            Unified display brightness
          </label>
        </div>
        <BatteryStatus battery={surface.battery} />
        <div className="evier-grid evier-device-grid">
          {unifiedBrightness ? (
            <EvierSliderControl
              spec={brightnessSpec}
              schedule={schedule}
              readbackValue={knownUnifiedNumber(surface.brightness.unified)}
            />
          ) : (
            surface.brightness.devices.map((device, index) => (
              <EvierSliderControl
                key={device.name}
                spec={brightnessDeviceSpec(device, index)}
                schedule={schedule}
                readbackValue={knownValue(device.percent)}
              />
            ))
          )}
          {!unifiedBrightness && surface.brightness.devices.length === 0 ? (
            <p className="evier-hint">
              Brightness devices will appear after state refresh.
            </p>
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
  const value = hasReadback
    ? clamp(readbackValue, spec.min, spec.max)
    : spec.initial

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

function BatteryStatus({
  battery,
}: {
  readonly battery: StreamControlSurfaceState["battery"]
}) {
  return (
    <output className="evier-device-status" aria-label="Battery status">
      <span className="evier-device-status-label">Battery</span>
      <strong>
        {battery.percent._tag === "known"
          ? `${battery.percent.value}%`
          : "Unknown"}
      </strong>
      {battery.status ? <span>{battery.status}</span> : null}
    </output>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
