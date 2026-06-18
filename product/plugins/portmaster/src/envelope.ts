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
  const env: Record<string, string> = {
    XDG_DATA_HOME: manifest.installRoot,
    KORRI_PORTMASTER_HOME: controlRoot,
    KORRI_PORTMASTER_DIRECTORY: stripLeadingSlash(manifest.installRoot),
    KORRI_PORTMASTER_PORTS_ROOT: manifest.portsRoot,
    DEVICE_ARCH: input.deviceArch ?? preferredDeviceArch(manifest),
    SDL_GAMECONTROLLERCONFIG: "",
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
  const tasksetter = tasksetterText()
  const control = controlText({
    directory: env.KORRI_PORTMASTER_DIRECTORY,
    deviceArch: env.DEVICE_ARCH,
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
        "--bind",
        fakeUinput,
        "/dev/uinput",
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
    },
    manifest,
    presentation: presentationInput,
  })
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
  return `#!/usr/bin/env bash\nset -euo pipefail\nset -m\n${exports}\nmkdir -p ${shellQuote(dirname(input.logPath))}\ncd ${shellQuote(input.envelope.cwd)}\nchild_pid=\ncleanup() {\n  if [ -n "\${child_pid:-}" ]; then\n    kill -- "-$child_pid" 2>/dev/null || kill "$child_pid" 2>/dev/null || true\n    wait "$child_pid" 2>/dev/null || true\n  fi\n}\ntrap cleanup INT TERM EXIT\n${command} > ${shellQuote(input.logPath)} 2>&1 &\nchild_pid=$!\nfor ((attempt = 0; attempt < ${input.startupPollAttempts}; attempt += 1)); do\n  if ${shellQuote(input.swaymsgPath)} -t get_tree 2>/dev/null | grep -F ${shellQuote(input.windowProbe)} >/dev/null 2>&1; then\n    ${shellQuote(input.swaymsgPath)} ${shellQuote(input.windowMatcher)} focus >/dev/null 2>&1 || true\n    ${shellQuote(input.swaymsgPath)} ${shellQuote(input.windowMatcher)} fullscreen enable >/dev/null 2>&1 || true\n    break\n  fi\n  sleep ${input.startupPollDelayMs / 1000}\ndone\nset +e\nwait "$child_pid"\nstatus=$?\nset -e\ntrap - INT TERM EXIT\nexit "$status"\n`
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
  readonly directory: string
  readonly deviceArch: string
}): string {
  return `# Generated by @korri:portmaster.\nCFW_NAME="\${CFW_NAME:-korri}"\nDEVICE_ARCH="\${DEVICE_ARCH:-${input.deviceArch}}"\ndirectory="\${KORRI_PORTMASTER_DIRECTORY:-${input.directory}}"\nESUDO="\${ESUDO:-}"\nGPTOKEYB="\${GPTOKEYB:-true}"\nsdl_controllerconfig="\${SDL_GAMECONTROLLERCONFIG:-}"\nget_controls() {\n  export SDL_GAMECONTROLLERCONFIG="\${SDL_GAMECONTROLLERCONFIG:-$sdl_controllerconfig}"\n}\npm_platform_helper() { :; }\npm_finish() { :; }\n`
}

export function launchScriptDisplayName(envelope: PortMasterLaunchEnvelope) {
  return basename(envelope.launchScriptPath)
}
