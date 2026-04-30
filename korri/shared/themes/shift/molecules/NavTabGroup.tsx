import { NavTab } from "../atoms/NavTab"

export interface NavTabGroupProps {
  tabs: ReadonlyArray<string>
  activeTab: string
  onTabChange: (tab: string) => void
  ariaLabel?: string
}

export function NavTabGroup({
  tabs,
  activeTab,
  onTabChange,
  ariaLabel = "Primary navigation",
}: NavTabGroupProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 rounded-full px-2 py-0.5 text-xs"
    >
      {tabs.map(tab => (
        <NavTab
          key={tab}
          label={tab}
          active={activeTab === tab}
          onClick={() => onTabChange(tab)}
        />
      ))}
    </div>
  )
}
