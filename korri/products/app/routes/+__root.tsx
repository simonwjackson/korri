import { FeatureGatesPanel } from "@shared/gates/FeatureGatesPanel"
import { FeatureGatesProvider } from "@shared/gates/FeatureGatesProvider"
import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Suspense } from "react"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <FeatureGatesProvider>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
            Loading...
          </div>
        }
      >
        <Outlet />
      </Suspense>
      <FeatureGatesPanel />
    </FeatureGatesProvider>
  )
}
