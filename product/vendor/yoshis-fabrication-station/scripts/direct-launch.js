;(() => {
  const queryParams = new URLSearchParams(location.search)
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ""))
  const params = {
    has: name => queryParams.has(name) || hashParams.has(name),
    get: name => queryParams.get(name) ?? hashParams.get(name),
  }
  const debugEnabled = params.has("debug")

  const state = (window.__YFS_DIRECT_LAUNCH = {
    enabled: false,
    status: "idle",
    attempts: 0,
    lastError: null,
    transport: null,
    inputFound: false,
    inputCount: 0,
    canvasFound: false,
    codeLength: 0,
  })

  let lastBootFrame = null
  let bootFrameCaptureTimer = null

  const overlay = document.createElement("div")
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "display:none",
    "background:#000 center/contain no-repeat",
  ].join(";")
  const debug = document.createElement("div")
  debug.style.cssText =
    "position:fixed;left:8px;bottom:8px;z-index:2147483647;background:rgba(0,0,0,.78);color:#fff;font:12px/1.35 monospace;padding:8px;border-radius:6px;max-width:46vw;pointer-events:none;white-space:pre-wrap;display:none"

  document.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(overlay)
    document.body.appendChild(debug)
  })

  const captureBootFrame = () => {
    const canvas = document.querySelector("canvas")
    if (!canvas || canvas.width === 0 || canvas.height === 0) return
    try {
      lastBootFrame = canvas.toDataURL("image/png")
    } catch {
      // If capture fails, keep the black loading background instead of exposing the load UI.
    }
  }

  const beginBootFrameCapture = () => {
    if (bootFrameCaptureTimer) return
    bootFrameCaptureTimer = setInterval(() => {
      const stillOnBootScreen = codeInputs().length === 0
      if (stillOnBootScreen) captureBootFrame()

      // Once we have an authentic boot frame, keep it over the page. While Construct is
      // still booting this mirrors the real loading screen; once LoadLevel appears it
      // prevents a one-frame flash of the paste-code UI while automation runs behind it.
      if (lastBootFrame) setOverlay(true)
    }, 33)
  }

  const setOverlay = visible => {
    if (visible && lastBootFrame)
      overlay.style.backgroundImage = `url(${lastBootFrame})`
    overlay.style.display = visible ? "block" : "none"
  }

  const renderDebug = () => {
    debug.style.display = debugEnabled ? "block" : "none"
    debug.textContent = `YFS direct launch\nstatus: ${state.status}\ntransport: ${state.transport || "none"}\nattempts: ${state.attempts}\ninputs: ${state.inputCount} found=${state.inputFound}\ncanvas: ${state.canvasFound}\ncode: ${state.codeLength} chars${state.lastError ? `\nerror: ${state.lastError}` : ""}`
  }
  setInterval(renderDebug, 250)

  const decodeBase64Url = value => {
    const padded = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=")
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  }

  const readLaunchCode = async () => {
    const sessionCode = sessionStorage.getItem("yfsDirectLaunchCode")
    if (sessionCode) {
      sessionStorage.removeItem("yfsDirectLaunchCode")
      state.transport = "sessionStorage"
      return sessionCode
    }

    if (params.has("sample")) {
      state.transport = "sample"
      const sampleName = params.get("sample") || "basicMovement"
      const response = await fetch("samplelevels.json", { cache: "no-store" })
      const samples = await response.json()
      const code = samples?.data?.[sampleName]
      if (!code) throw new Error(`Unknown sample level: ${sampleName}`)
      return code
    }

    if (params.has("code_url")) {
      state.transport = "code_url"
      const response = await fetch(params.get("code_url"), {
        cache: "no-store",
      })
      if (!response.ok)
        throw new Error(`Unable to fetch code_url: ${response.status}`)
      return await response.text()
    }

    if (params.has("code_b64")) {
      state.transport = location.hash.includes("code_b64")
        ? "hash:code_b64"
        : "query:code_b64"
      return decodeBase64Url(params.get("code_b64"))
    }

    if (params.has("code")) {
      state.transport = location.hash.includes("code=")
        ? "hash:code"
        : "query:code"
      return params.get("code")
    }

    return null
  }

  const waitFor = async (predicate, timeoutMs = 30000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const value = predicate()
      if (value) return value
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    throw new Error("Timed out waiting for the YFS load UI")
  }

  const codeInputs = () => {
    const candidates = [
      ...document.querySelectorAll("textarea, input:not([type='hidden'])"),
    ]
    state.inputCount = candidates.length
    return candidates
      .map(element => ({
        element,
        rect: element.getBoundingClientRect(),
        style: getComputedStyle(element),
      }))
      .filter(
        ({ rect, style }) =>
          rect.width > 40 &&
          rect.height > 10 &&
          style.visibility !== "hidden" &&
          style.display !== "none",
      )
      .sort(
        (a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height,
      )
      .map(({ element }) => element)
  }

  const setInputValue = (element, value) => {
    element.focus()
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value",
    )
    if (descriptor?.set) descriptor.set.call(element, value)
    else element.value = value
    for (const type of ["beforeinput", "input", "change", "keyup", "blur"]) {
      element.dispatchEvent(
        new Event(type, { bubbles: true, cancelable: true }),
      )
    }
  }

  const dispatchKeyboardEnter = target => {
    for (const type of ["keydown", "keypress", "keyup"]) {
      target.dispatchEvent(
        new KeyboardEvent(type, {
          bubbles: true,
          cancelable: true,
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
        }),
      )
    }
  }

  const dispatchPointer = (target, type, clientX, clientY) => {
    const common = {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
      buttons: type.endsWith("down") ? 1 : 0,
    }
    if (typeof PointerEvent === "function") {
      target.dispatchEvent(
        new PointerEvent(type, {
          ...common,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
        }),
      )
    } else {
      target.dispatchEvent(
        new MouseEvent(type.replace(/^pointer/, "mouse"), common),
      )
    }
  }

  const clickCanvasLoadButton = () => {
    const canvas = document.querySelector("canvas")
    state.canvasFound = Boolean(canvas)
    if (!canvas) return false
    const rect = canvas.getBoundingClientRect()
    const points = [
      [720 / 832, 416 / 448],
      [720 / 1664, 416 / 448],
      [0.865, 0.929],
      [0.5, 0.929],
    ]
    for (const [fx, fy] of points) {
      const clientX = rect.left + rect.width * fx
      const clientY = rect.top + rect.height * fy
      dispatchPointer(canvas, "pointerdown", clientX, clientY)
      canvas.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
        }),
      )
      dispatchPointer(canvas, "pointerup", clientX, clientY)
      canvas.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        }),
      )
      canvas.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0,
        }),
      )
    }
    dispatchKeyboardEnter(canvas)
    dispatchKeyboardEnter(document)
    return true
  }

  const waitForGameplayToReplaceLoadUi = async () => {
    const started = Date.now()
    while (Date.now() - started < 12000) {
      if (codeInputs().length === 0) return true
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return false
  }

  const launch = async () => {
    if (
      params.has("sample") ||
      params.has("code_url") ||
      params.has("code_b64") ||
      params.has("code") ||
      sessionStorage.getItem("yfsDirectLaunchCode")
    ) {
      beginBootFrameCapture()
    }

    const code = await readLaunchCode()
    if (!code) {
      state.status = "no launch payload"
      setOverlay(false)
      return
    }

    state.enabled = true
    state.codeLength = code.length
    state.status = "waiting-for-load-ui"
    beginBootFrameCapture()

    await waitFor(() => {
      state.canvasFound = Boolean(document.querySelector("canvas"))
      const inputs = codeInputs()
      state.inputFound = inputs.length > 0
      return state.canvasFound && state.inputFound ? inputs[0] : null
    })

    setOverlay(true)
    state.status = "injecting-level-code"
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      state.attempts = attempt
      for (const input of codeInputs()) setInputValue(input, code)
      await new Promise(resolve => setTimeout(resolve, 250))
      clickCanvasLoadButton()
      await new Promise(resolve => setTimeout(resolve, 550))
      if (attempt >= 3 && codeInputs().length === 0) break
    }

    state.status = "waiting-for-gameplay"
    await waitForGameplayToReplaceLoadUi()
    await new Promise(resolve => setTimeout(resolve, 650))
    state.status = "ready"
    setOverlay(false)
    if (bootFrameCaptureTimer) clearInterval(bootFrameCaptureTimer)
  }

  launch().catch(error => {
    state.status = "failed"
    state.lastError = String(error?.message || error)
    setOverlay(false)
    console.error("[YFS direct launch prototype]", error)
  })
})()
