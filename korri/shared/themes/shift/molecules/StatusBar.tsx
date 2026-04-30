import { Battery, Moon, Sun, Wifi } from "lucide-react"
import { AvatarImage } from "../atoms/AvatarImage"
import { StatusIcon } from "../atoms/StatusIcon"
import { ToggleIconButton } from "../atoms/ToggleIconButton"

export interface StatusBarProps {
  isDark: boolean
  onToggleTheme: () => void
  avatarSrc: string
  avatarAlt?: string
}

/**
 * Right-side cluster of the Header: connectivity icons, theme toggle, avatar.
 */
export function StatusBar({
  isDark,
  onToggleTheme,
  avatarSrc,
  avatarAlt = "User avatar",
}: StatusBarProps) {
  return (
    <div className="flex items-center gap-2.5">
      <StatusIcon icon={Wifi} ariaLabel="WiFi" />
      <StatusIcon icon={Battery} ariaLabel="Battery" />
      <ToggleIconButton
        on={isDark}
        iconOn={Sun}
        iconOff={Moon}
        onClick={onToggleTheme}
        ariaLabel="Toggle color mode"
      />
      <AvatarImage src={avatarSrc} alt={avatarAlt} />
    </div>
  )
}
