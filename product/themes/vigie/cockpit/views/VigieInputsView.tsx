import { VigieInputDevices } from "../components/VigieInputDevices"
import { VigieInputMonitor } from "../components/VigieInputMonitor"
import { VigieSubsystemPanel } from "../components/VigieSubsystemPanel"

// Inputs — connected devices, a live input monitor, and input-daemon health.

export function VigieInputsView() {
  return (
    <main className="vigie-view">
      <div className="vigie-two-col">
        <VigieInputDevices />
        <VigieInputMonitor />
      </div>
      <VigieSubsystemPanel />
    </main>
  )
}
