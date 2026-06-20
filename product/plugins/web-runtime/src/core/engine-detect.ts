// Programmatic web-engine classification from a page fingerprint.
//
// The pure classifier here is engine-detection's testable core. The matching
// in-page snippet that collects the fingerprint (window globals, title, canvas
// ids, script srcs) lives alongside but runs in the browser via CDP after boot.
// Engines leave distinctive, un-obfuscated fingerprints; unknown pages degrade
// to "generic" so the runtime still has a safe profile.

export type EngineId =
  | "gamemaker"
  | "construct"
  | "construct2"
  | "unity"
  | "godot"
  | "phaser"
  | "pico8"
  | "emscripten"
  | "generic"

export interface PageFingerprint {
  /** names of `window.<name>` globals that are present */
  readonly globals: readonly string[]
  readonly title: string
  readonly canvasIds: readonly string[]
  readonly scriptSrcs: readonly string[]
}

interface EngineSignature {
  readonly engine: EngineId
  readonly confidence: "high" | "medium"
  readonly globals?: readonly string[]
  readonly titleIncludes?: readonly string[]
  readonly canvasIds?: readonly string[]
  readonly scriptSrc?: readonly RegExp[]
}

// Order is priority within a confidence tier.
export const ENGINE_SIGNATURES: readonly EngineSignature[] = [
  {
    engine: "gamemaker",
    confidence: "high",
    globals: ["GameMaker_Init", "g_pBuiltIn", "_GMrunner"],
    titleIncludes: ["Created with GameMaker"],
    scriptSrc: [/html5game\/.+\.js/],
  },
  {
    engine: "construct",
    confidence: "high",
    globals: ["C3", "C3_GetObjectRefTable"],
    scriptSrc: [/c3(main|runtime)\.js/],
  },
  {
    engine: "unity",
    confidence: "high",
    globals: ["unityInstance", "createUnityInstance", "UnityLoader"],
    canvasIds: ["unity-canvas"],
    scriptSrc: [/UnityLoader\.js/, /Build\/.+\.(wasm|data)/],
  },
  {
    engine: "godot",
    confidence: "high",
    globals: ["Godot"],
    scriptSrc: [/\.pck(\?|$)/, /godot.*\.wasm/],
  },
  { engine: "phaser", confidence: "high", globals: ["Phaser"] },
  { engine: "construct2", confidence: "medium", globals: ["cr_createRuntime"] },
  {
    engine: "pico8",
    confidence: "medium",
    globals: ["pico8_buttons", "_cartdat"],
  },
  { engine: "emscripten", confidence: "medium", globals: ["Module"] },
]

function matches(sig: EngineSignature, fp: PageFingerprint): boolean {
  const hasGlobal = (sig.globals ?? []).some(g => fp.globals.includes(g))
  const hasTitle = (sig.titleIncludes ?? []).some(t => fp.title.includes(t))
  const hasCanvas = (sig.canvasIds ?? []).some(id => fp.canvasIds.includes(id))
  const hasScript = (sig.scriptSrc ?? []).some(rx =>
    fp.scriptSrcs.some(s => rx.test(s)),
  )
  return hasGlobal || hasTitle || hasCanvas || hasScript
}

export function classifyEngine(fp: PageFingerprint): EngineId {
  const high = ENGINE_SIGNATURES.find(
    s => s.confidence === "high" && matches(s, fp),
  )
  if (high) return high.engine
  const medium = ENGINE_SIGNATURES.find(
    s => s.confidence === "medium" && matches(s, fp),
  )
  return medium?.engine ?? "generic"
}
