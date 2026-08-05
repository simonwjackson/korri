import { describe, expect, test } from "bun:test"
import { SessionControlFailureReason } from "@contracts/generated/korrid"
import { createInMemoryKorridClient } from "../korrid/client"
import { createOverlayController, type OverlayController } from "./overlay-controller"
import type { NativeOverlayConnection } from "./overlay-native"
import { createNativeOverlayHost } from "./overlay-host"

const CONFIG = {
  korridPort: 43117,
  korridCapability: "capability",
  launchId: "0123456789abcdef0123456789abcdef",
}

function connectionFixture(): NativeOverlayConnection & {
  emit(config: typeof CONFIG): void
  readonly calls: string[]
} {
  let onConfig: (config: typeof CONFIG) => void = () => {}
  const calls: string[] = []
  return {
    calls,
    emit(config) {
      onConfig(config)
    },
    platform: {
      dismiss() {
        calls.push("dismiss")
      },
      requestAuthorityRefresh() {
        calls.push("refresh-authority")
        onConfig(CONFIG)
      },
      async executeProtectedInstruction() {
        return { _tag: "Executed" }
      },
    },
    start(next) {
      onConfig = next
      calls.push("start")
      return () => calls.push("stop")
    },
  }
}

describe("native overlay host", () => {
  test("deduplicates unchanged authority through the retry loop and tears down the page", async () => {
    const connection = connectionFixture()
    const controllers: OverlayController[] = []
    let mounts = 0
    let unmounts = 0
    const host = createNativeOverlayHost({
      connection,
      page: window,
      createController(config) {
        const korrid = createInMemoryKorridClient()
        korrid.sessionControls = async () => ({
          _tag: "Err",
          payload: {
            reason: SessionControlFailureReason.Unavailable,
            message: "offline",
          },
        })
        const controller = createOverlayController({
          launchId: config.launchId,
          korrid,
          platform: connection.platform,
        })
        controllers.push(controller)
        return controller
      },
      mount() {
        mounts += 1
      },
      unmount() {
        unmounts += 1
      },
    })

    connection.emit(CONFIG)
    await controllers[0]!.refresh()

    expect(mounts).toBe(1)
    expect(controllers).toHaveLength(1)
    expect(connection.calls).toEqual(["start", "refresh-authority"])
    expect(controllers[0]!.model().status).toMatchObject({
      _tag: "Problem",
      canRetry: true,
    })

    window.dispatchEvent(new Event("pagehide"))
    expect(connection.calls).toEqual(["start", "refresh-authority", "stop"])
    expect(unmounts).toBe(1)
    host.dispose()
    expect(unmounts).toBe(1)
  })

  test("replaces the controller only when port capability or launch changes", () => {
    const connection = connectionFixture()
    const destroyed: string[] = []
    const host = createNativeOverlayHost({
      connection,
      page: window,
      createController(config) {
        const controller = createOverlayController({
          launchId: config.launchId,
          korrid: createInMemoryKorridClient(),
          platform: connection.platform,
        })
        const destroy = controller.destroy
        controller.destroy = () => {
          destroyed.push(config.launchId)
          destroy()
        }
        return controller
      },
      mount() {},
      unmount() {},
    })

    connection.emit(CONFIG)
    connection.emit({ ...CONFIG })
    connection.emit({ ...CONFIG, korridPort: 43118 })

    expect(destroyed).toEqual([CONFIG.launchId])
    host.dispose()
  })
})
