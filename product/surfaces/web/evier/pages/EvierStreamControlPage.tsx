import type { StreamControlCapability } from "@platform/stream-control/control-contract"
import {
  FPS_STEPS,
  type StreamControlSurfaceState,
} from "@platform/stream-control/control-surface"
import type { StreamControlClient } from "@platform/stream-control/stream-control-client"
import { useMemo, useState } from "react"
import {
  brightnessDeviceSpec,
  brightnessSpec,
  knownStepIndex,
  knownValue,
  moonlightBitrateSpec,
  moonlightFpsSpec,
  moonlightResolutionSpec,
  type SliderSpec,
  sliderSpecFromCapability,
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
  const [unifiedBrightness, setUnifiedBrightness] = useState(true)
  const {
    status,
    isRecovering,
    surface,
    controls,
    refresh,
    recover,
    schedule,
  } = useEvierControlState(controller)
  const pluginControls = useMemo(
    () => controls.filter(control => Boolean(control.provider)),
    [controls],
  )

  return (
    <main className="evier-shell">
      <section
        className="evier-card"
        aria-labelledby="evier-stream-mode-heading"
      >
        <h2 id="evier-stream-mode-heading">Stream controls</h2>
        <p className="evier-hint">
          Runtime controls are rendered from server metadata. Plugin controls
          appear when product composition enables their provider.
        </p>
      </section>

      <section className="evier-card" aria-labelledby="evier-moonlight-heading">
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

      <section className="evier-card" aria-labelledby="evier-plugin-heading">
        <h2 id="evier-plugin-heading">Presentation controls</h2>
        <div className="evier-grid">
          {pluginControls.length === 0 ? (
            <p className="evier-hint">
              No presentation controls are available from enabled providers.
            </p>
          ) : (
            pluginControls.map(control => (
              <PluginControl
                key={control.id}
                control={control}
                surface={surface}
                schedule={schedule}
              />
            ))
          )}
        </div>
      </section>

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
              readbackValue={knownValueOrMixed(surface.brightness.unified)}
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

function PluginControl({
  control,
  surface,
  schedule,
}: {
  readonly control: StreamControlCapability
  readonly surface: StreamControlSurfaceState
  readonly schedule: (
    id: string,
    action: ScheduledAction,
    body: Record<string, unknown>,
  ) => void
}) {
  if (control.value.kind === "options") {
    const optionControl = control as StreamControlCapability & {
      readonly value: {
        readonly kind: "options"
        readonly values: readonly string[]
      }
    }
    return (
      <OptionControl
        control={optionControl}
        readbackValue={knownValue(surface.readControl(control))}
        schedule={schedule}
      />
    )
  }

  const spec = sliderSpecFromCapability(control)
  if (!spec) return null
  const readback = surface.readControl(control)
  const readbackValue =
    control.value.kind === "steps"
      ? typeof knownValue(readback) === "number"
        ? control.value.values.indexOf(knownValue(readback) as number)
        : undefined
      : knownValue(readback)

  return (
    <EvierSliderControl
      spec={spec}
      schedule={schedule}
      readbackValue={
        typeof readbackValue === "number" ? readbackValue : undefined
      }
    />
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

function OptionControl({
  control,
  readbackValue,
  schedule,
}: {
  readonly control: StreamControlCapability & {
    readonly value: {
      readonly kind: "options"
      readonly values: readonly string[]
    }
  }
  readonly readbackValue?: number | string
  readonly schedule: (
    id: string,
    action: ScheduledAction,
    body: Record<string, unknown>,
  ) => void
}) {
  if (!control.action) return null
  return (
    <fieldset className="evier-fieldset">
      <legend>{control.label}</legend>
      <div className="evier-radio-row">
        {control.value.values.map(value => (
          <label className="evier-radio-pill" key={value}>
            <input
              type="radio"
              name={control.id}
              value={value}
              checked={readbackValue === value}
              disabled={control.status !== "supported"}
              onChange={event => {
                if (event.currentTarget.checked) {
                  schedule(control.id, control.action ?? "", {
                    [optionPayloadKey(control)]: event.currentTarget.value,
                  })
                }
              }}
            />
            {value}
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

function knownValueOrMixed(
  readback: StreamControlSurfaceState["brightness"]["unified"],
): number | undefined {
  return readback._tag === "known" ? readback.value : undefined
}

function optionPayloadKey(control: StreamControlCapability): string {
  const local = control.id.split("/").at(-1) ?? "value"
  return local.includes("filter") ? "filter" : "value"
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
