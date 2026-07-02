/**
 * pico surface. Screen group: SETTINGS — migrated to
 * atomic-design pages under pages/settings/, composed from
 * ui/{templates,molecules,atoms}. Thin compatibility barrel so screen-catalog's
 * `Settings.*Screen` names keep resolving. Shared label+control rows lifted into
 * the SettingRow molecule.
 */

export { AccountsSettings as AccountsSettingsScreen } from "../pages/settings/AccountsSettings"
export { DisplaySettings as DisplaySettingsScreen } from "../pages/settings/DisplaySettings"
export { LabsPanel as LabsPanelScreen } from "../pages/settings/LabsPanel"
export { NetworkSettings as NetworkSettingsScreen } from "../pages/settings/NetworkSettings"
export { StorageSettings as StorageSettingsScreen } from "../pages/settings/StorageSettings"
export { SystemPanel as SystemPanelScreen } from "../pages/settings/SystemPanel"
export { ThemeSettings as ThemeSettingsScreen } from "../pages/settings/ThemeSettings"
