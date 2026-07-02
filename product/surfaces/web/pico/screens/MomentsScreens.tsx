/**
 * pico surface.
 * Gallery group: SHOWCASE — single-game "moment" heroes (art-forward,
 * content-first; no rails/lists). Migrated to atomic-design pages under
 * pages/moments/, composed from ui/{templates,organisms,molecules,atoms} around
 * the shared `MomentHero` organism. This is a thin compatibility barrel so
 * screen-catalog's `Moments.*Screen` names keep resolving. Layout in
 * screens/moments.css (pcM-).
 */
export { Backlog as BacklogScreen } from "../pages/moments/Backlog"
export { FinishIt as FinishItScreen } from "../pages/moments/FinishIt"
export { FreshInstall as FreshInstallScreen } from "../pages/moments/FreshInstall"
export { FriendPlaying as FriendPlayingScreen } from "../pages/moments/FriendPlaying"
export { MoodPicker as MoodPickerScreen } from "../pages/moments/MoodPicker"
export { QuickSession as QuickSessionScreen } from "../pages/moments/QuickSession"
export { Resume as ResumeScreen } from "../pages/moments/Resume"
export { TonightPick as TonightPickScreen } from "../pages/moments/TonightPick"
export { Victory as VictoryScreen } from "../pages/moments/Victory"
export { WelcomeBack as WelcomeBackScreen } from "../pages/moments/WelcomeBack"
