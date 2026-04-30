import { AppShell } from "./components/AppShell/AppShell"
import { AppShellCanvas } from "./components/AppShell/components/AppShellCanvas"
import { AppShellInspector } from "./components/AppShell/components/AppShellInspector"
import { AppShellLeftRail } from "./components/AppShell/components/AppShellLeftRail"
import { AppShellTopBar } from "./components/AppShell/components/AppShellTopBar"

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
