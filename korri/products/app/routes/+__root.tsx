import { ConnectionGate } from "@app/features/connection/ConnectionGate"
import { createFocusRestore } from "@shared/navigation/focus-restore"
import { useInputAction } from "@shared/navigation/use-input-action"
import {
  createRootRoute,
  Outlet,
  useCanGoBack,
  useRouter,
} from "@tanstack/react-router"
import { Suspense, useEffect, useMemo } from "react"

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const focusRestore = useMemo(() => createFocusRestore(), [])

  useInputAction("back", () => {
    if (canGoBack) router.history.back()
  })

  useEffect(() => {
    const stopBeforeNavigate = router.subscribe("onBeforeNavigate", event => {
      if (event.pathChanged && event.fromLocation) {
        focusRestore.capture(event.fromLocation.pathname)
      }
    })
    const stopRendered = router.subscribe("onRendered", event => {
      if (event.pathChanged) focusRestore.restore(event.toLocation.pathname)
    })

    return () => {
      stopBeforeNavigate()
      stopRendered()
      focusRestore.clear()
    }
  }, [focusRestore, router])

  return (
    <ConnectionGate>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
            Loading...
          </div>
        }
      >
        <Outlet />
      </Suspense>
    </ConnectionGate>
  )
}
