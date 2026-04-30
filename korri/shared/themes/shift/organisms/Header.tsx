import { StatusBar } from "../molecules/StatusBar"

export interface HeaderProps {
  currentTime: string
  isDark: boolean
  onToggleTheme: () => void
  avatarSrc?: string
}

export function Header({
  currentTime,
  isDark,
  onToggleTheme,
  avatarSrc = "https://i.pravatar.cc/80",
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex w-full items-center justify-between bg-neutral-200 px-3 py-1.5 text-xs text-neutral-600 dark:bg-neutral-900 dark:text-white/70">
      <div className="font-medium">{currentTime}</div>
      <StatusBar
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        avatarSrc={avatarSrc}
      />
    </header>
  )
}
