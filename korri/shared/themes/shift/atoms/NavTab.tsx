import type { MouseEventHandler } from "react"

export interface NavTabProps {
  label: string
  active?: boolean
  onClick?: MouseEventHandler<HTMLButtonElement>
}

export function NavTab({ label, active = false, onClick }: NavTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`cursor-pointer rounded-full border-none px-2.5 py-1 text-xs transition-all duration-200 ${
        active
          ? "bg-red-600 font-medium text-white shadow-sm dark:bg-red-500"
          : "bg-transparent text-neutral-700 hover:bg-neutral-300 dark:text-white dark:hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  )
}
