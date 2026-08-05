import { describe, expect, test } from "bun:test"
import type {
  PlatformInstruction,
  SessionControlInvokeOutcome,
  SessionControls,
  SessionControlsOutcome,
} from "@contracts/generated/korrid"
import {
  AndroidMoonlightEffect,
  SessionControlFailureReason,
} from "@contracts/generated/korrid"
import type { SurfaceGameplayControlValue } from "@contracts/surface/korri-surface"
import { createInMemoryKorridClient, type KorridClient } from "../korrid/client"
import {
  createOverlayController,
  type OverlayPlatform,
} from "./overlay-controller"

const LAUNCH_A = "0123456789abcdef0123456789abcdef"
const LAUNCH_B = "fedcba9876543210fedcba9876543210"

function controls(launchId = LAUNCH_A, value = false): SessionControls {
  return {
    launchId,
    title: launchId === LAUNCH_A ? "Skate 3" : "Wario Land 4",
    groups: [
      {
        id: "streaming",
        label: "Streaming",
        controls: [
          {
            id: "keyboard",
            label: "Keyboard",
            enabled: true,
            destructive: false,
            dismissOnSuccess: true,
            interaction: { kind: "command" },
          },
          {
            id: "fill",
            label: "Fill screen",
            enabled: true,
            destructive: false,
            dismissOnSuccess: false,
            interaction: { kind: "toggle", payload: { value } },
          },
        ],
      },
    ],
  }
}

interface RecordingKorrid extends KorridClient {
  calls: string[]
}

function recordingKorrid({
  listed = [{ _tag: "Ok", payload: controls() }],
  invoked = {
    _tag: "Ok",
    payload: { _tag: "Completed", payload: { launchId: LAUNCH_A } },
  },
}: {
  readonly listed?: readonly SessionControlsOutcome[]
  readonly invoked?: SessionControlInvokeOutcome
} = {}): RecordingKorrid {
  const client = createInMemoryKorridClient() as RecordingKorrid
  const calls: string[] = []
  let listIndex = 0
  client.calls = calls
  client.sessionControls = async launchId => {
    calls.push(`list:${launchId}`)
    return listed[Math.min(listIndex++, listed.length - 1)]!
  }
  client.invokeSessionControl = async (launchId, controlId, value) => {
    calls.push(
      value === undefined
        ? `invoke:${launchId}:${controlId}`
        : `invoke:${launchId}:${controlId}:${JSON.stringify(value)}`,
    )
    return invoked
  }
  return client
}

function recordingPlatform(
  outcome: Awaited<ReturnType<OverlayPlatform["executeProtectedInstruction"]>> = {
    _tag: "Executed",
  },
): OverlayPlatform & { readonly calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    dismiss() {
      calls.push("dismiss")
    },
    requestAuthorityRefresh() {
      calls.push("refresh-authority")
    },
    async executeProtectedInstruction(instruction) {
      calls.push(`instruction:${JSON.stringify(instruction)}`)
      return outcome
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => {
    resolve = next
  })
  return { promise, resolve }
}

describe("overlay controller", () => {
  test("loads the native-configured launch and publishes one presentation-safe model", async () => {
    const korrid = recordingKorrid()
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid,
      platform: recordingPlatform(),
    })

    await controller.refresh()

    expect(korrid.calls).toEqual([`list:${LAUNCH_A}`])
    expect(controller.model()).toMatchObject({
      presentation: {
        kind: "gameplay-overlay",
        title: "Skate 3",
        controls: [{ id: "overlay:resume" }],
        groups: [
          {
            label: "Streaming",
            controls: [
              { id: "keyboard", interaction: { kind: "command" } },
              { id: "fill", interaction: { kind: "toggle", value: false } },
            ],
          },
        ],
      },
      status: { _tag: "Browsing" },
    })
    expect(JSON.stringify(controller.model())).not.toContain("launchId")
  })

  test("invokes opaque ids and typed values, then refreshes nondismissing success", async () => {
    const korrid = recordingKorrid({
      listed: [
        { _tag: "Ok", payload: controls(LAUNCH_A, false) },
        { _tag: "Ok", payload: controls(LAUNCH_A, true) },
      ],
    })
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid,
      platform: recordingPlatform(),
    })
    await controller.refresh()

    const value: SurfaceGameplayControlValue = { kind: "toggle", value: true }
    await controller.invoke("fill", value)

    expect(korrid.calls).toEqual([
      `list:${LAUNCH_A}`,
      `invoke:${LAUNCH_A}:fill:{"kind":"toggle","value":true}`,
      `list:${LAUNCH_A}`,
    ])
    expect(controller.model().presentation).toMatchObject({
      groups: [{ controls: [{ id: "keyboard" }, { id: "fill", interaction: { value: true } }] }],
    })
  })

  test("dismisses locally for Resume and after a dismissing success", async () => {
    const localPlatform = recordingPlatform()
    const local = createOverlayController({
      launchId: LAUNCH_A,
      korrid: recordingKorrid(),
      platform: localPlatform,
    })
    local.dismiss()
    expect(localPlatform.calls).toEqual(["dismiss"])

    const platform = recordingPlatform()
    const korrid = recordingKorrid()
    const controller = createOverlayController({ launchId: LAUNCH_A, korrid, platform })
    await controller.refresh()
    await controller.invoke("keyboard")

    expect(platform.calls).toEqual(["dismiss"])
    expect(korrid.calls).toEqual([
      `list:${LAUNCH_A}`,
      `invoke:${LAUNCH_A}:keyboard`,
    ])
  })

  test("ignores stale list and invoke responses after native authority changes", async () => {
    const oldList = deferred<SessionControlsOutcome>()
    const oldInvoke = deferred<SessionControlInvokeOutcome>()
    const old = recordingKorrid()
    old.sessionControls = () => oldList.promise
    old.invokeSessionControl = () => oldInvoke.promise
    const replacement = recordingKorrid({
      listed: [{ _tag: "Ok", payload: controls(LAUNCH_B) }],
    })
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid: old,
      platform: recordingPlatform(),
    })

    const listing = controller.refresh()
    controller.replaceAuthority(LAUNCH_B, replacement)
    await controller.refresh()
    oldList.resolve({ _tag: "Ok", payload: controls(LAUNCH_A) })
    await listing

    controller.replaceAuthority(LAUNCH_A, old)
    old.sessionControls = async () => ({ _tag: "Ok", payload: controls(LAUNCH_A) })
    await controller.refresh()
    const invoking = controller.invoke("keyboard")
    controller.replaceAuthority(LAUNCH_B, replacement)
    await controller.refresh()
    oldInvoke.resolve({
      _tag: "Err",
      payload: {
        reason: SessionControlFailureReason.Unavailable,
        message: "old failure",
      },
    })
    await invoking

    expect(controller.model().presentation).toMatchObject({
      title: "Wario Land 4",
    })
    expect(JSON.stringify(controller.model())).not.toContain("old failure")
  })

  test("keeps Resume local and disables remote controls on unreachable failure", async () => {
    const korrid = recordingKorrid({
      listed: [
        { _tag: "Ok", payload: controls() },
        {
          _tag: "Err",
          payload: {
            reason: SessionControlFailureReason.Unavailable,
            message: "socket EPIPE 127.0.0.1",
          },
        },
      ],
    })
    const platform = recordingPlatform()
    const controller = createOverlayController({ launchId: LAUNCH_A, korrid, platform })
    await controller.refresh()
    await controller.refresh()

    expect(controller.model().status).toEqual({
      _tag: "Problem",
      kicker: "Controls unavailable",
      reason: "Gameplay controls are unavailable right now. Resume still works.",
      canRetry: true,
    })
    expect(controller.model().presentation).toMatchObject({
      controls: [{ id: "overlay:resume", enabled: true }],
      groups: [
        {
          controls: [
            { id: "keyboard", enabled: false },
            { id: "fill", enabled: false },
          ],
        },
      ],
    })
    controller.dismiss()
    expect(platform.calls).toEqual(["refresh-authority", "dismiss"])
  })

  test("deduplicates an in-flight command invocation", async () => {
    const result = deferred<SessionControlInvokeOutcome>()
    const korrid = recordingKorrid()
    let invokes = 0
    korrid.invokeSessionControl = async () => {
      invokes += 1
      return result.promise
    }
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid,
      platform: recordingPlatform(),
    })
    await controller.refresh()

    const first = controller.invoke("keyboard")
    const duplicate = controller.invoke("keyboard")
    expect(invokes).toBe(1)
    result.resolve({
      _tag: "Ok",
      payload: { _tag: "Completed", payload: { launchId: LAUNCH_A } },
    })
    await Promise.all([first, duplicate])

    expect(invokes).toBe(1)
  })

  test("serializes value updates and coalesces each control to its latest value", async () => {
    const firstResult = deferred<SessionControlInvokeOutcome>()
    const korrid = recordingKorrid()
    const values: SurfaceGameplayControlValue[] = []
    let active = 0
    let maximumActive = 0
    korrid.invokeSessionControl = async (_launchId, _controlId, value) => {
      values.push(value!)
      active += 1
      maximumActive = Math.max(maximumActive, active)
      const outcome = values.length === 1
        ? await firstResult.promise
        : { _tag: "Ok" as const, payload: {
            _tag: "Completed" as const,
            payload: { launchId: LAUNCH_A },
          } }
      active -= 1
      return outcome
    }
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid,
      platform: recordingPlatform(),
    })
    await controller.refresh()

    const first = controller.invoke("fill", { kind: "toggle", value: true })
    const superseded = controller.invoke("fill", { kind: "toggle", value: false })
    const latest = controller.invoke("fill", { kind: "toggle", value: true })
    expect(values).toEqual([{ kind: "toggle", value: true }])
    firstResult.resolve({
      _tag: "Ok",
      payload: { _tag: "Completed", payload: { launchId: LAUNCH_A } },
    })
    await Promise.all([first, superseded, latest])

    expect(values).toEqual([
      { kind: "toggle", value: true },
      { kind: "toggle", value: true },
    ])
    expect(maximumActive).toBe(1)
  })

  test("requests automatic authority refresh at most once until authority changes", async () => {
    const korrid = recordingKorrid({
      listed: [{
        _tag: "Err",
        payload: {
          reason: SessionControlFailureReason.Unavailable,
          message: "offline",
        },
      }],
    })
    const platform = recordingPlatform()
    const controller = createOverlayController({ launchId: LAUNCH_A, korrid, platform })

    await controller.refresh()
    await controller.refresh()
    expect(platform.calls).toEqual(["refresh-authority"])
    expect(controller.model().status).toMatchObject({ _tag: "Problem", canRetry: true })

    controller.replaceAuthority(LAUNCH_B, recordingKorrid({
      listed: [{
        _tag: "Err",
        payload: {
          reason: SessionControlFailureReason.Unavailable,
          message: "offline",
        },
      }],
    }))
    await controller.refresh()
    expect(platform.calls).toEqual(["refresh-authority", "refresh-authority"])
  })

  test("a newer same-authority operation wins over an older refresh", async () => {
    const oldList = deferred<SessionControlsOutcome>()
    const korrid = recordingKorrid({
      listed: [{ _tag: "Ok", payload: controls(LAUNCH_A, true) }],
    })
    let calls = 0
    korrid.sessionControls = () => calls++ === 0
      ? oldList.promise
      : Promise.resolve({ _tag: "Ok", payload: controls(LAUNCH_A, true) })
    const controller = createOverlayController({
      launchId: LAUNCH_A,
      korrid,
      platform: recordingPlatform(),
    })

    const old = controller.refresh()
    await controller.refresh()
    oldList.resolve({ _tag: "Ok", payload: controls(LAUNCH_A, false) })
    await old

    expect(controller.model().presentation).toMatchObject({
      groups: [{ controls: [{ id: "keyboard" }, { interaction: { value: true } }] }],
    })
  })

  test("successful dismiss drops queued value updates", async () => {
    const firstResult = deferred<SessionControlInvokeOutcome>()
    const korrid = recordingKorrid()
    let invokes = 0
    korrid.invokeSessionControl = async () => {
      invokes += 1
      return firstResult.promise
    }
    const platform = recordingPlatform()
    const controller = createOverlayController({ launchId: LAUNCH_A, korrid, platform })
    await controller.refresh()

    const first = controller.invoke("keyboard")
    const duplicate = controller.invoke("keyboard")
    firstResult.resolve({
      _tag: "Ok",
      payload: { _tag: "Completed", payload: { launchId: LAUNCH_A } },
    })
    await Promise.all([first, duplicate])

    expect(invokes).toBe(1)
    expect(platform.calls).toEqual(["dismiss"])
  })

  test("requests narrow native execution for the exact protected instruction", async () => {
    const instruction: PlatformInstruction = {
      launchId: LAUNCH_A,
      actionId: "fill",
      nonce: "one-use",
      value: { kind: "toggle", value: true },
      effect: {
        kind: "android-moonlight",
        payload: AndroidMoonlightEffect.SetFillMode,
      },
      integrity: "opaque",
    }
    const platform = recordingPlatform({
      _tag: "Unavailable",
      message: "This gameplay effect is not available yet.",
    })
    const korrid = recordingKorrid({
      invoked: {
        _tag: "Ok",
        payload: { _tag: "PlatformInstruction", payload: instruction },
      },
    })
    const controller = createOverlayController({ launchId: LAUNCH_A, korrid, platform })
    await controller.refresh()

    await controller.invoke("fill", { kind: "toggle", value: true })

    expect(platform.calls).toEqual([`instruction:${JSON.stringify(instruction)}`])
    expect(controller.model().status).toMatchObject({
      _tag: "Problem",
      reason: "This gameplay effect is not available yet.",
    })
  })
})
