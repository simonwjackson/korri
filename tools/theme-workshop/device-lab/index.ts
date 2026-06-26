/**
 * device-lab — reusable physical-calibration harness (prototype kit).
 *
 * Usage:
 *   import { DeviceLab, type DeviceConfig } from "./device-lab"
 *   import "./device-lab/device-lab.css"
 *
 *   <DeviceLab storageKey="my-template" devices={DEVICES} render={() => <MyDesign />} />
 *
 * Skin it with stageClassName / screensClassName / bezelClassName /
 * screenClassName, and author the design in cqw units so it fills the screen
 * container at any physical size.
 */
export { Calibrator, type DeviceCal } from "./Calibrator"
export { clusterOuterHeightPx, deviceScreens } from "./device-screens"
export { DeviceFrame } from "./DeviceFrame"
export { DeviceLab } from "./DeviceLab"
export type { DeviceConfig, ScreenConfig, ThemeKnob } from "./types"
