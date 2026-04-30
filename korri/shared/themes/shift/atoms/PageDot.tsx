export interface PageDotProps {
  active?: boolean
}

export function PageDot({ active = false }: PageDotProps) {
  return (
    <span
      aria-hidden="true"
      data-active={active}
      className={`h-2 w-2 rounded-full ${
        active
          ? "bg-red-600 dark:bg-red-500"
          : "bg-neutral-400 dark:bg-neutral-600"
      }`}
    />
  )
}
