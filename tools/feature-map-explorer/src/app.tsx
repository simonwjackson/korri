import { AppShell } from "./components/AppShell"
import { AppShellCanvas } from "./components/AppShellCanvas"
import { AppShellInspector } from "./components/AppShellInspector"
import { AppShellLeftRail } from "./components/AppShellLeftRail"
import { AppShellTopBar } from "./components/AppShellTopBar"

export function App() {
  return (
    <AppShell>
      <AppShellTopBar />
      <AppShellLeftRail />
      <AppShellCanvas />
      <AppShellInspector />
    </AppShell>
  )
}
