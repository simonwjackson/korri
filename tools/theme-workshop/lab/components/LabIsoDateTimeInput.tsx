import { useId } from "react"
import type { LabInputOption } from "../model/lab-source-state"

export function isoToDateTimeLocalValue(value: string | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getUTCFullYear().toString().padStart(4, "0")
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hour = date.getUTCHours().toString().padStart(2, "0")
  const minute = date.getUTCMinutes().toString().padStart(2, "0")
  return `${year}-${month}-${day}T${hour}:${minute}`
}

export function dateTimeLocalValueToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const date = new Date(`${value}:00.000Z`)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export function LabIsoDateTimeInput({
  value,
  options = [],
  ariaLabel,
  disabled,
  onChange,
}: {
  readonly value: string | undefined
  readonly options?: readonly LabInputOption[]
  readonly ariaLabel: string
  readonly disabled?: boolean
  readonly onChange: (isoValue: string) => void
}) {
  const listId = useId()
  const datalistId = options.length > 0 ? listId : undefined
  return (
    <>
      <input
        type="datetime-local"
        value={isoToDateTimeLocalValue(value)}
        list={datalistId}
        aria-label={ariaLabel}
        disabled={disabled}
        onChange={event => {
          const iso = dateTimeLocalValueToIso(event.target.value)
          if (iso) onChange(iso)
        }}
      />
      {datalistId ? (
        <datalist id={datalistId}>
          {options.map(option => {
            const localValue = isoToDateTimeLocalValue(option.id)
            return localValue ? (
              <option key={option.id} value={localValue} label={option.label} />
            ) : null
          })}
        </datalist>
      ) : null}
    </>
  )
}
