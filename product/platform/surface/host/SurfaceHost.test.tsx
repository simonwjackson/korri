import { describe, expect, it } from "bun:test"
import type {
  KorriPlatformBridge,
  KorriSurfaceEntrypoint,
} from "@platform/surface/bridge"
import { render, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { PlatformBridgeProvider } from "./platform-bridge-context"
import { SurfaceHost } from "./SurfaceHost"

const bridge: KorriPlatformBridge = {
  library: {
    list: async () => [],
    launch: async () => {},
  },
  input: {
    subscribe: () => () => {},
  },
  foregroundSession: {
    get: async () => ({ _tag: "Ready" }),
  },
  api: {
    rpc: async () => ({}),
  },
}

describe("SurfaceHost", () => {
  it("mounts a selected surface entrypoint with the platform bridge", async () => {
    let receivedBridge: KorriPlatformBridge | undefined
    const entrypoint: KorriSurfaceEntrypoint = {
      id: "shift",
      mount(host, context) {
        receivedBridge = context.bridge
        host.textContent = "mounted"
        return undefined
      },
    }

    const screen = renderHost(async () => entrypoint)

    await waitFor(() => {
      expect(screen.getByText("mounted")).not.toBeNull()
    })
    expect(receivedBridge).toBe(bridge)
  })

  it("shows load failures and clears them when a later selection loads", async () => {
    const entrypoint: KorriSurfaceEntrypoint = {
      id: "evier",
      mount(host) {
        host.textContent = "evier mounted"
        return undefined
      },
    }
    const failingLoader = async () => {
      throw new Error("boom")
    }
    const passingLoader = async () => entrypoint

    const screen = renderHost(failingLoader)
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("boom")
    })

    screen.rerender(hostElement(passingLoader, "evier"))

    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull()
      expect(screen.getByText("evier mounted")).not.toBeNull()
    })
  })

  it("disposes the mounted surface on unmount", async () => {
    let disposed = false
    const entrypoint: KorriSurfaceEntrypoint = {
      id: "shift",
      mount(host) {
        host.textContent = "mounted"
        return () => {
          disposed = true
        }
      },
    }

    const screen = renderHost(async () => entrypoint)
    await waitFor(() => {
      expect(screen.getByText("mounted")).not.toBeNull()
    })

    screen.unmount()
    expect(disposed).toBe(true)
  })
})

function renderHost(
  loadEntrypoint: ComponentProps<typeof SurfaceHost>["loadEntrypoint"],
) {
  return render(hostElement(loadEntrypoint))
}

function hostElement(
  loadEntrypoint: ComponentProps<typeof SurfaceHost>["loadEntrypoint"],
  surfaceId: ComponentProps<typeof SurfaceHost>["surfaceId"] = "shift",
) {
  return (
    <PlatformBridgeProvider bridge={bridge}>
      <SurfaceHost surfaceId={surfaceId} loadEntrypoint={loadEntrypoint} />
    </PlatformBridgeProvider>
  )
}
