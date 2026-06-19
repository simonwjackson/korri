/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Single source of truth for the max-out STATE GALLERY: every distinct state
 * the pico theme can be in (current Korri + plausible future), each directly
 * reachable from the PicoGallery navigator. No flow wiring — every screen is
 * standalone and renders fake fixture data.
 *
 * Adding a screen: author it in screens/<Group>Screens.tsx, import it here, and
 * add a PicoScreen entry. Group css is side-effect-imported here so a new group
 * is wired in one place.
 */
import type { Screen } from "@tools/theme-workshop"
import { picoGames } from "./fixtures"
import { picoHero } from "./fixtures-extra"
import * as Acquire from "./screens/AcquireScreens"
import * as DataEffect from "./screens/DataEffectScreens"
import * as Detail from "./screens/DetailScreens"
import * as Future from "./screens/FutureScreens"
import * as InGame from "./screens/InGameScreens"
import * as Library from "./screens/LibraryScreens"
import * as Moments from "./screens/MomentsScreens"
import * as MultiDevice from "./screens/MultiDeviceScreens"
import * as Multiplayer from "./screens/MultiplayerScreens"
import * as Panels from "./screens/PanelsScreens"
import * as Personality from "./screens/PersonalityScreens"
import * as Session from "./screens/SessionScreens"
import * as Settings from "./screens/SettingsScreens"
import * as Showcase from "./screens/ShowcaseScreens"
import * as System from "./screens/SystemScreens"
import { VariantCartridgeShelf } from "./VariantCartridgeShelf"
import { VariantGameDetail } from "./VariantGameDetail"
import { VariantIconGrid } from "./VariantIconGrid"
import { VariantInGame } from "./VariantInGame"
import { VariantSettings } from "./VariantSettings"
import "./screens/acquire.css"
import "./screens/data.css"
import "./screens/detail.css"
import "./screens/future.css"
import "./screens/ingame.css"
import "./screens/library.css"
import "./screens/moments.css"
import "./screens/multidevice.css"
import "./screens/multiplayer.css"
import "./screens/panels.css"
import "./screens/personality.css"
import "./screens/session.css"
import "./screens/settings.css"
import "./screens/showcase.css"
import "./screens/system.css"

/** A pico screen is the kit's generic Screen; the alias keeps the local name. */
export type PicoScreen = Screen

/** Display order of the groups in the gallery. */
export const PICO_GROUPS: readonly string[] = [
  "Showcase",
  "Personality",
  "Library",
  "Detail",
  "Acquire",
  "Session",
  "In-Game",
  "Settings",
  "Multi-Device",
  "Multiplayer",
  "Panels",
  "System",
  "Future",
  "Data",
]

export const PICO_SCREENS: readonly PicoScreen[] = [
  // ── Showcase (the "more pop" iteration — art-forward, animated) ──────────
  {
    id: "show-spotlight",
    group: "Showcase",
    name: "Spotlight Home (animated)",
    note: "Content-first auto-rotating hero + coverflow",
    render: () => <Showcase.SpotlightHomeScreen />,
  },
  {
    id: "show-foryou",
    group: "Showcase",
    name: "For You — Shelves (animated)",
    note: "Curated contextual rows; no system picker / A–Z",
    render: () => <Showcase.ForYouShelvesScreen />,
  },
  {
    id: "show-lastplayed",
    group: "Showcase",
    name: "Last Played (big)",
    note: "Single-game cinematic 'jump back in' hero",
    render: () => <Showcase.LastPlayedScreen />,
  },
  {
    id: "show-resume",
    group: "Showcase",
    name: "Resume — Save State",
    note: "Pick up at your exact moment: progress + save chip",
    render: () => <Moments.ResumeScreen />,
  },
  {
    id: "show-tonight",
    group: "Showcase",
    name: "Tonight's Pick",
    note: "One confident recommendation with a reason + shuffle",
    render: () => <Moments.TonightPickScreen />,
  },
  {
    id: "show-quick",
    group: "Showcase",
    name: "Quick Session (20 min)",
    note: "Content-first by available time, not taxonomy",
    render: () => <Moments.QuickSessionScreen />,
  },
  {
    id: "show-friend",
    group: "Showcase",
    name: "Friend Is Playing",
    note: "Social hero: jump into a friend's game",
    render: () => <Moments.FriendPlayingScreen />,
  },
  {
    id: "show-victory",
    group: "Showcase",
    name: "Victory / Achievement",
    note: "The payoff moment + what's next",
    render: () => <Moments.VictoryScreen />,
  },
  {
    id: "show-fresh",
    group: "Showcase",
    name: "Fresh Install (ready)",
    note: "Download-just-finished payoff: NEW flash + big PLAY",
    render: () => <Moments.FreshInstallScreen />,
  },
  {
    id: "show-welcome",
    group: "Showcase",
    name: "Welcome Back",
    note: "Pixl-led re-entry after time away + what you missed",
    render: () => <Moments.WelcomeBackScreen />,
  },
  {
    id: "show-finish",
    group: "Showcase",
    name: "Finish It (one boss left)",
    note: "Completion nudge for a nearly-done game",
    render: () => <Moments.FinishItScreen />,
  },
  {
    id: "show-backlog",
    group: "Showcase",
    name: "Backlog Rescue",
    note: "Owned but never played — gentle nudge + dismiss",
    render: () => <Moments.BacklogScreen />,
  },
  {
    id: "show-mood",
    group: "Showcase",
    name: "Mood Picker",
    note: "Curate by feeling (Cozy / Intense / Weird), not genre",
    render: () => <Moments.MoodPickerScreen />,
  },

  // ── Personality (character experiments — mascot, rituals, attract) ──────
  {
    id: "per-home",
    group: "Personality",
    name: "Reactive Home (interactive)",
    note: "Hover carts: Pixl gazes, click to launch",
    render: () => <Personality.ReactiveHomeScreen />,
  },
  {
    id: "per-mascot",
    group: "Personality",
    name: "Mascot — Meet Pixl",
    note: "The OS companion sprite + its moods",
    render: () => <Personality.MascotScreen />,
  },
  {
    id: "per-launch",
    group: "Personality",
    name: "Launch Ritual (CRT power-on)",
    note: "Cartridge insert → CRT power-on loop",
    render: () => <Personality.LaunchRitualScreen />,
  },
  {
    id: "per-attract",
    group: "Personality",
    name: "Attract Mode",
    note: "Idle arcade loop: stars, logo, marquee",
    render: () => <Personality.AttractModeScreen />,
  },
  {
    id: "per-boot",
    group: "Personality",
    name: "Boot POST (voice)",
    note: "Voiced power-on self-test",
    render: () => <Personality.BootPostScreen />,
  },

  // ── Library ────────────────────────────────────────────────────────────
  {
    id: "lib-shelf",
    group: "Library",
    name: "Home — Cartridge Shelf",
    note: "Hero coverflow home (Variant A)",
    render: () => <VariantCartridgeShelf games={picoGames} />,
  },
  {
    id: "lib-grid",
    group: "Library",
    name: "Browse — Icon Grid",
    note: "Console home-OS grid (Variant C)",
    render: () => <VariantIconGrid games={picoGames} />,
  },
  {
    id: "lib-home-rail",
    group: "Library",
    name: "Home — Coverflow Rail",
    note: "Shift-style focused cart rail",
    render: () => <Library.HomeRailScreen />,
  },
  {
    id: "lib-console-picker",
    group: "Library",
    name: "Console Picker",
    render: () => <Library.ConsolePickerScreen />,
  },
  {
    id: "lib-collections",
    group: "Library",
    name: "Collections",
    render: () => <Library.CollectionsScreen />,
  },
  {
    id: "lib-continue",
    group: "Library",
    name: "Continue Playing",
    render: () => <Library.ContinuePlayingScreen />,
  },
  {
    id: "lib-search",
    group: "Library",
    name: "Search + Keyboard",
    render: () => <Library.SearchScreen />,
  },
  {
    id: "lib-search-empty",
    group: "Library",
    name: "Search — No Results",
    render: () => <Library.SearchEmptyScreen />,
  },
  {
    id: "lib-filter-sort",
    group: "Library",
    name: "Filter & Sort",
    render: () => <Library.FilterSortScreen />,
  },
  {
    id: "lib-loading",
    group: "Library",
    name: "Library — Loading",
    render: () => <Library.LibraryLoadingScreen />,
  },
  {
    id: "lib-empty",
    group: "Library",
    name: "Library — Empty",
    render: () => <Library.LibraryEmptyScreen />,
  },
  {
    id: "lib-error",
    group: "Library",
    name: "Library — Load Error",
    render: () => <Library.LibraryErrorScreen />,
  },
  {
    id: "lib-defect",
    group: "Library",
    name: "Library — Defect",
    render: () => <Library.LibraryDefectScreen />,
  },

  // ── Detail ─────────────────────────────────────────────────────────────
  {
    id: "det-detail",
    group: "Detail",
    name: "Game Detail",
    note: "Form-factor art seam (Variant D)",
    render: () => <VariantGameDetail games={picoGames} />,
  },
  {
    id: "det-releases",
    group: "Detail",
    name: "Release Picker",
    render: () => <Detail.ReleasePickerScreen />,
  },
  {
    id: "det-emulator",
    group: "Detail",
    name: "Emulator / App Chooser",
    render: () => <Detail.EmulatorChooserScreen />,
  },
  {
    id: "det-stats",
    group: "Detail",
    name: "Community Stats",
    render: () => <Detail.CommunityStatsScreen />,
  },
  {
    id: "det-media",
    group: "Detail",
    name: "Screenshot Gallery",
    render: () => <Detail.MediaGalleryScreen />,
  },
  {
    id: "det-notinstalled",
    group: "Detail",
    name: "Not Installed",
    render: () => <Detail.NotInstalledScreen />,
  },

  // ── Acquire ────────────────────────────────────────────────────────────
  {
    id: "acq-confirm",
    group: "Acquire",
    name: "Download Confirm",
    render: () => <Acquire.DownloadConfirmScreen />,
  },
  {
    id: "acq-downloading",
    group: "Acquire",
    name: "Downloading",
    render: () => <Acquire.DownloadingScreen />,
  },
  {
    id: "acq-browser",
    group: "Acquire",
    name: "Open in Browser",
    render: () => <Acquire.OpenInBrowserScreen />,
  },
  {
    id: "acq-failed",
    group: "Acquire",
    name: "Download Failed",
    render: () => <Acquire.DownloadFailedScreen />,
  },
  {
    id: "acq-installing",
    group: "Acquire",
    name: "Installing Runtime",
    render: () => <Acquire.InstallingScreen />,
  },
  {
    id: "acq-ready",
    group: "Acquire",
    name: "Installed / Ready",
    render: () => <Acquire.InstalledScreen />,
  },
  {
    id: "acq-update",
    group: "Acquire",
    name: "Update Available",
    render: () => <Acquire.UpdateAvailableScreen />,
  },
  {
    id: "acq-repair",
    group: "Acquire",
    name: "Repair / Verify",
    render: () => <Acquire.RepairScreen />,
  },

  // ── Session ────────────────────────────────────────────────────────────
  {
    id: "ses-launching",
    group: "Session",
    name: "Gate — Launching",
    render: () => <Session.LaunchingScreen />,
  },
  {
    id: "ses-blocked",
    group: "Session",
    name: "Gate — Blocked",
    render: () => <Session.BlockedScreen />,
  },
  {
    id: "ses-unknown",
    group: "Session",
    name: "Gate — Unknown Status",
    render: () => <Session.UnknownStatusScreen />,
  },
  {
    id: "ses-failure",
    group: "Session",
    name: "Launch Failure",
    render: () => <Session.LaunchFailureScreen />,
  },
  {
    id: "ses-boot",
    group: "Session",
    name: "Boot Sequence",
    render: () => <Session.BootSequenceScreen />,
  },
  {
    id: "ses-exiting",
    group: "Session",
    name: "Exiting / Teardown",
    render: () => <Session.ExitingScreen />,
  },
  {
    id: "ses-cooling",
    group: "Session",
    name: "Cooling Down",
    render: () => <Session.CoolingScreen />,
  },
  {
    id: "ses-recovery",
    group: "Session",
    name: "Recovery",
    render: () => <Session.RecoveryScreen />,
  },
  {
    id: "ses-crash",
    group: "Session",
    name: "Crash",
    render: () => <Session.CrashScreen />,
  },

  // ── In-Game ────────────────────────────────────────────────────────────
  {
    id: "ig-pause",
    group: "In-Game",
    name: "In-Game Pause",
    note: "Pause overlay, local/stream (Variant E)",
    render: () => (picoHero ? <VariantInGame game={picoHero} /> : null),
  },
  {
    id: "ig-hud",
    group: "In-Game",
    name: "In-Game HUD",
    render: () => <InGame.InGameHudScreen />,
  },
  {
    id: "ig-save",
    group: "In-Game",
    name: "Save State Slots",
    render: () => <InGame.SaveSlotsScreen />,
  },
  {
    id: "ig-load",
    group: "In-Game",
    name: "Load State Slots",
    render: () => <InGame.LoadSlotsScreen />,
  },
  {
    id: "ig-stream",
    group: "In-Game",
    name: "Stream Overlay",
    render: () => <InGame.StreamOverlayScreen />,
  },
  {
    id: "ig-reconnect",
    group: "In-Game",
    name: "Stream Reconnecting",
    render: () => <InGame.ReconnectingScreen />,
  },
  {
    id: "ig-remap",
    group: "In-Game",
    name: "Input Remap",
    render: () => <InGame.InputRemapScreen />,
  },

  // ── Settings ───────────────────────────────────────────────────────────
  {
    id: "set-settings",
    group: "Settings",
    name: "Settings (two-pane)",
    note: "Category list + controls (Variant B)",
    render: () => <VariantSettings />,
  },
  {
    id: "set-display",
    group: "Settings",
    name: "Display & Video",
    render: () => <Settings.DisplaySettingsScreen />,
  },
  {
    id: "set-network",
    group: "Settings",
    name: "Network & Streaming",
    render: () => <Settings.NetworkSettingsScreen />,
  },
  {
    id: "set-storage",
    group: "Settings",
    name: "Storage",
    render: () => <Settings.StorageSettingsScreen />,
  },
  {
    id: "set-themes",
    group: "Settings",
    name: "Themes",
    render: () => <Settings.ThemeSettingsScreen />,
  },
  {
    id: "set-accounts",
    group: "Settings",
    name: "Accounts & Profiles",
    render: () => <Settings.AccountsSettingsScreen />,
  },
  {
    id: "set-labs",
    group: "Settings",
    name: "Labs Panel",
    render: () => <Settings.LabsPanelScreen />,
  },
  {
    id: "set-syspanel",
    group: "Settings",
    name: "System Panel",
    render: () => <Settings.SystemPanelScreen />,
  },

  // ── Multi-Device ─────────────────────────────────────────────────────────
  {
    id: "md-primary",
    group: "Multi-Device",
    name: "Dual-Screen Primary",
    render: () => <MultiDevice.DualPrimaryScreen />,
  },
  {
    id: "md-companion",
    group: "Multi-Device",
    name: "Dual-Screen Companion",
    render: () => <MultiDevice.DualCompanionScreen />,
  },
  {
    id: "md-discovery",
    group: "Multi-Device",
    name: "Stream Host Discovery",
    render: () => <MultiDevice.HostDiscoveryScreen />,
  },
  {
    id: "md-hosts",
    group: "Multi-Device",
    name: "Host List",
    render: () => <MultiDevice.HostListScreen />,
  },
  {
    id: "md-connecting",
    group: "Multi-Device",
    name: "Connecting",
    render: () => <MultiDevice.ConnectingScreen />,
  },
  {
    id: "md-seats",
    group: "Multi-Device",
    name: "Seat / Device Manager",
    render: () => <MultiDevice.SeatManagerScreen />,
  },
  {
    id: "md-pairing",
    group: "Multi-Device",
    name: "Pairing",
    render: () => <MultiDevice.PairingScreen />,
  },

  // ── Multiplayer (player-facing: lobby feels, player reps, hub + inline) ──
  {
    id: "mp-hub",
    group: "Multiplayer",
    name: "Players & Devices Hub",
    note: "Art-forward hub (the 'where it lives' hub option)",
    render: () => <Multiplayer.HubScreen />,
  },
  {
    id: "mp-players",
    group: "Multiplayer",
    name: "Player Styles (compare)",
    note: "All 4 player representations side by side",
    render: () => <Multiplayer.PlayerStylesScreen />,
  },
  {
    id: "mp-lobby-art",
    group: "Multiplayer",
    name: "Lobby · Art-Forward",
    note: "Feel 1: big art, players quiet along the bottom",
    render: () => <Multiplayer.LobbyArtScreen />,
  },
  {
    id: "mp-lobby-crew",
    group: "Multiplayer",
    name: "Lobby · Crew (retro ritual)",
    note: "Feel 2: playful 'gather your crew', Pixl-driven",
    render: () => <Multiplayer.LobbyCrewScreen />,
  },
  {
    id: "mp-countdown",
    group: "Multiplayer",
    name: "Lobby · Ready & Countdown",
    render: () => <Multiplayer.CountdownScreen />,
  },
  {
    id: "mp-nearby",
    group: "Multiplayer",
    name: "Nearby Devices (found)",
    render: () => <Multiplayer.NearbyScreen />,
  },
  {
    id: "mp-join",
    group: "Multiplayer",
    name: "Join by Code / QR",
    render: () => <Multiplayer.JoinCodeScreen />,
  },
  {
    id: "mp-invite",
    group: "Multiplayer",
    name: "Invite a Friend (remote)",
    render: () => <Multiplayer.InviteScreen />,
  },
  {
    id: "mp-joining",
    group: "Multiplayer",
    name: "Joining Session",
    render: () => <Multiplayer.JoiningScreen />,
  },
  {
    id: "mp-failed",
    group: "Multiplayer",
    name: "Couldn't Connect",
    render: () => <Multiplayer.JoinFailedScreen />,
  },
  {
    id: "mp-seats",
    group: "Multiplayer",
    name: "Seat & Controller Assign",
    render: () => <Multiplayer.SeatAssignScreen />,
  },
  {
    id: "mp-session",
    group: "Multiplayer",
    name: "In-Session Players HUD",
    render: () => <Multiplayer.SessionHudScreen />,
  },
  {
    id: "mp-toast",
    group: "Multiplayer",
    name: "Player Joined Toast",
    render: () => <Multiplayer.PlayerToastScreen />,
  },
  {
    id: "mp-inline",
    group: "Multiplayer",
    name: "Inline Seat Strip",
    note: "The no-hub placement: persistent seat strip on home",
    render: () => <Multiplayer.InlineStripScreen />,
  },

  // ── Panels (side panels that PUSH the UI aside, not overlay) ─────────────
  {
    id: "pan-quickmenu",
    group: "Panels",
    name: "Quick Menu (control center)",
    note: "Right drawer pushes home left; content reflows narrower",
    render: () => <Panels.QuickMenuPanelScreen />,
  },
  {
    id: "pan-quicklook",
    group: "Panels",
    name: "Game Quick-Look",
    note: "Focus a cart → detail panel; rail compresses (master-detail)",
    render: () => <Panels.GameQuickLookPanelScreen />,
  },
  {
    id: "pan-friends",
    group: "Panels",
    name: "Friends / Party Rail",
    note: "Right drawer of presence; grid slides left",
    render: () => <Panels.FriendsPanelScreen />,
  },
  {
    id: "pan-filters",
    group: "Panels",
    name: "Filters & Collections",
    note: "Left drawer; the library grid reflows live as you filter",
    render: () => <Panels.FiltersPanelScreen />,
  },
  {
    id: "pan-nowplaying",
    group: "Panels",
    name: "Now-Playing Dock",
    note: "In-session sidebar pushes the game aside (not a full pause)",
    render: () => <Panels.NowPlayingPanelScreen />,
  },

  // ── System ─────────────────────────────────────────────────────────────
  {
    id: "sys-boot",
    group: "System",
    name: "Boot Splash",
    render: () => <System.BootSplashScreen />,
  },
  {
    id: "sys-onboard",
    group: "System",
    name: "First-Run Welcome",
    render: () => <System.OnboardingScreen />,
  },
  {
    id: "sys-power",
    group: "System",
    name: "Power Menu",
    render: () => <System.PowerMenuScreen />,
  },
  {
    id: "sys-update",
    group: "System",
    name: "System Update",
    render: () => <System.SystemUpdateScreen />,
  },
  {
    id: "sys-batt",
    group: "System",
    name: "Battery Low",
    render: () => <System.BatteryLowScreen />,
  },
  {
    id: "sys-panic",
    group: "System",
    name: "Panic / Fatal Error",
    render: () => <System.PanicScreen />,
  },
  {
    id: "sys-toast",
    group: "System",
    name: "Notification Toast",
    render: () => <System.NotificationToastScreen />,
  },
  {
    id: "sys-devbadge",
    group: "System",
    name: "Developer ISO Badge",
    render: () => <System.DeveloperBadgeScreen />,
  },

  // ── Future ─────────────────────────────────────────────────────────────
  {
    id: "fut-friends",
    group: "Future",
    name: "Friends & Presence",
    render: () => <Future.FriendsScreen />,
  },
  {
    id: "fut-activity",
    group: "Future",
    name: "Activity Feed",
    render: () => <Future.ActivityFeedScreen />,
  },
  {
    id: "fut-achieve",
    group: "Future",
    name: "Achievements",
    render: () => <Future.AchievementsScreen />,
  },
  {
    id: "fut-leaderboard",
    group: "Future",
    name: "Leaderboards",
    render: () => <Future.LeaderboardScreen />,
  },
  {
    id: "fut-profile",
    group: "Future",
    name: "Profile",
    render: () => <Future.ProfileScreen />,
  },
  {
    id: "fut-cloudsave",
    group: "Future",
    name: "Cloud Save Conflict",
    render: () => <Future.CloudSaveConflictScreen />,
  },
  {
    id: "fut-store",
    group: "Future",
    name: "Store / Discovery",
    render: () => <Future.StoreScreen />,
  },
  {
    id: "fut-featured",
    group: "Future",
    name: "Featured / Game of the Day",
    render: () => <Future.FeaturedScreen />,
  },

  // ── Data (Effect v4 mount-without-mocking shape) ─────────────────────────
  {
    id: "data-effect",
    group: "Data",
    name: "Effect Layer Swap (Fixtures/Live)",
    note: "v4 shape: same screen, swap the provided layer — no mocking",
    render: () => <DataEffect.DataEffectScreen />,
  },
]

export function findScreen(id: string): PicoScreen {
  return PICO_SCREENS.find(screen => screen.id === id) ?? PICO_SCREENS[0]
}

export const PICO_FIRST_SCREEN = PICO_SCREENS[0]?.id ?? "lib-shelf"
