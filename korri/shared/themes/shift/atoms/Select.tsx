import type { ChangeEventHandler } from "react"

export interface SelectOption {
  label: string
  value: string
}

export interface SelectProps {
  value: string
  options: ReadonlyArray<SelectOption>
  onChange: ChangeEventHandler<HTMLSelectElement>
  ariaLabel?: string
}

export function Select({ value, options, onChange, ariaLabel }: SelectProps) {
  return (
    <select
      value={value}
      onChange={onChange}
      aria-label={ariaLabel}
      className="rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 transition-colors focus:border-sky-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-sky-400"
    >
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
