import { join } from "node:path"
import type { MelonDsPolicy } from "./policy"

export interface RenderMelonDsConfigInput {
  readonly policy?: MelonDsPolicy
  readonly stateRoot: string
}

const SCREEN_LAYOUT = {
  vertical: 1,
  horizontal: 2,
  hybrid: 3,
  "top-only": 1,
  "bottom-only": 1,
  "dual-window": 1,
} as const

const SCREEN_SIZING = {
  even: 0,
  "emphasize-top": 1,
  "emphasize-bottom": 2,
  auto: 3,
} as const

const RENDERER = {
  software: 0,
  opengl: 1,
  "opengl-compute": 2,
} as const

const INPUTPLUMBER_XBOX_JOYSTICK = {
  JoystickID: 0,
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  L: 4,
  R: 5,
  Select: 6,
  Start: 7,
  Up: 257,
  Right: 258,
  Down: 260,
  Left: 264,
} as const

export function renderMelonDsConfig(input: RenderMelonDsConfigInput): string {
  const policy = input.policy ?? {}
  const matchedPresentation =
    policy.presentation?.intent === "matched-dual-screen"
  const mode =
    policy.display?.mode ?? (matchedPresentation ? "dual-window" : "vertical")
  const root = input.stateRoot

  const document: TomlDocument = {
    root: {},
    tables: [
      {
        name: "Emu",
        values: { DirectBoot: policy.boot?.direct ?? true },
      },
      {
        name: "3D",
        values: {
          ...(policy.video?.renderer !== undefined
            ? { Renderer: RENDERER[policy.video.renderer] }
            : {}),
          ...(policy.video?.scaleFactor !== undefined
            ? { "GL.ScaleFactor": policy.video.scaleFactor }
            : {}),
        },
      },
      {
        name: "Instance0",
        values: {
          SaveFilePath: join(root, "saves"),
          SavestatePath: join(root, "savestates"),
          CheatFilePath: join(root, "cheats"),
        },
      },
      {
        name: "Instance0.Window0",
        values: windowValuesForMode(mode, policy, "primary"),
      },
      {
        name: "Instance0.Window1",
        values: windowValuesForMode(mode, policy, "secondary"),
      },
      ...(policy.presentation?.input?.profile === "inputplumber-xbox"
        ? [
            {
              name: "Instance0.Joystick",
              values: {
                ...INPUTPLUMBER_XBOX_JOYSTICK,
                JoystickID:
                  policy.presentation.input.joystickId ??
                  INPUTPLUMBER_XBOX_JOYSTICK.JoystickID,
              },
            },
          ]
        : []),
    ],
  }

  return renderToml(document)
}

function windowValuesForMode(
  mode: NonNullable<NonNullable<MelonDsPolicy["display"]>["mode"]>,
  policy: MelonDsPolicy,
  window: "primary" | "secondary",
): TomlObject {
  if (mode === "dual-window") {
    return {
      Enabled: true,
      ScreenLayout: SCREEN_LAYOUT[mode],
      ScreenSizing: window === "primary" ? 4 : 5,
      ScreenGap: policy.display?.gap ?? 0,
      ScreenSwap: policy.display?.swap ?? false,
      IntegerScaling: policy.display?.integerScaling ?? false,
    }
  }

  if (window === "secondary") {
    return { Enabled: false }
  }

  return {
    Enabled: true,
    ScreenLayout: SCREEN_LAYOUT[mode],
    ScreenSizing: sizingForMode(mode, policy.display?.sizing),
    ScreenGap: policy.display?.gap ?? 0,
    ScreenSwap: policy.display?.swap ?? false,
    IntegerScaling: policy.display?.integerScaling ?? false,
  }
}

function sizingForMode(
  mode: NonNullable<NonNullable<MelonDsPolicy["display"]>["mode"]>,
  sizing: NonNullable<MelonDsPolicy["display"]>["sizing"] | undefined,
): number {
  if (mode === "top-only") return 4
  if (mode === "bottom-only") return 5
  if (sizing !== undefined) return SCREEN_SIZING[sizing]
  if (mode === "hybrid") return SCREEN_SIZING["emphasize-top"]
  return SCREEN_SIZING.even
}

type TomlPrimitive = string | number | boolean
type TomlObject = Readonly<Record<string, TomlPrimitive>>
interface TomlDocument {
  readonly root: TomlObject
  readonly tables: readonly {
    readonly name: string
    readonly values: TomlObject
  }[]
}

function renderToml(document: TomlDocument): string {
  const lines: string[] = []
  appendValues(lines, document.root)
  for (const table of document.tables) {
    if (Object.keys(table.values).length === 0) continue
    if (lines.length > 0) lines.push("")
    lines.push(`[${table.name}]`)
    appendValues(lines, table.values)
  }
  return `${lines.join("\n")}\n`
}

function appendValues(lines: string[], values: TomlObject): void {
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key} = ${formatValue(value)}`)
  }
}

function formatValue(value: TomlPrimitive): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}
