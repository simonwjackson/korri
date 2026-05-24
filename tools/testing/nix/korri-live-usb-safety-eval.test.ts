import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const FLAKE_ROOT = resolve(import.meta.dir, "..", "..", "..")
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "korri-live-usb-safety-eval.fixture.nix",
)
const RESOLVER_PATH = resolve(
  FLAKE_ROOT,
  "nix/images/live-usb-persistence-resolver.sh",
)

setDefaultTimeout(30_000)

type SafetyEvalResult = {
  persistence: {
    enabled: boolean
    root: string | null
    bootMountPoint: string | null
    label: string | null
    markerPersistent: string | null
    markerEphemeral: string | null
  }
  kioskState: {
    home: string
    stateHome: string
    dataHome: string
    configHome: string
    environment: Record<string, string>
    wants: string[]
    requires: string[]
    after: string[]
  }
  persistenceService: {
    exists: boolean
    wantedBy: string[]
    before: string[]
    after: string[]
    path: string[]
  }
  safety: {
    fileSystems: string[]
    swapDevices: unknown[]
    services: string[]
    udisks2Enabled: boolean
    gvfsEnabled: boolean
  }
}

function evalFixture(): SafetyEvalResult {
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; }`
  const child = spawnSync(
    "nix",
    [
      "--extra-experimental-features",
      "nix-command flakes",
      "eval",
      "--impure",
      "--json",
      "--file",
      FIXTURE_PATH,
      "--apply",
      apply,
    ],
    {
      cwd: FLAKE_ROOT,
      encoding: "utf8",
      env: { ...process.env, NIX_PATH: "" },
    },
  )

  if (child.status !== 0) {
    throw new Error(`nix eval failed (exit ${child.status}):\n${child.stderr}`)
  }

  return JSON.parse(child.stdout) as SafetyEvalResult
}

describe("Korri live USB safety evaluation", () => {
  const result = evalFixture()

  it("routes Korri and moonlight client state under USB-scoped persistence", () => {
    expect(result.persistence.enabled).toBe(true)
    expect(result.persistence.root).toBe("/persist/korri-live-usb")
    expect(result.kioskState.home).toBe("/persist/korri-live-usb/home")
    expect(result.kioskState.configHome).toBe(
      "/persist/korri-live-usb/home/.config",
    )
    expect(result.kioskState.dataHome).toBe(
      "/persist/korri-live-usb/home/.local/share",
    )
    expect(result.kioskState.stateHome).toBe(
      "/persist/korri-live-usb/home/.local/state",
    )
    expect(result.kioskState.environment.XDG_CACHE_HOME).toBe(
      "/persist/korri-live-usb/home/.cache",
    )
    expect(result.kioskState.environment.KORRI_MOONLIGHT_STATE_HOME).toBe(
      "/persist/korri-live-usb/home/.cache/moonlight",
    )
  })

  it("orders kiosk startup after the persistence resolver", () => {
    expect(result.persistenceService.exists).toBe(true)
    expect(result.persistenceService.wantedBy).toContain("multi-user.target")
    expect(result.persistenceService.before).toContain("korri-kiosk.service")
    expect(result.kioskState.wants).toContain(
      "korri-live-usb-persistence.service",
    )
    expect(result.kioskState.requires).toContain(
      "korri-live-usb-persistence.service",
    )
    expect(result.kioskState.after).toContain(
      "korri-live-usb-persistence.service",
    )
  })

  it("keeps internal disk mutation surfaces disabled", () => {
    expect(result.safety.fileSystems).not.toContain("/mnt")
    expect(result.safety.fileSystems).not.toContain("/home")
    expect(result.safety.swapDevices).toEqual([])
    expect(result.safety.udisks2Enabled).toBe(false)
    expect(result.safety.gvfsEnabled).toBe(false)
    expect(result.safety.services.join("\n")).not.toMatch(
      /install|partition|repartition|growfs|udisks/i,
    )
  })

  it("executes the resolver with sibling USB persistence and writable state", () => {
    const rig = makeResolverRig({
      bootSource: "/fake/sdb1",
      parentDevice: "/fake/sdb",
      transport: "usb",
      removable: "1",
      partitions: [
        { device: "/fake/sdb1", label: "KORRI-ISO" },
        { device: "/fake/sdb2", label: "KORRI-PERSIST" },
      ],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      expect(readFileSync(rig.mountLog, "utf8")).toContain("/fake/sdb2 ")
      expect(existsSync(`${rig.root}/.korri-live-usb-persistent`)).toBe(true)
      expect(existsSync(`${rig.root}/home/.cache/moonlight`)).toBe(true)
      expect(readFileSync(rig.chownLog, "utf8")).toContain("korri:korri")
    } finally {
      rig.cleanup()
    }
  })

  it("falls back to tmpfs when the boot parent is not removable USB", () => {
    const rig = makeResolverRig({
      bootSource: "/fake/nvme0n1p1",
      parentDevice: "/fake/nvme0n1",
      transport: "nvme",
      removable: "0",
      partitions: [{ device: "/fake/nvme0n1p2", label: "KORRI-PERSIST" }],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      expect(readFileSync(rig.mountLog, "utf8")).toContain("tmpfs")
      expect(readFileSync(rig.mountLog, "utf8")).not.toContain(
        "/fake/nvme0n1p2",
      )
      expect(existsSync(`${rig.root}/.korri-live-usb-ephemeral`)).toBe(true)
    } finally {
      rig.cleanup()
    }
  })

  it("falls back to tmpfs when a mounted persistence partition cannot be prepared", () => {
    const rig = makeResolverRig({
      bootSource: "/fake/sdb1",
      parentDevice: "/fake/sdb",
      transport: "usb",
      removable: "1",
      chownFails: true,
      partitions: [
        { device: "/fake/sdb1", label: "KORRI-ISO" },
        { device: "/fake/sdb2", label: "KORRI-PERSIST" },
      ],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      const mountLog = readFileSync(rig.mountLog, "utf8")
      expect(mountLog).toContain("/fake/sdb2")
      expect(readFileSync(rig.umountLog, "utf8")).toContain(rig.root)
      expect(mountLog).toContain("tmpfs")
      expect(existsSync(`${rig.root}/.korri-live-usb-ephemeral`)).toBe(true)
    } finally {
      rig.cleanup()
    }
  })

  it("falls back to tmpfs when a sibling persistence mount fails", () => {
    const rig = makeResolverRig({
      bootSource: "/fake/sdb1",
      parentDevice: "/fake/sdb",
      transport: "usb",
      removable: "1",
      mountFailures: ["/fake/sdb2"],
      partitions: [
        { device: "/fake/sdb1", label: "KORRI-ISO" },
        { device: "/fake/sdb2", label: "KORRI-PERSIST" },
      ],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      const mountLog = readFileSync(rig.mountLog, "utf8")
      expect(mountLog).toContain("/fake/sdb2")
      expect(mountLog).toContain("tmpfs")
      expect(existsSync(`${rig.root}/.korri-live-usb-ephemeral`)).toBe(true)
    } finally {
      rig.cleanup()
    }
  })

  it("uses a runtime sibling-of-boot-device resolver instead of a generic label mount", () => {
    expect(existsSync(RESOLVER_PATH)).toBe(true)
    const resolver = readFileSync(RESOLVER_PATH, "utf8")
    expect(resolver).toContain("findmnt")
    expect(resolver).toContain("lsblk")
    expect(resolver).toContain("PKNAME")
    expect(resolver).toContain("blkid")
    expect(resolver).toContain("KORRI_LIVE_USB_BOOT_MOUNT")
    expect(resolver).not.toContain("/dev/disk/by-label")
  })
})

type ResolverPartition = {
  readonly device: string
  readonly label: string
}

type ResolverRigConfig = {
  readonly bootSource: string
  readonly parentDevice: string
  readonly transport: string
  readonly removable: string
  readonly partitions: readonly ResolverPartition[]
  readonly mountFailures?: readonly string[]
  readonly chownFails?: boolean
}

type ResolverRig = {
  readonly root: string
  readonly bin: string
  readonly mountLog: string
  readonly chownLog: string
  readonly umountLog: string
  readonly cleanup: () => void
}

function makeResolverRig(config: ResolverRigConfig): ResolverRig {
  const dir = mkdtempSync(resolve(tmpdir(), "korri-live-usb-resolver-"))
  const bin = resolve(dir, "bin")
  const root = resolve(dir, "state")
  const mountLog = resolve(dir, "mount.log")
  const chownLog = resolve(dir, "chown.log")
  const umountLog = resolve(dir, "umount.log")
  writeFileSync(mountLog, "")
  writeFileSync(chownLog, "")
  writeFileSync(umountLog, "")
  writeShim(
    bin,
    "findmnt",
    `#!/usr/bin/env bash\nprintf '%s\\n' '${config.bootSource}'\n`,
  )
  writeShim(
    bin,
    "readlink",
    `#!/usr/bin/env bash\nif [ "$1" = "-f" ]; then printf '%s\\n' "$2"; else printf '%s\\n' "$1"; fi\n`,
  )
  const partitionRows = config.partitions
    .map(partition => `${partition.device} part`)
    .join("\\n")
  writeShim(
    bin,
    "lsblk",
    `#!/usr/bin/env bash\nargs="$*"\ncase "$args" in\n  *PKNAME*) printf '%s\\n' '${config.parentDevice.replace(/^\/dev\//, "").replace(/^\/fake\//, "")}' ;;\n  *TRAN*) printf '%s\\n' '${config.transport}' ;;\n  *RM*) printf '%s\\n' '${config.removable}' ;;\n  *) printf '${partitionRows}\\n' ;;\nesac\n`,
  )
  const labels = config.partitions
    .map(partition => `${partition.device}:${partition.label}`)
    .join(" ")
  writeShim(
    bin,
    "blkid",
    `#!/usr/bin/env bash\nfor entry in ${labels}; do\n  device="\${entry%%:*}"\n  label="\${entry#*:}"\n  if [ "$device" = "\${@: -1}" ]; then printf '%s\\n' "$label"; exit 0; fi\ndone\nexit 2\n`,
  )
  writeShim(bin, "mountpoint", `#!/usr/bin/env bash\nexit 1\n`)
  const mountFailures = (config.mountFailures ?? []).join(" ")
  writeShim(
    bin,
    "mount",
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${mountLog}'\nfor failed in ${mountFailures}; do\n  if [ "$1" = "$failed" ]; then exit 32; fi\ndone\nexit 0\n`,
  )
  const chownFailureFlag = resolve(dir, "chown-failed-once")
  writeShim(
    bin,
    "chown",
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${chownLog}'\nif ${config.chownFails ? "true" : "false"} && [ ! -f '${chownFailureFlag}' ]; then touch '${chownFailureFlag}'; exit 33; fi\nexit 0\n`,
  )
  writeShim(
    bin,
    "umount",
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${umountLog}'\nexit 0\n`,
  )
  return {
    root,
    bin,
    mountLog,
    chownLog,
    umountLog,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

function runResolverRig(rig: ResolverRig) {
  return spawnSync("bash", [RESOLVER_PATH], {
    cwd: FLAKE_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${rig.bin}:${process.env.PATH ?? ""}`,
      KORRI_LIVE_USB_PERSISTENCE_ROOT: rig.root,
      KORRI_LIVE_USB_BOOT_MOUNT: "/iso",
      KORRI_LIVE_USB_SKIP_BLOCK_DEVICE_CHECK: "1",
      KORRI_LIVE_USB_STATE_USER: "korri",
      KORRI_LIVE_USB_STATE_GROUP: "korri",
    },
  })
}

function writeShim(dir: string, name: string, content: string): void {
  const path = resolve(dir, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
}
