import { createRootRoute, Outlet } from "@tanstack/react-router"
import { Suspense } from "react"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
          Loading...
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}
