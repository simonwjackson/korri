import { describe, expect, it } from "bun:test"
import type {
  KorriPlatformBridge,
  KorriThemeEntrypoint,
} from "@platform/theme/bridge"
import { render, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import { PlatformBridgeProvider } from "./platform-bridge-context"
import { ThemeHost } from "./ThemeHost"

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

describe("ThemeHost", () => {
  it("mounts a selected theme entrypoint with the platform bridge", async () => {
    let receivedBridge: KorriPlatformBridge | undefined
    const entrypoint: KorriThemeEntrypoint = {
      id: "plain-demo",
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
    const entrypoint: KorriThemeEntrypoint = {
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

  it("disposes the mounted theme on unmount", async () => {
    let disposed = false
    const entrypoint: KorriThemeEntrypoint = {
      id: "plain-demo",
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
  loadEntrypoint: ComponentProps<typeof ThemeHost>["loadEntrypoint"],
) {
  return render(hostElement(loadEntrypoint))
}

function hostElement(
  loadEntrypoint: ComponentProps<typeof ThemeHost>["loadEntrypoint"],
  themeId: ComponentProps<typeof ThemeHost>["themeId"] = "plain-demo",
) {
  return (
    <PlatformBridgeProvider bridge={bridge}>
      <ThemeHost themeId={themeId} loadEntrypoint={loadEntrypoint} />
    </PlatformBridgeProvider>
  )
}
