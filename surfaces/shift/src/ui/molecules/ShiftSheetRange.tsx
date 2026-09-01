import type { SurfaceGameplayControl } from "@contracts/surface/korri-surface"
import { useEffect, useRef, useState } from "react"

const DIRECTION_EVENT = "korri-semantic-direction"
const DIRECTION_END_EVENT = "korri-semantic-direction-end"
const RANGE_COMMIT_DELAY_MS = 180
const RANGE_RELEASE_FALLBACK_MS = 2000

interface SemanticDirectionDetail {
  readonly direction: "left" | "right"
  readonly repeat: boolean
  readonly releaseExpected: boolean
  readonly source?: "keyboard" | "gamepad" | "native"
  readonly gestureId?: number
}

interface PendingDirectionGesture {
  readonly direction: "left" | "right"
  readonly source?: "keyboard" | "gamepad" | "native"
  readonly gestureId?: number
}

export interface ShiftSheetRangeProps {
  readonly control: SurfaceGameplayControl & {
    readonly interaction: {
      readonly kind: "range"
      readonly value: number
      readonly min: number
      readonly max: number
      readonly step: number
    }
  }
  readonly onChange: (value: number) => void
}

/** A bounded native range. Semantic held directions advance one declared step. */
export function ShiftSheetRange({ control, onChange }: ShiftSheetRangeProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(control.interaction.value)
  const onChangeRef = useRef(onChange)
  const pendingValueRef = useRef<number | null>(null)
  const pendingDirectionRef = useRef<PendingDirectionGesture | null>(null)
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [value, setValue] = useState(control.interaction.value)
  const unavailable = !control.enabled
  const id = `gameplay-control-${control.id}`
  const descriptionId = control.description ? `${id}-description` : undefined
  const reasonId = unavailable && control.disabledReason ? `${id}-reason` : undefined
  const describedBy = [descriptionId, reasonId].filter(Boolean).join(" ") || undefined
  const cancelPendingCommit = () => {
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current)
    commitTimerRef.current = null
    pendingValueRef.current = null
    pendingDirectionRef.current = null
  }
  const flushPendingCommit = () => {
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current)
    commitTimerRef.current = null
    const pending = pendingValueRef.current
    pendingValueRef.current = null
    pendingDirectionRef.current = null
    if (pending !== null) onChangeRef.current(pending)
  }
  const scheduleCommit = (
    next: number,
    delayMs = RANGE_COMMIT_DELAY_MS,
    direction: PendingDirectionGesture | null = null,
  ) => {
    if (commitTimerRef.current !== null) clearTimeout(commitTimerRef.current)
    pendingValueRef.current = next
    pendingDirectionRef.current = direction
    commitTimerRef.current = setTimeout(flushPendingCommit, delayMs)
  }
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    cancelPendingCommit()
    valueRef.current = control.interaction.value
    setValue(control.interaction.value)
  }, [
    control.id,
    control.enabled,
    control.interaction.value,
    control.interaction.min,
    control.interaction.max,
    control.interaction.step,
  ])
  useEffect(() => () => cancelPendingCommit(), [])
  const adjust = (
    direction: "left" | "right",
    releaseExpected: boolean,
    source: PendingDirectionGesture["source"],
    gestureId: number | undefined,
  ) => {
    if (unavailable) return
    const { min, max, step } = control.interaction
    const current = valueRef.current
    const next = Math.min(
      max,
      Math.max(min, current + (direction === "left" ? -step : step)),
    )
    if (next !== current) {
      valueRef.current = next
      setValue(next)
      scheduleCommit(
        next,
        releaseExpected ? RANGE_RELEASE_FALLBACK_MS : RANGE_COMMIT_DELAY_MS,
        { direction, source, gestureId },
      )
    }
  }

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SemanticDirectionDetail>).detail
      adjust(
        detail.direction,
        detail.releaseExpected,
        detail.source,
        detail.gestureId,
      )
    }
    const endListener = (event: Event) => {
      const detail = (event as CustomEvent<PendingDirectionGesture>).detail
      const pending = pendingDirectionRef.current
      if (!pending || pending.direction !== detail.direction || pending.source !== detail.source) return
      if (pending.gestureId !== detail.gestureId) return
      flushPendingCommit()
    }
    input.addEventListener(DIRECTION_EVENT, listener)
    input.addEventListener(DIRECTION_END_EVENT, endListener)
    return () => {
      input.removeEventListener(DIRECTION_EVENT, listener)
      input.removeEventListener(DIRECTION_END_EVENT, endListener)
    }
  })

  const copy = (
    <span className="shift-sheet-control-copy">
      <span className="shift-sheet-control-label">{control.label}</span>
      {control.description ? (
        <span id={descriptionId} className="shift-sheet-control-description">
          {control.description}
        </span>
      ) : null}
      {reasonId ? (
        <span id={reasonId} className="shift-sheet-control-description">
          {control.disabledReason}
        </span>
      ) : null}
    </span>
  )

  if (reasonId) {
    return (
      <div
        id={id}
        className="shift-sheet-control shift-sheet-range"
        role="slider"
        tabIndex={0}
        aria-label={control.label}
        aria-disabled="true"
        aria-describedby={describedBy}
        aria-valuemin={control.interaction.min}
        aria-valuemax={control.interaction.max}
        aria-valuenow={value}
        data-unavailable="true"
        data-tone={control.destructive ? "danger" : "default"}
      >
        {copy}
        <span className="shift-sheet-range-value" aria-hidden="true">
          {value}
        </span>
      </div>
    )
  }

  return (
    <label
      className="shift-sheet-control shift-sheet-range"
      data-unavailable={unavailable ? "true" : undefined}
      data-tone={control.destructive ? "danger" : "default"}
    >
      {copy}
      <span className="shift-sheet-range-value">{value}</span>
      <input
        id={id}
        ref={inputRef}
        className="shift-sheet-range-input"
        type="range"
        aria-label={control.label}
        aria-disabled={unavailable}
        aria-describedby={describedBy}
        disabled={unavailable}
        data-korri-horizontal-control="range"
        value={value}
        min={control.interaction.min}
        max={control.interaction.max}
        step={control.interaction.step}
        onChange={event => {
          if (unavailable) return
          valueRef.current = event.currentTarget.valueAsNumber
          setValue(event.currentTarget.valueAsNumber)
          scheduleCommit(event.currentTarget.valueAsNumber, RANGE_RELEASE_FALLBACK_MS)
        }}
        onPointerUp={flushPendingCommit}
        onPointerCancel={flushPendingCommit}
        onBlur={flushPendingCommit}
      />
    </label>
  )
}
