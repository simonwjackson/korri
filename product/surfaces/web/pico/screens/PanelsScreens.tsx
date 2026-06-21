/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: PANELS — side panels that PUSH the UI aside (not overlay it).
 * The main pane is its own `container-type: size` query container, so when the
 * drawer claims a slice of width the content reflows. Migrated to atomic-design
 * pages under pages/panels/, composed from the shared `PanelScreen` template +
 * ui/organisms drawers. This is a thin compatibility barrel so screen-catalog's
 * `Panels.*Screen` names keep resolving. Layout in screens/panels.css (pcPanel-).
 */
export { Filters as FiltersPanelScreen } from "../pages/panels/Filters"
export { Friends as FriendsPanelScreen } from "../pages/panels/Friends"
export { GameQuickLook as GameQuickLookPanelScreen } from "../pages/panels/GameQuickLook"
export { NowPlaying as NowPlayingPanelScreen } from "../pages/panels/NowPlaying"
export { QuickMenu as QuickMenuPanelScreen } from "../pages/panels/QuickMenu"
