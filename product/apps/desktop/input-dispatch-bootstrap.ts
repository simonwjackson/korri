import type { BrowserWindow } from "electrobun/bun"

export type InputDispatchBootstrapLogger = {
  warn: (fields: Readonly<Record<string, unknown>>, message: string) => void
}

export function createInputDispatchBootstrapScript(): string {
  return `
    (() => {
      if (typeof window.__korriInputDispatch === "function") return

      const actionListeners = new Set()
      const statusListeners = new Set()
      let inputStatus = {
        inputd: "disabled",
        active: false,
        decodedFrames: 0,
        emittedActions: 0,
        droppedActions: 0,
        pushFailures: 0,
        lastError: null,
      }

      if (!window.__korriInput) {
        window.__korriInput = {
          subscribeAction: listener => {
            actionListeners.add(listener)
            return () => actionListeners.delete(listener)
          },
          getStatus: () => inputStatus,
          subscribeStatus: listener => {
            statusListeners.add(listener)
            return () => statusListeners.delete(listener)
          },
        }
      }

      window.__korriInputDispatch = incoming => {
        try {
          if (!incoming || typeof incoming !== "object") return

          if (incoming.kind === "korri.input.action" && incoming.action) {
            for (const listener of actionListeners) {
              try {
                listener(incoming.action)
              } catch (error) {
                console.warn("[korri] input action listener threw", error)
              }
            }
            return
          }

          if (incoming.kind === "korri.input.status" && incoming.status) {
            inputStatus = incoming.status
            for (const listener of statusListeners) {
              try {
                listener(incoming.status)
              } catch (error) {
                console.warn("[korri] input status listener threw", error)
              }
            }
          }
        } catch (error) {
          console.warn("[korri] input dispatch bootstrap threw", error)
        }
      }
    })()
  `
}

export function installInputDispatchBootstrap(
  window: BrowserWindow,
  logger?: InputDispatchBootstrapLogger,
): void {
  try {
    window.webview.executeJavascript(createInputDispatchBootstrapScript())
  } catch (error) {
    logger?.warn(
      { err: error, windowTitle: window.title },
      "failed to install input dispatch bootstrap",
    )
  }
}
