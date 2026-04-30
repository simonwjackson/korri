import { Search } from "lucide-react"
import type { ChangeEventHandler } from "react"

export interface SearchInputProps {
  value: string
  onChange: ChangeEventHandler<HTMLInputElement>
  placeholder?: string
  ariaLabel?: string
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  ariaLabel = "Search",
}: SearchInputProps) {
  return (
    <div className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="w-full rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 transition-colors focus:border-sky-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-sky-400"
      />
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-2.5 h-5 w-5 text-neutral-500"
      />
    </div>
  )
}
