/**
 * pico surface. Screen group: ACQUIRE — migrated to
 * atomic-design pages under pages/acquire/, composed from
 * ui/{templates,organisms,molecules,atoms}. Thin compatibility barrel so
 * screen-catalog's `Acquire.*Screen` names keep resolving.
 */
export { DownloadConfirm as DownloadConfirmScreen } from "../pages/acquire/DownloadConfirm"
export { DownloadFailed as DownloadFailedScreen } from "../pages/acquire/DownloadFailed"
export { Downloading as DownloadingScreen } from "../pages/acquire/Downloading"
export { Installed as InstalledScreen } from "../pages/acquire/Installed"
export { Installing as InstallingScreen } from "../pages/acquire/Installing"
export { OpenInBrowser as OpenInBrowserScreen } from "../pages/acquire/OpenInBrowser"
export { Repair as RepairScreen } from "../pages/acquire/Repair"
export { UpdateAvailable as UpdateAvailableScreen } from "../pages/acquire/UpdateAvailable"
