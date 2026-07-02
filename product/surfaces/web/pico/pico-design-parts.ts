export type PicoDesignPartLayer =
  | "page"
  | "template"
  | "organism"
  | "molecule"
  | "atom"

export interface PicoDesignPart {
  readonly id: string
  readonly layer: PicoDesignPartLayer
  readonly name: string
}

/**
 * Every pico design part, one source of truth. The reusable kit (atom to
 * template) carries data-korri tags on its component root for lab pick-mode;
 * gallery pages are identified by story/pagePartId (only the routed device
 * pages get a distinct page tag), mirroring the Shift precedent.
 */
export const PICO_DESIGN_PARTS = {
  // --- pages (routed, device-mounted) ---
  home: { id: "pico.home", layer: "page", name: "Home" },
  gameDetail: { id: "pico.game-detail", layer: "page", name: "Game Detail" },
  // --- chrome ---
  statusBar: { id: "pico.status-bar", layer: "molecule", name: "Status Bar" },
  // --- templates ---
  gameOverlay: {
    id: "pico.game-overlay",
    layer: "template",
    name: "Game Overlay",
  },
  panelScreen: {
    id: "pico.panel-screen",
    layer: "template",
    name: "Panel Screen",
  },
  screenShell: {
    id: "pico.screen-shell",
    layer: "template",
    name: "Screen Shell",
  },
  // --- organisms ---
  achievementList: {
    id: "pico.achievement-list",
    layer: "organism",
    name: "Achievement List",
  },
  appChoiceList: {
    id: "pico.app-choice-list",
    layer: "organism",
    name: "App Choice List",
  },
  attractLoop: {
    id: "pico.attract-loop",
    layer: "organism",
    name: "Attract Loop",
  },
  bootStepper: {
    id: "pico.boot-stepper",
    layer: "organism",
    name: "Boot Stepper",
  },
  collectionList: {
    id: "pico.collection-list",
    layer: "organism",
    name: "Collection List",
  },
  communityStatPanel: {
    id: "pico.community-stat-panel",
    layer: "organism",
    name: "Community Stat Panel",
  },
  companionCard: {
    id: "pico.companion-card",
    layer: "organism",
    name: "Companion Card",
  },
  continueList: {
    id: "pico.continue-list",
    layer: "organism",
    name: "Continue List",
  },
  controlCenter: {
    id: "pico.control-center",
    layer: "organism",
    name: "Control Center",
  },
  countdownStage: {
    id: "pico.countdown-stage",
    layer: "organism",
    name: "Countdown Stage",
  },
  coverflowRail: {
    id: "pico.coverflow-rail",
    layer: "organism",
    name: "Coverflow Rail",
  },
  crewLobby: { id: "pico.crew-lobby", layer: "organism", name: "Crew Lobby" },
  downloadConfirmCard: {
    id: "pico.download-confirm-card",
    layer: "organism",
    name: "Download Confirm Card",
  },
  downloadProgress: {
    id: "pico.download-progress",
    layer: "organism",
    name: "Download Progress",
  },
  dualPrimaryStage: {
    id: "pico.dual-primary-stage",
    layer: "organism",
    name: "Dual Primary Stage",
  },
  failureList: {
    id: "pico.failure-list",
    layer: "organism",
    name: "Failure List",
  },
  featuredToday: {
    id: "pico.featured-today",
    layer: "organism",
    name: "Featured Today",
  },
  filterSortPanel: {
    id: "pico.filter-sort-panel",
    layer: "organism",
    name: "Filter Sort Panel",
  },
  filtersPanel: {
    id: "pico.filters-panel",
    layer: "organism",
    name: "Filters Panel",
  },
  friendsList: {
    id: "pico.friends-list",
    layer: "organism",
    name: "Friends List",
  },
  friendsPanel: {
    id: "pico.friends-panel",
    layer: "organism",
    name: "Friends Panel",
  },
  hero: { id: "pico.hero", layer: "organism", name: "Hero" },
  hostCardList: {
    id: "pico.host-card-list",
    layer: "organism",
    name: "Host Card List",
  },
  hostScanList: {
    id: "pico.host-scan-list",
    layer: "organism",
    name: "Host Scan List",
  },
  hudOverlay: {
    id: "pico.hud-overlay",
    layer: "organism",
    name: "Hud Overlay",
  },
  inlineSeatStrip: {
    id: "pico.inline-seat-strip",
    layer: "organism",
    name: "Inline Seat Strip",
  },
  installProgress: {
    id: "pico.install-progress",
    layer: "organism",
    name: "Install Progress",
  },
  inviteList: {
    id: "pico.invite-list",
    layer: "organism",
    name: "Invite List",
  },
  joiningStage: {
    id: "pico.joining-stage",
    layer: "organism",
    name: "Joining Stage",
  },
  lastPlayedHero: {
    id: "pico.last-played-hero",
    layer: "organism",
    name: "Last Played Hero",
  },
  launchingStage: {
    id: "pico.launching-stage",
    layer: "organism",
    name: "Launching Stage",
  },
  launchTube: {
    id: "pico.launch-tube",
    layer: "organism",
    name: "Launch Tube",
  },
  leaderboardTable: {
    id: "pico.leaderboard-table",
    layer: "organism",
    name: "Leaderboard Table",
  },
  libraryRail: {
    id: "pico.library-rail",
    layer: "organism",
    name: "Library Rail",
  },
  lobbyArtStage: {
    id: "pico.lobby-art-stage",
    layer: "organism",
    name: "Lobby Art Stage",
  },
  miniHome: { id: "pico.mini-home", layer: "organism", name: "Mini Home" },
  modal: { id: "pico.modal", layer: "organism", name: "Modal" },
  momentHero: {
    id: "pico.moment-hero",
    layer: "organism",
    name: "Moment Hero",
  },
  onScreenKeyboard: {
    id: "pico.on-screen-keyboard",
    layer: "organism",
    name: "On Screen Keyboard",
  },
  playersHub: {
    id: "pico.players-hub",
    layer: "organism",
    name: "Players Hub",
  },
  playerStyleMatrix: {
    id: "pico.player-style-matrix",
    layer: "organism",
    name: "Player Style Matrix",
  },
  playerToast: {
    id: "pico.player-toast",
    layer: "organism",
    name: "Player Toast",
  },
  profileCard: {
    id: "pico.profile-card",
    layer: "organism",
    name: "Profile Card",
  },
  quickLook: { id: "pico.quick-look", layer: "organism", name: "Quick Look" },
  reactiveStage: {
    id: "pico.reactive-stage",
    layer: "organism",
    name: "Reactive Stage",
  },
  releaseList: {
    id: "pico.release-list",
    layer: "organism",
    name: "Release List",
  },
  remapList: { id: "pico.remap-list", layer: "organism", name: "Remap List" },
  repairProgress: {
    id: "pico.repair-progress",
    layer: "organism",
    name: "Repair Progress",
  },
  runningGame: {
    id: "pico.running-game",
    layer: "organism",
    name: "Running Game",
  },
  saveSlotGrid: {
    id: "pico.save-slot-grid",
    layer: "organism",
    name: "Save Slot Grid",
  },
  screenshotGallery: {
    id: "pico.screenshot-gallery",
    layer: "organism",
    name: "Screenshot Gallery",
  },
  searchResults: {
    id: "pico.search-results",
    layer: "organism",
    name: "Search Results",
  },
  seatAssignList: {
    id: "pico.seat-assign-list",
    layer: "organism",
    name: "Seat Assign List",
  },
  seatList: { id: "pico.seat-list", layer: "organism", name: "Seat List" },
  sessionDock: {
    id: "pico.session-dock",
    layer: "organism",
    name: "Session Dock",
  },
  sessionPlayersHud: {
    id: "pico.session-players-hud",
    layer: "organism",
    name: "Session Players Hud",
  },
  shelfGrid: { id: "pico.shelf-grid", layer: "organism", name: "Shelf Grid" },
  spotlightHero: {
    id: "pico.spotlight-hero",
    layer: "organism",
    name: "Spotlight Hero",
  },
  storeView: { id: "pico.store-view", layer: "organism", name: "Store View" },
  streamPanel: {
    id: "pico.stream-panel",
    layer: "organism",
    name: "Stream Panel",
  },
  systemGrid: {
    id: "pico.system-grid",
    layer: "organism",
    name: "System Grid",
  },
  updatePanel: {
    id: "pico.update-panel",
    layer: "organism",
    name: "Update Panel",
  },
  // --- molecules ---
  card: { id: "pico.card", layer: "molecule", name: "Card" },
  detailHead: {
    id: "pico.detail-head",
    layer: "molecule",
    name: "Detail Head",
  },
  gameCart: { id: "pico.game-cart", layer: "molecule", name: "Game Cart" },
  gameCartUnmarked: {
    id: "pico.game-cart-unmarked",
    layer: "molecule",
    name: "Game Cart Unmarked",
  },
  gameLogo: { id: "pico.game-logo", layer: "molecule", name: "Game Logo" },
  hostBadge: { id: "pico.host-badge", layer: "molecule", name: "Host Badge" },
  keyArtBackdrop: {
    id: "pico.key-art-backdrop",
    layer: "molecule",
    name: "Key Art Backdrop",
  },
  list: { id: "pico.list", layer: "molecule", name: "List" },
  opt: { id: "pico.opt", layer: "molecule", name: "Opt" },
  playCta: { id: "pico.play-cta", layer: "molecule", name: "Play Cta" },
  player: { id: "pico.player", layer: "molecule", name: "Player" },
  qualityBar: {
    id: "pico.quality-bar",
    layer: "molecule",
    name: "Quality Bar",
  },
  row: { id: "pico.row", layer: "molecule", name: "Row" },
  searchQuery: {
    id: "pico.search-query",
    layer: "molecule",
    name: "Search Query",
  },
  settingRow: {
    id: "pico.setting-row",
    layer: "molecule",
    name: "Setting Row",
  },
  tabs: { id: "pico.tabs", layer: "molecule", name: "Tabs" },
  // --- atoms ---
  badge: { id: "pico.badge", layer: "atom", name: "Badge" },
  blockBar: { id: "pico.block-bar", layer: "atom", name: "Block Bar" },
  btn: { id: "pico.btn", layer: "atom", name: "Btn" },
  chip: { id: "pico.chip", layer: "atom", name: "Chip" },
  dim: { id: "pico.dim", layer: "atom", name: "Dim" },
  glyph: { id: "pico.glyph", layer: "atom", name: "Glyph" },
  icon: { id: "pico.icon", layer: "atom", name: "Icon" },
  progress: { id: "pico.progress", layer: "atom", name: "Progress" },
  spinner: { id: "pico.spinner", layer: "atom", name: "Spinner" },
  stat: { id: "pico.stat", layer: "atom", name: "Stat" },
  sub: { id: "pico.sub", layer: "atom", name: "Sub" },
  title: { id: "pico.title", layer: "atom", name: "Title" },
  toggle: { id: "pico.toggle", layer: "atom", name: "Toggle" },
} as const satisfies Record<string, PicoDesignPart>

export function picoDesignPartAttrs(
  part: PicoDesignPart,
  instanceId?: string,
): Record<string, string> {
  return {
    "data-korri-part": part.id,
    "data-korri-layer": part.layer,
    "data-korri-name": part.name,
    ...(instanceId ? { "data-korri-instance-id": instanceId } : {}),
  }
}
