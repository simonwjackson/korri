/**
 * pico surface. Screen group: LIBRARY — migrated to
 * atomic-design pages under pages/library/, composed from
 * ui/{templates,organisms,molecules,atoms}. This file is now a thin
 * compatibility barrel so screen-catalog's `Library.*Screen` names keep
 * resolving. The loading/empty/error/defect pages still seed PicoLibrary
 * behavior layers via PicoData and let AsyncResult branch.
 */

export { Collections as CollectionsScreen } from "../pages/library/Collections"
export { ConsolePicker as ConsolePickerScreen } from "../pages/library/ConsolePicker"
export { ContinuePlaying as ContinuePlayingScreen } from "../pages/library/ContinuePlaying"
export { FilterSort as FilterSortScreen } from "../pages/library/FilterSort"
export { HomeRail as HomeRailScreen } from "../pages/library/HomeRail"
export { LibraryDefect as LibraryDefectScreen } from "../pages/library/LibraryDefect"
export { LibraryEmpty as LibraryEmptyScreen } from "../pages/library/LibraryEmpty"
export { LibraryError as LibraryErrorScreen } from "../pages/library/LibraryError"
export { LibraryLoading as LibraryLoadingScreen } from "../pages/library/LibraryLoading"
export { Search as SearchScreen } from "../pages/library/Search"
export { SearchEmpty as SearchEmptyScreen } from "../pages/library/SearchEmpty"
