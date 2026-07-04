import type { MoonlightPolicy } from "./config/policy"
import type { LaunchSpec } from "@platform/library/launcher"

const DEFAULT_MOONLIGHT_COMMAND = "moonlight"
const KORRI_STREAM_APP_NAME = "Korri Stream"

type ArgList = string[]
type EnvironmentOverlay = NonNullable<MoonlightPolicy["environment"]>

export interface MoonlightLaunchFacts {
  /** Peer hostname or IP. IPv6 callers must strip URL brackets before rendering. */
  readonly host: string
  /** Resolved input devices discovered by launcher preflight. */
  readonly inputDevices?: readonly string[]
  /** Env values allocated by launcher preflight, for example local-control socket facts. */
  readonly environment?: Readonly<Record<string, string>>
}

export interface ComposeMoonlightStreamLaunchSpecOptions {
  readonly policy?: MoonlightPolicy
  readonly facts: MoonlightLaunchFacts
}

export function composeMoonlightStreamLaunchSpec(
  options: ComposeMoonlightStreamLaunchSpecOptions,
): LaunchSpec {
  const policy = options.policy ?? {}
  validateMoonlightLaunchFacts(options.facts)
  validateMoonlightPolicy(policy)

  const base = applyEnvironmentOverlay(
    {
      command: policy.command ?? DEFAULT_MOONLIGHT_COMMAND,
      args: renderMoonlightArgs(policy, options.facts),
    },
    policy.environment,
  )

  return applyEnvironmentOverlay(base, options.facts.environment)
}

function renderMoonlightArgs(
  policy: MoonlightPolicy,
  facts: MoonlightLaunchFacts,
): readonly string[] {
  const args: ArgList = ["stream"]

  renderLoggingArgs(args, policy.logging)
  renderStreamArgs(args, policy.stream)
  renderPlatformArgs(args, policy.platform)
  renderInputArgs(args, policy.input, facts.inputDevices)
  renderAudioArgs(args, policy.audio)
  renderWindowArgs(args, policy.window)

  if (policy.extraArgs) args.push(...policy.extraArgs)

  args.push("-app", KORRI_STREAM_APP_NAME, facts.host)
  return args
}

function renderLoggingArgs(args: ArgList, logging: MoonlightPolicy["logging"]) {
  pushBoolean(args, "-verbose", logging?.verbose)
  pushBoolean(args, "-debug", logging?.debug)
}

function renderStreamArgs(args: ArgList, stream: MoonlightPolicy["stream"]) {
  pushValue(args, "-width", stream?.resolution?.width)
  pushValue(args, "-height", stream?.resolution?.height)
  pushValue(args, "-fps", stream?.fps)
  pushValue(args, "-bitrate", stream?.bitrateKbps)
  pushValue(args, "-packetsize", stream?.packetSizeBytes)
  pushValue(args, "-codec", stream?.codec)
  pushBoolean(args, "-remote", stream?.remoteOptimizations)
  pushBoolean(args, "-unsupported", stream?.unsupportedHost)
  pushBoolean(args, "-quitappafter", stream?.quitAppAfter)
  pushBoolean(args, "-nosops", stream?.noSops)
  pushBoolean(args, "-localaudio", stream?.localAudio)
  pushBoolean(args, "-surround", stream?.surround)
  pushValue(args, "-keydir", stream?.keyDir)
}

function renderPlatformArgs(
  args: ArgList,
  platform: MoonlightPolicy["platform"],
) {
  pushValue(args, "-platform", platform?.name)
}

function renderInputArgs(
  args: ArgList,
  input: MoonlightPolicy["input"],
  inputDevices: readonly string[] | undefined,
) {
  pushValue(args, "-mapping", input?.mappingFile)
  for (const device of [...(input?.devices ?? []), ...(inputDevices ?? [])]) {
    pushValue(args, "-input", device)
  }
  pushBoolean(args, "-viewonly", input?.viewOnly)
  pushValue(args, "-rotate", input?.rotate)
  pushBoolean(args, "-absolutetouch", input?.touch?.absolute)
  pushBoolean(args, "-absolutetouchrequirebounds", input?.touch?.requireBounds)
  if (input?.touch?.bounds) {
    const { x, y, w, h } = input.touch.bounds
    pushValue(args, "-absolutetouchbounds", `${x},${y},${w},${h}`)
  }
}

function renderAudioArgs(args: ArgList, audio: MoonlightPolicy["audio"]) {
  pushValue(args, "-audio", audio?.device)
}

function renderWindowArgs(args: ArgList, window: MoonlightPolicy["window"]) {
  pushBoolean(args, "-windowed", window?.windowed)
  pushBoolean(args, "-autowindowresize", window?.autoResize)
}

function applyEnvironmentOverlay(
  spec: LaunchSpec,
  overlay: EnvironmentOverlay | undefined,
): LaunchSpec {
  if (overlay === undefined) return spec

  const env = { ...(spec.env ?? {}) }
  const envUnset = new Set(spec.envUnset ?? [])
  for (const [key, value] of Object.entries(overlay)) {
    if (value === null) {
      delete env[key]
      envUnset.add(key)
    } else {
      env[key] = value
      envUnset.delete(key)
    }
  }

  return {
    ...spec,
    env: Object.keys(env).length > 0 ? env : undefined,
    envUnset: envUnset.size > 0 ? [...envUnset].sort() : undefined,
  }
}

function validateMoonlightLaunchFacts(facts: MoonlightLaunchFacts): void {
  if (!facts.host.trim()) {
    throw new Error("composeMoonlightStreamLaunchSpec: host is required")
  }
}

function validateMoonlightPolicy(policy: MoonlightPolicy): void {
  const width = policy.stream?.resolution?.width
  const height = policy.stream?.resolution?.height
  if ((width === undefined) !== (height === undefined)) {
    throw new Error(
      "moonlight.stream.resolution requires both width and height when either is set",
    )
  }
}

function pushValue(
  args: ArgList,
  flag: string,
  value: string | number | null | undefined,
) {
  if (value !== undefined && value !== null) args.push(flag, String(value))
}

function pushBoolean(args: ArgList, flag: string, value: boolean | undefined) {
  if (value === true) args.push(flag)
}
