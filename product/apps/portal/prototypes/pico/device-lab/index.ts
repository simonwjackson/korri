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
 * screenClassName + scaleVarPrefix, and author the design in cqw units against
 * `--<scaleVarPrefix>-text-scale` and `--<scaleVarPrefix>-pad-scale`.
 */
export { Calibrator, type DeviceCal } from "./Calibrator"
export { DeviceFrame } from "./DeviceFrame"
export { DeviceLab } from "./DeviceLab"
export type { DeviceConfig } from "./types"
