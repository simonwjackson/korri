import { makeStaticDeviceFactsSourceLayer } from "@platform/device/device-facts-source"
import {
  unknownDeviceState,
  type DeviceState,
} from "@platform/device/device-facts"
import * as Atom from "effect/unstable/reactivity/Atom"

export const deviceFactsSourceLayerAtom = Atom.make(
  makeStaticDeviceFactsSourceLayer(),
)

export const deviceStateAtom = Atom.make<DeviceState>(unknownDeviceState())
