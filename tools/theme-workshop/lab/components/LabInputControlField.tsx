import {
  canonicalInputValue,
  defaultInputValueForControl,
  isLabInputRecord,
  type LabInputCase,
  type LabInputControl,
  type LabInputField,
  type LabInputValue,
} from "../model/lab-source-state"
import { LabIsoDateTimeInput } from "./LabIsoDateTimeInput"

export function LabInputControlField({
  label,
  value,
  defaultValue,
  control,
  ariaLabel,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly value: LabInputValue | undefined
  readonly defaultValue?: LabInputValue
  readonly control: LabInputControl
  readonly ariaLabel: string
  readonly disabled?: boolean
  readonly onChange: (value: LabInputValue) => void
}) {
  const current = canonicalInputValue(value, control, defaultValue)

  switch (control.kind) {
    case "select":
      return (
        <label className="pt-bind-row">
          <span className="pt-bind-label">{label}</span>
          <select
            value={typeof current === "string" ? current : ""}
            aria-label={ariaLabel}
            disabled={disabled}
            onChange={event => onChange(event.target.value)}
          >
            {control.options.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )
    case "iso-datetime":
      return (
        <div className="pt-bind-row">
          <span className="pt-bind-label">{label}</span>
          <LabIsoDateTimeInput
            value={typeof current === "string" ? current : undefined}
            options={control.options}
            ariaLabel={ariaLabel}
            disabled={disabled}
            onChange={onChange}
          />
        </div>
      )
    case "range":
      return (
        <label className="pt-bind-row">
          <span className="pt-bind-label">{label}</span>
          <span className="pt-bind-inline">
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={typeof current === "number" ? current : control.min}
              aria-label={ariaLabel}
              disabled={disabled}
              onChange={event => onChange(Number(event.target.value))}
            />
            <span className="pt-bind-number">
              <input
                type="number"
                min={control.min}
                max={control.max}
                step={control.step}
                value={typeof current === "number" ? current : control.min}
                aria-label={`${ariaLabel} value`}
                disabled={disabled}
                onChange={event => onChange(Number(event.target.value))}
              />
              {control.unit ? <span>{control.unit}</span> : null}
            </span>
          </span>
        </label>
      )
    case "boolean":
      return (
        <label className="pt-bind-row pt-bind-row-check">
          <span className="pt-bind-label">{label}</span>
          <input
            type="checkbox"
            checked={current === true}
            aria-label={ariaLabel}
            disabled={disabled}
            onChange={event => onChange(event.target.checked)}
          />
        </label>
      )
    case "object":
      return (
        <fieldset className="pt-bind-fieldset" aria-label={ariaLabel}>
          <legend className="pt-bind-fieldset-title">{label}</legend>
          {control.fields.map(field => (
            <LabInputControlField
              key={field.id}
              label={field.label}
              value={fieldValue(current, field)}
              defaultValue={field.defaultValue}
              control={field.control}
              ariaLabel={`${label} ${field.label}`}
              disabled={disabled}
              onChange={next =>
                onChange({
                  ...(isLabInputRecord(current) ? current : {}),
                  [field.id]: next,
                })
              }
            />
          ))}
        </fieldset>
      )
    case "tagged": {
      const tagField = control.tagField ?? "_tag"
      const record = isLabInputRecord(current) ? current : {}
      const tag = typeof record[tagField] === "string" ? record[tagField] : ""
      const selectedCase =
        control.cases.find(inputCase => inputCase.tag === tag) ??
        control.cases[0]
      return (
        <fieldset className="pt-bind-fieldset" aria-label={ariaLabel}>
          <legend className="pt-bind-fieldset-title">{label}</legend>
          <label className="pt-bind-row">
            <span className="pt-bind-label">Status</span>
            <select
              value={selectedCase?.tag ?? ""}
              aria-label={`${label} status`}
              disabled={disabled}
              onChange={event => {
                const nextCase = control.cases.find(
                  inputCase => inputCase.tag === event.target.value,
                )
                if (nextCase) onChange(valueForCase(control, nextCase, record))
              }}
            >
              {control.cases.map(inputCase => (
                <option key={inputCase.tag} value={inputCase.tag}>
                  {inputCase.label}
                </option>
              ))}
            </select>
          </label>
          {selectedCase?.fields.map(field => (
            <LabInputControlField
              key={field.id}
              label={field.label}
              value={fieldValue(current, field)}
              defaultValue={field.defaultValue}
              control={field.control}
              ariaLabel={`${label} ${field.label}`}
              disabled={disabled}
              onChange={next =>
                onChange({
                  ...valueForCase(control, selectedCase, record),
                  [field.id]: next,
                })
              }
            />
          ))}
        </fieldset>
      )
    }
  }
}

function fieldValue(value: LabInputValue, field: LabInputField): LabInputValue {
  return isLabInputRecord(value)
    ? (value[field.id] ?? field.defaultValue)
    : field.defaultValue
}

function valueForCase(
  control: Extract<LabInputControl, { readonly kind: "tagged" }>,
  inputCase: LabInputCase,
  previous: Readonly<Record<string, LabInputValue>>,
): Readonly<Record<string, LabInputValue>> {
  return {
    [control.tagField ?? "_tag"]: inputCase.tag,
    ...Object.fromEntries(
      inputCase.fields.map(field => [
        field.id,
        canonicalInputValue(
          previous[field.id],
          field.control,
          defaultInputValueForControl(field.control, field.defaultValue),
        ),
      ]),
    ),
  }
}
