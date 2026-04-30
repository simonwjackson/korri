import { NavTabGroup } from "../molecules/NavTabGroup"

export interface NavigationProps {
  tabs: ReadonlyArray<string>
  activeTab: string
  onTabChange: (tab: string) => void
}

export function Navigation({ tabs, activeTab, onTabChange }: NavigationProps) {
  return (
    <nav className="flex w-full justify-center bg-neutral-200 py-3 pb-1 dark:bg-neutral-900">
      <NavTabGroup
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
      />
    </nav>
  )
}
