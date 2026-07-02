/**
 * pico surface. Screen group: SYSTEM — migrated to
 * atomic-design pages under pages/system/, composed from ui/{templates,atoms}.
 * Thin compatibility barrel so screen-catalog's `System.*Screen` names keep
 * resolving. All screens are static system chrome.
 */

export { BatteryLow as BatteryLowScreen } from "../pages/system/BatteryLow"
export { BootSplash as BootSplashScreen } from "../pages/system/BootSplash"
export { DeveloperBadge as DeveloperBadgeScreen } from "../pages/system/DeveloperBadge"
export { NotificationToast as NotificationToastScreen } from "../pages/system/NotificationToast"
export { Onboarding as OnboardingScreen } from "../pages/system/Onboarding"
export { Panic as PanicScreen } from "../pages/system/Panic"
export { PowerMenu as PowerMenuScreen } from "../pages/system/PowerMenu"
export { SystemUpdate as SystemUpdateScreen } from "../pages/system/SystemUpdate"
