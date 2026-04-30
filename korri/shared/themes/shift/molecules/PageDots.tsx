import { PageDot } from "../atoms/PageDot"

export interface PageDotsProps {
  total: number
  active: number
  onSelect?: (index: number) => void
  ariaLabel?: string
}

export function PageDots({
  total,
  active,
  onSelect,
  ariaLabel = "Pagination",
}: PageDotsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex justify-center gap-2 pt-6"
    >
      {Array.from({ length: total }, (_, index) => {
        const isActive = index === active
        const key = `page-${index}`
        if (!onSelect) {
          return <PageDot key={key} active={isActive} />
        }
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={`Go to page ${index + 1}`}
            onClick={() => onSelect(index)}
            className="cursor-pointer border-none bg-transparent p-0"
          >
            <PageDot active={isActive} />
          </button>
        )
      })}
    </div>
  )
}
