import {
  SidebarInset,
  SidebarProvider,
} from "@platform/react/primitives/components/ui/sidebar"
import type { ReactNode } from "react"
import { VigieAppSidebar } from "./VigieAppSidebar"
import { VigieHeader } from "./VigieHeader"

// shadcn-admin app-shell: collapsible sidebar + header + inset content.
// `.vigie-root.dark` retunes shadcn tokens to the cockpit palette so the
// chrome and the instrument content read as one surface.

export function VigieShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="vigie-root dark">
      <SidebarProvider>
        <VigieAppSidebar />
        <SidebarInset>
          <VigieHeader />
          {children}
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
