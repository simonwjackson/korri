import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { basename, dirname, join, relative } from "node:path"
import type { PortMasterInstalledManifest } from "./installer"

export interface PortMasterLaunchEnvelopeInput {
  readonly manifest?: PortMasterInstalledManifest
  readonly manifestPath?: string
  readonly launchScript?: string
  readonly deviceArch?: string
  readonly shellPath?: string
  readonly bwrapPath?: string
  readonly envPath?: string
  readonly useBubblewrap?: boolean
  readonly presentation?: PortMasterLaunchPresentationInput
  readonly inputCompatibility?: PortMasterLaunchInputCompatibilityInput
  readonly runtimeCompatibility?: PortMasterLaunchRuntimeCompatibilityInput
}

export interface PortMasterLaunchRuntimeCompatibilityInput {
  readonly mode: "none" | "retroarch-libretro"
  readonly retroarchPath?: string
  readonly retroarchLogPath?: string
}

export interface PortMasterLaunchRuntimeCompatibility {
  readonly mode: "none" | "retroarch-libretro"
  readonly retroarchWrapperPath?: string
  readonly retroarchPath?: string
  readonly retroarchLogPath?: string
}

export interface PortMasterLaunchInputCompatibilityInput {
  readonly mode: "none" | "sdl-gamecontroller" | "gptokeyb"
  readonly sdlGameControllerConfig?: string
  readonly gptokeybPath?: string
  readonly gptokeybLoaderPath?: string
  readonly gptokeybLogPath?: string
  readonly bindRealUinput?: boolean
}

export interface PortMasterLaunchInputCompatibility {
  readonly mode: "none" | "sdl-gamecontroller" | "gptokeyb"
  readonly sdlGameControllerConfig: string
  readonly bindRealUinput: boolean
  readonly gptokeybWrapperPath?: string
  readonly gptokeybPath?: string
  readonly gptokeybLoaderPath?: string
  readonly gptokeybLogPath?: string
}

export interface PortMasterLaunchPresentationInput {
  readonly mode: "none" | "sway-fullscreen"
  readonly swaymsgPath?: string
  readonly windowMatcher?: string
  readonly logPath?: string
  readonly windowProbe?: string
  readonly startupPollAttempts?: number
  readonly startupPollDelayMs?: number
}

export interface PortMasterLaunchPresentation {
  readonly mode: "sway-fullscreen"
  readonly launcherPath: string
  readonly logPath: string
  readonly windowMatcher: string
  readonly swaymsgPath: string
}

export interface PortMasterLaunchEnvelope {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly launchScriptPath: string
  readonly controlPath: string
  readonly tasksetterPath: string
  readonly fakeDeviceRoot?: string
  readonly presentation?: PortMasterLaunchPresentation
  readonly inputCompatibility: PortMasterLaunchInputCompatibility
  readonly runtimeCompatibility: PortMasterLaunchRuntimeCompatibility
}

const DEFAULT_DEVICE_ARCH = "aarch64"
const DEFAULT_SHELL = "bash"
const DEFAULT_BWRAP = "bwrap"
const DEFAULT_ENV = "env"

export async function preparePortMasterLaunchEnvelope(
  input: PortMasterLaunchEnvelopeInput,
): Promise<PortMasterLaunchEnvelope> {
  const manifest = input.manifest ?? (await readManifest(input.manifestPath))
  const launchScript = selectLaunchScript(manifest, input.launchScript)
  const launchScriptPath = join(manifest.portsRoot, launchScript)
  const controlRoot = join(manifest.installRoot, "PortMaster")
  const tasksetterPath = join(controlRoot, "tasksetter")
  const controlPath = join(controlRoot, "control.txt")
  const romsControlRoot = join(manifest.portsRoot, "PortMaster")
  const fakeDeviceRoot = join(manifest.installRoot, "compat", "dev")
  const fakeTty = join(fakeDeviceRoot, "tty0")
  const fakeUinput = join(fakeDeviceRoot, "uinput")
  const shellPath = input.shellPath ?? DEFAULT_SHELL
  const useBubblewrap = input.useBubblewrap ?? false
  const fexWrapper = manifest.extracted.fexWrappers?.[0]
  const presentationInput = input.presentation
  const inputCompatibility = normalizeInputCompatibility({
    manifest,
    controlRoot,
    input: input.inputCompatibility,
  })
  const runtimeCompatibility = normalizeRuntimeCompatibility({
    manifest,
    controlRoot,
    input: input.runtimeCompatibility,
  })
  const env: Record<string, string> = {
    XDG_DATA_HOME: manifest.installRoot,
    KORRI_PORTMASTER_HOME: controlRoot,
    KORRI_PORTMASTER_DIRECTORY: stripLeadingSlash(manifest.installRoot),
    KORRI_PORTMASTER_PORTS_ROOT: manifest.portsRoot,
    KORRI_PORTMASTER_INPUT_MODE: inputCompatibility.mode,
    KORRI_PORTMASTER_RUNTIME_MODE: runtimeCompatibility.mode,
    DEVICE_ARCH: input.deviceArch ?? preferredDeviceArch(manifest),
    SDL_GAMECONTROLLERCONFIG: inputCompatibility.sdlGameControllerConfig,
    ...(inputCompatibility.gptokeybPath
      ? { KORRI_PORTMASTER_GPTOKEYB_TARGET: inputCompatibility.gptokeybPath }
      : {}),
    ...(inputCompatibility.gptokeybLoaderPath
      ? {
          KORRI_PORTMASTER_GPTOKEYB_LOADER:
            inputCompatibility.gptokeybLoaderPath,
        }
      : {}),
    ...(inputCompatibility.gptokeybLogPath
      ? { KORRI_PORTMASTER_GPTOKEYB_LOG: inputCompatibility.gptokeybLogPath }
      : {}),
    ...(runtimeCompatibility.retroarchPath
      ? {
          KORRI_PORTMASTER_RETROARCH_TARGET: runtimeCompatibility.retroarchPath,
        }
      : {}),
    ...(runtimeCompatibility.retroarchLogPath
      ? {
          KORRI_PORTMASTER_RETROARCH_LOG: runtimeCompatibility.retroarchLogPath,
        }
      : {}),
    ...(fexWrapper
      ? {
          FEX_ROOTFS: fexWrapper.rootfs,
          ...fexWrapper.env,
        }
      : {}),
  }

  await mkdir(controlRoot, { recursive: true })
  await mkdir(romsControlRoot, { recursive: true })
  await mkdir(fakeDeviceRoot, { recursive: true })
  await writeFile(fakeTty, "")
  await writeFile(fakeUinput, "")
  if (inputCompatibility.gptokeybWrapperPath) {
    await writeGptokeybWrapper(inputCompatibility)
  }
  if (runtimeCompatibility.retroarchWrapperPath) {
    await writeRetroarchWrapper({ shellPath, runtimeCompatibility })
  }
  const tasksetter = tasksetterText()
  const control = controlText({
    controlRoot,
    directory: env.KORRI_PORTMASTER_DIRECTORY,
    deviceArch: env.DEVICE_ARCH,
    inputCompatibility,
  })
  await writeFile(tasksetterPath, tasksetter)
  await writeFile(join(romsControlRoot, "tasksetter"), tasksetter)
  await writeFile(controlPath, control)
  await writeFile(join(romsControlRoot, "control.txt"), control)

  if (!useBubblewrap) {
    return withPresentation({
      envelope: {
        command: shellPath,
        args: [launchScriptPath],
        cwd: dirname(launchScriptPath),
        env,
        launchScriptPath,
        controlPath,
        tasksetterPath,
        fakeDeviceRoot,
        inputCompatibility,
        runtimeCompatibility,
      },
      manifest,
      presentation: presentationInput,
    })
  }

  const bwrapPath = input.bwrapPath ?? DEFAULT_BWRAP
  const envPath = input.envPath ?? DEFAULT_ENV
  const fexRootfsBind = fexWrapper ? fexRootfsBindArgs(fexWrapper.rootfs) : []
  return withPresentation({
    envelope: {
      command: bwrapPath,
      args: [
        "--dev-bind",
        "/dev",
        "/dev",
        "--proc",
        "/proc",
        "--ro-bind",
        "/nix",
        "/nix",
        "--bind",
        "/run",
        "/run",
        "--bind",
        "/sys",
        "/sys",
        "--bind",
        "/home",
        "/home",
        "--bind-try",
        "/tmp",
        "/tmp",
        "--dir",
        "/roms",
        "--bind",
        manifest.portsRoot,
        "/roms/ports",
        "--dir",
        "/bin",
        "--ro-bind",
        shellPath,
        "/bin/bash",
        "--dir",
        "/usr",
        "--dir",
        "/usr/bin",
        "--ro-bind",
        envPath,
        "/usr/bin/env",
        "--bind",
        fakeTty,
        "/dev/tty0",
        ...fakeUinputBindArgs({ fakeUinput, inputCompatibility }),
        ...runtimeBindArgs(runtimeCompatibility),
        ...fexRootfsBind,
        "--chdir",
        dirname(launchScriptPath),
        "/bin/bash",
        launchScriptPath,
      ],
      cwd: dirname(launchScriptPath),
      env,
      launchScriptPath,
      controlPath,
      tasksetterPath,
      fakeDeviceRoot,
      inputCompatibility,
      runtimeCompatibility,
    },
    manifest,
    presentation: presentationInput,
  })
}

function normalizeRuntimeCompatibility(input: {
  readonly manifest: PortMasterInstalledManifest
  readonly controlRoot: string
  readonly input?: PortMasterLaunchRuntimeCompatibilityInput
}): PortMasterLaunchRuntimeCompatibility {
  const mode = input.input?.mode ?? "none"
  if (mode === "retroarch-libretro") {
    const retroarchLogPath =
      input.input?.retroarchLogPath ??
      join(
        input.manifest.installRoot,
        "logs",
        `${manifestSlug(input.manifest)}-retroarch.log`,
      )
    return {
      mode,
      retroarchWrapperPath: join(input.controlRoot, "retroarch"),
      ...(input.input?.retroarchPath
        ? { retroarchPath: input.input.retroarchPath }
        : {}),
      retroarchLogPath,
    }
  }
  return { mode }
}

async function writeRetroarchWrapper(input: {
  readonly shellPath: string
  readonly runtimeCompatibility: PortMasterLaunchRuntimeCompatibility
}): Promise<void> {
  const wrapperPath = input.runtimeCompatibility.retroarchWrapperPath
  if (!wrapperPath) return
  await mkdir(dirname(wrapperPath), { recursive: true })
  if (input.runtimeCompatibility.retroarchLogPath) {
    await mkdir(dirname(input.runtimeCompatibility.retroarchLogPath), {
      recursive: true,
    })
  }
  await writeFile(
    wrapperPath,
    retroarchWrapperText({
      shellPath: input.shellPath,
      runtimeCompatibility: input.runtimeCompatibility,
    }),
    { mode: 0o755 },
  )
  await chmod(wrapperPath, 0o755).catch(() => undefined)
}

function retroarchWrapperText(input: {
  readonly shellPath: string
  readonly runtimeCompatibility: PortMasterLaunchRuntimeCompatibility
}): string {
  const target = input.runtimeCompatibility.retroarchPath ?? "retroarch"
  const logPath =
    input.runtimeCompatibility.retroarchLogPath ??
    "/tmp/korri-portmaster-retroarch.log"
  return `#!${input.shellPath}
set -u
log_path=\${KORRI_PORTMASTER_RETROARCH_LOG:-${shellQuote(logPath)}}
target=\${KORRI_PORTMASTER_RETROARCH_TARGET:-${shellQuote(target)}}
mkdir -p "$(dirname "$log_path")"
{
  printf '[korri-portmaster] retroarch args:'
  printf ' %q' "$@"
  printf '\\n'
} >> "$log_path" 2>&1
exec "$target" "$@" >> "$log_path" 2>&1
`
}

function runtimeBindArgs(
  runtimeCompatibility: PortMasterLaunchRuntimeCompatibility,
): readonly string[] {
  if (!runtimeCompatibility.retroarchWrapperPath) return []
  return [
    "--ro-bind",
    runtimeCompatibility.retroarchWrapperPath,
    "/usr/bin/retroarch",
  ]
}

function normalizeInputCompatibility(input: {
  readonly manifest: PortMasterInstalledManifest
  readonly controlRoot: string
  readonly input?: PortMasterLaunchInputCompatibilityInput
}): PortMasterLaunchInputCompatibility {
  const mode = input.input?.mode ?? "none"
  const sdlGameControllerConfig = input.input?.sdlGameControllerConfig ?? ""
  if (mode === "gptokeyb") {
    const gptokeybLogPath =
      input.input?.gptokeybLogPath ??
      join(
        input.manifest.installRoot,
        "logs",
        `${manifestSlug(input.manifest)}-gptokeyb.log`,
      )
    return {
      mode,
      sdlGameControllerConfig,
      bindRealUinput: input.input?.bindRealUinput ?? true,
      gptokeybWrapperPath: join(input.controlRoot, "gptokeyb"),
      ...(input.input?.gptokeybPath
        ? { gptokeybPath: input.input.gptokeybPath }
        : {}),
      ...(input.input?.gptokeybLoaderPath
        ? { gptokeybLoaderPath: input.input.gptokeybLoaderPath }
        : {}),
      gptokeybLogPath,
    }
  }
  return {
    mode,
    sdlGameControllerConfig,
    bindRealUinput: input.input?.bindRealUinput ?? false,
  }
}

async function writeGptokeybWrapper(
  inputCompatibility: PortMasterLaunchInputCompatibility,
): Promise<void> {
  if (!inputCompatibility.gptokeybWrapperPath) return
  await mkdir(dirname(inputCompatibility.gptokeybWrapperPath), {
    recursive: true,
  })
  if (inputCompatibility.gptokeybLogPath) {
    await mkdir(dirname(inputCompatibility.gptokeybLogPath), {
      recursive: true,
    })
  }
  await writeFile(
    inputCompatibility.gptokeybWrapperPath,
    gptokeybWrapperText(inputCompatibility),
    { mode: 0o755 },
  )
  await chmod(inputCompatibility.gptokeybWrapperPath, 0o755).catch(
    () => undefined,
  )
}

function gptokeybWrapperText(
  inputCompatibility: PortMasterLaunchInputCompatibility,
): string {
  const target = inputCompatibility.gptokeybPath ?? ""
  const loader = inputCompatibility.gptokeybLoaderPath ?? ""
  const logPath =
    inputCompatibility.gptokeybLogPath ?? "/tmp/korri-portmaster-gptokeyb.log"
  return `#!/usr/bin/env bash
set -u
log_path=\${KORRI_PORTMASTER_GPTOKEYB_LOG:-${shellQuote(logPath)}}
target=\${KORRI_PORTMASTER_GPTOKEYB_TARGET:-${shellQuote(target)}}
loader=\${KORRI_PORTMASTER_GPTOKEYB_LOADER:-${shellQuote(loader)}}
mkdir -p "$(dirname "$log_path")"
{
  printf '[korri-portmaster] gptokeyb args:'
  printf ' %q' "$@"
  printf '\\n'
} >> "$log_path" 2>&1
if [ -z "$target" ]; then
  printf '[korri-portmaster] no gptokeyb target configured; input helper disabled\\n' >> "$log_path" 2>&1
  exit 0
fi
if [ -n "$loader" ]; then
  "$loader" "$target" "$@" >> "$log_path" 2>&1
else
  "$target" "$@" >> "$log_path" 2>&1
fi
status=$?
printf '[korri-portmaster] gptokeyb exited with status %s\\n' "$status" >> "$log_path" 2>&1
exit 0
`
}

function fakeUinputBindArgs(input: {
  readonly fakeUinput: string
  readonly inputCompatibility: PortMasterLaunchInputCompatibility
}): readonly string[] {
  return input.inputCompatibility.bindRealUinput
    ? []
    : ["--bind", input.fakeUinput, "/dev/uinput"]
}

async function withPresentation(input: {
  readonly envelope: PortMasterLaunchEnvelope
  readonly manifest: PortMasterInstalledManifest
  readonly presentation?: PortMasterLaunchPresentationInput
}): Promise<PortMasterLaunchEnvelope> {
  if (!input.presentation || input.presentation.mode === "none") {
    return input.envelope
  }

  const launcherPath = join(
    input.manifest.installRoot,
    "PortMaster",
    "launch.sh",
  )
  const logPath =
    input.presentation.logPath ??
    join(
      input.manifest.installRoot,
      "logs",
      `${manifestSlug(input.manifest)}.log`,
    )
  const windowMatcher =
    input.presentation.windowMatcher ?? defaultWindowMatcher(input.manifest)
  const windowProbe =
    input.presentation.windowProbe ?? defaultWindowProbe(input.manifest)
  const swaymsgPath = input.presentation.swaymsgPath ?? "swaymsg"
  const presentation: PortMasterLaunchPresentation = {
    mode: "sway-fullscreen",
    launcherPath,
    logPath,
    windowMatcher,
    swaymsgPath,
  }

  await mkdir(dirname(launcherPath), { recursive: true })
  await mkdir(dirname(logPath), { recursive: true })
  await writeFile(
    launcherPath,
    launcherText({
      envelope: input.envelope,
      logPath,
      swaymsgPath,
      windowMatcher,
      windowProbe,
      startupPollAttempts: input.presentation.startupPollAttempts ?? 30,
      startupPollDelayMs: input.presentation.startupPollDelayMs ?? 200,
    }),
    { mode: 0o755 },
  )
  await chmod(launcherPath, 0o755).catch(() => undefined)

  return {
    ...input.envelope,
    command: launcherPath,
    args: [],
    presentation,
  }
}

function launcherText(input: {
  readonly envelope: PortMasterLaunchEnvelope
  readonly logPath: string
  readonly swaymsgPath: string
  readonly windowMatcher: string
  readonly windowProbe: string
  readonly startupPollAttempts: number
  readonly startupPollDelayMs: number
}): string {
  const exports = Object.entries(input.envelope.env)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join("\n")
  const command = [input.envelope.command, ...input.envelope.args]
    .map(shellQuote)
    .join(" ")
  return `#!/usr/bin/env bash\nset -euo pipefail\nset -m\n${exports}\nmkdir -p ${shellQuote(dirname(input.logPath))}\ncd ${shellQuote(input.envelope.cwd)}\nchild_pid=\ncleanup() {\n  if [ -n "\${child_pid:-}" ]; then\n    kill -- "-$child_pid" 2>/dev/null || kill "$child_pid" 2>/dev/null || true\n    sleep 1\n    kill -KILL -- "-$child_pid" 2>/dev/null || kill -KILL "$child_pid" 2>/dev/null || true\n    wait "$child_pid" 2>/dev/null || true\n  fi\n}\nterminate() {\n  cleanup\n  exit 143\n}\ntrap terminate INT TERM\ntrap cleanup EXIT\n${command} > ${shellQuote(input.logPath)} 2>&1 &\nchild_pid=$!\nfor ((attempt = 0; attempt < ${input.startupPollAttempts}; attempt += 1)); do\n  if ${shellQuote(input.swaymsgPath)} -t get_tree 2>/dev/null | grep -F ${shellQuote(input.windowProbe)} >/dev/null 2>&1; then\n    ${shellQuote(input.swaymsgPath)} ${shellQuote(input.windowMatcher)} focus >/dev/null 2>&1 || true\n    ${shellQuote(input.swaymsgPath)} ${shellQuote(input.windowMatcher)} fullscreen enable >/dev/null 2>&1 || true\n    break\n  fi\n  sleep ${input.startupPollDelayMs / 1000}\ndone\nset +e\nwait "$child_pid"\nstatus=$?\nset -e\ntrap - INT TERM EXIT\nexit "$status"\n`
}

function defaultWindowMatcher(manifest: PortMasterInstalledManifest): string {
  return `[class="${escapeSwayCriteria(defaultWindowProbe(manifest))}"]`
}

function defaultWindowProbe(manifest: PortMasterInstalledManifest): string {
  const wrapped = manifest.extracted.fexWrappers?.[0]?.path
  const binary =
    wrapped ??
    manifest.extracted.binaries.find(candidate => candidate.arch)?.path
  return binary ? basename(binary) : manifestSlug(manifest)
}

function escapeSwayCriteria(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
}

function manifestSlug(manifest: PortMasterInstalledManifest): string {
  return manifest.id.replace(/\.zip$/i, "").replace(/[^a-zA-Z0-9._-]+/g, "-")
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

async function readManifest(
  manifestPath: string | undefined,
): Promise<PortMasterInstalledManifest> {
  if (!manifestPath) {
    throw new Error("manifestPath is required when manifest is not provided")
  }
  return JSON.parse(await readFile(manifestPath, "utf8"))
}

function selectLaunchScript(
  manifest: PortMasterInstalledManifest,
  launchScript: string | undefined,
): string {
  if (launchScript) return launchScript
  const script = manifest.extracted.launchScripts[0]
  if (!script)
    throw new Error(`PortMaster install has no launch scripts: ${manifest.id}`)
  return script.path
}

function preferredDeviceArch(manifest: PortMasterInstalledManifest): string {
  const fexArch = manifest.extracted.fexWrappers?.[0]?.arch
  if (fexArch) return fexArch
  const detected = manifest.extracted.binaries.find(binary => binary.arch)?.arch
  if (detected) return detected
  return manifest.catalog.arch[0] ?? DEFAULT_DEVICE_ARCH
}

function fexRootfsBindArgs(rootfs: string): readonly string[] {
  if (!rootfs.startsWith("/")) return []
  if (rootfs === "/var" || rootfs.startsWith("/var/")) {
    return ["--bind-try", "/var", "/var"]
  }
  return ["--bind-try", rootfs, rootfs]
}

function stripLeadingSlash(path: string): string {
  const normalized = relative("/", path)
  return normalized === "" ? path.replace(/^\/+/, "") : normalized
}

function tasksetterText(): string {
  return `# Generated by @korri:portmaster.\nTASKSET="\${TASKSET:-}"\n`
}

function controlText(input: {
  readonly controlRoot: string
  readonly directory: string
  readonly deviceArch: string
  readonly inputCompatibility: PortMasterLaunchInputCompatibility
}): string {
  const gptokeybCommand = input.inputCompatibility.gptokeybWrapperPath ?? "true"
  const sdlGameControllerConfig =
    input.inputCompatibility.sdlGameControllerConfig
  return `# Generated by @korri:portmaster.\nCFW_NAME="\${CFW_NAME:-korri}"\nDEVICE_ARCH="\${DEVICE_ARCH:-${input.deviceArch}}"\ncontrolfolder="\${KORRI_PORTMASTER_HOME:-${input.controlRoot}}"\ndirectory="\${KORRI_PORTMASTER_DIRECTORY:-${input.directory}}"\nESUDO="\${ESUDO:-}"\nGPTOKEYB="\${GPTOKEYB:-${gptokeybCommand}}"\nif [ -z "\${SDL_GAMECONTROLLERCONFIG:-}" ]; then\n  export SDL_GAMECONTROLLERCONFIG=${shellQuote(sdlGameControllerConfig)}\nfi\nsdl_controllerconfig="\${SDL_GAMECONTROLLERCONFIG:-}"\nget_controls() {\n  export SDL_GAMECONTROLLERCONFIG="\${SDL_GAMECONTROLLERCONFIG:-$sdl_controllerconfig}"\n}\npm_platform_helper() { :; }\npm_finish() { :; }\n`
}

export function launchScriptDisplayName(envelope: PortMasterLaunchEnvelope) {
  return basename(envelope.launchScriptPath)
}
