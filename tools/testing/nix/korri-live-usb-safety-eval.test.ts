// The nix-eval portion of this file is already module-load batched:
// `evalFixture()` runs once at the `describe()` body and every `it()` that
// asserts nix-derived state reads from the shared `result`. The remaining
// per-test cost is bash resolver-script invocations against fake-PATH
// shims, which are independent of nix evaluation. See
// docs/plans/2026-05-24-006-refactor-nix-test-harness-plan.md U4 and the
// exemplar in tools/testing/nix/korri-desktop-build-graph.test.ts.
import { describe, expect, it, setDefaultTimeout } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
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

type LiveUsbPersistenceEntry = {
  kind: "directory" | "file"
  target: string
  source: string
  owner?: string
  group?: string
  mode?: string
}

type LiveUsbSystemSummary = {
  persistence: {
    enabled: boolean
    root: string | null
    bootMountPoint: string | null
    label: string | null
    markerPersistent: string | null
    markerEphemeral: string | null
    artifact: "product" | "developer" | null
    scope: "product-allowlist" | "developer-broad" | null
    productAllowlist: LiveUsbPersistenceEntry[]
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
    environment: Record<string, string>
  }
  safety: {
    fileSystems: string[]
    swapDevices: unknown[]
    services: string[]
    udisks2Enabled: boolean
    gvfsEnabled: boolean
    sshEnabled: boolean
  }
}

type SafetyEvalResult = {
  product: LiveUsbSystemSummary
  developer: LiveUsbSystemSummary
}

function evalFixture(
  extraArgs: Record<string, string | boolean> = {},
): SafetyEvalResult {
  const renderedArgs = Object.entries(extraArgs)
    .map(
      ([name, value]) =>
        `${name} = ${value === true ? "true" : value === false ? "false" : value};`,
    )
    .join(" ")
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; ${renderedArgs} }`
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

function evalFixtureFailure(extraArgs: Record<string, string | boolean>) {
  const renderedArgs = Object.entries(extraArgs)
    .map(
      ([name, value]) =>
        `${name} = ${value === true ? "true" : value === false ? "false" : value};`,
    )
    .join(" ")
  const apply = `f: f { flakeRoot = ${FLAKE_ROOT}; ${renderedArgs} }`
  return spawnSync(
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
}

describe("Korri live USB safety evaluation", () => {
  const result = evalFixture()

  it("keeps Product as the default live USB artifact with explicit allowlist metadata", () => {
    expect(result.product.persistence.enabled).toBe(true)
    expect(result.product.persistence.root).toBe("/persist/korri-live-usb")
    expect(result.product.persistence.artifact).toBe("product")
    expect(result.product.persistence.scope).toBe("product-allowlist")
    expect(result.product.kioskState.environment.KORRI_LIVE_USB_ARTIFACT).toBe(
      "product",
    )
    expect(
      result.product.persistenceService.environment.KORRI_LIVE_USB_ARTIFACT,
    ).toBe("product")
    expect(result.product.persistence.productAllowlist).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "directory",
          target: "/home/korri/.config/korri",
        }),
        expect.objectContaining({
          kind: "directory",
          target: "/home/korri/.cache/moonlight",
        }),
        expect.objectContaining({
          kind: "file",
          target: "/var/lib/korri-live-usb/device-id",
        }),
      ]),
    )
    expect(
      result.product.kioskState.environment.KORRI_MOONLIGHT_STATE_HOME,
    ).toBe("/home/korri/.cache/moonlight")
  })

  it("exposes Developer artifact metadata without enabling SSH by default", () => {
    expect(result.developer.persistence.enabled).toBe(true)
    expect(result.developer.persistence.artifact).toBe("developer")
    expect(result.developer.persistence.scope).toBe("developer-broad")
    expect(
      result.developer.kioskState.environment.KORRI_LIVE_USB_ARTIFACT,
    ).toBe("developer")
    expect(
      result.developer.persistenceService.environment.KORRI_LIVE_USB_ARTIFACT,
    ).toBe("developer")
    expect(result.developer.safety.sshEnabled).toBe(false)
  })

  it("rejects invalid live USB artifact values during Nix evaluation", () => {
    const invalid = evalFixtureFailure({ invalidArtifact: true })
    expect(invalid.status).not.toBe(0)
    expect(invalid.stderr).toContain(
      "services.korri.liveUsbPersistence.artifact",
    )
  })

  it("does not declare broad Product persistence roots", () => {
    expect(result.product.kioskState.home).toBe("/home/korri")
    expect(result.product.kioskState.configHome).toBe("/home/korri/.config")
    expect(result.product.kioskState.dataHome).toBe("/home/korri/.local/share")
    expect(result.product.kioskState.stateHome).toBe("/home/korri/.local/state")
    expect(result.product.kioskState.environment.XDG_CACHE_HOME).toBe(
      "/home/korri/.cache",
    )
    expect(
      result.product.persistence.productAllowlist.map(entry => entry.target),
    ).not.toEqual(
      expect.arrayContaining(["/home/korri", "/etc", "/var", "/var/log"]),
    )
  })

  it("orders kiosk startup after the persistence resolver", () => {
    expect(result.product.persistenceService.exists).toBe(true)
    expect(result.product.persistenceService.wantedBy).toContain(
      "multi-user.target",
    )
    expect(result.product.persistenceService.before).toContain(
      "korri-kiosk.service",
    )
    expect(result.product.kioskState.wants).toContain(
      "korri-live-usb-persistence.service",
    )
    expect(result.product.kioskState.requires).toContain(
      "korri-live-usb-persistence.service",
    )
    expect(result.product.kioskState.after).toContain(
      "korri-live-usb-persistence.service",
    )
  })

  it("keeps internal disk mutation surfaces disabled", () => {
    expect(result.product.safety.fileSystems).not.toContain("/mnt")
    expect(result.product.safety.fileSystems).not.toContain("/home")
    expect(result.product.safety.swapDevices).toEqual([])
    expect(result.product.safety.udisks2Enabled).toBe(false)
    expect(result.product.safety.gvfsEnabled).toBe(false)
    expect(result.product.safety.services.join("\n")).not.toMatch(
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
      expect(readFileSync(rig.mountLog, "utf8")).toContain(
        "-o nosuid,nodev /fake/sdb2 ",
      )
      expect(existsSync(`${rig.root}/.korri-live-usb-persistent`)).toBe(true)
      expect(existsSync(`${rig.root}/product/home/.config/korri`)).toBe(true)
      expect(existsSync(`${rig.root}/product/home/.cache/moonlight`)).toBe(true)
      expect(
        statSync(`${rig.root}/product/home/.config/korri`).mode & 0o777,
      ).toBe(0o700)
      expect(existsSync(`${rig.root}/home`)).toBe(false)
      expect(lstatSync(`${rig.home}/.config/korri`).isSymbolicLink()).toBe(true)
      expect(readlinkSync(`${rig.home}/.config/korri`)).toBe(
        `${rig.root}/product/home/.config/korri`,
      )
      expect(lstatSync(`${rig.home}/.cache/moonlight`).isSymbolicLink()).toBe(
        true,
      )
      expect(existsSync(rig.deviceId)).toBe(true)
      expect(readFileSync(rig.chownLog, "utf8")).toContain("korri:korri")
    } finally {
      rig.cleanup()
    }
  })

  it("treats duplicate sibling persistence labels as unsafe", () => {
    const rig = makeResolverRig({
      bootSource: "/fake/sdb1",
      parentDevice: "/fake/sdb",
      transport: "usb",
      removable: "1",
      partitions: [
        { device: "/fake/sdb1", label: "KORRI-ISO" },
        { device: "/fake/sdb2", label: "KORRI-PERSIST" },
        { device: "/fake/sdb3", label: "KORRI-PERSIST" },
      ],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      const mountLog = readFileSync(rig.mountLog, "utf8")
      expect(mountLog).toContain("tmpfs")
      expect(mountLog).not.toContain("/fake/sdb2")
      expect(mountLog).not.toContain("/fake/sdb3")
      expect(result.stderr).toContain("multiple")
    } finally {
      rig.cleanup()
    }
  })

  it("locks Developer namespace before starting a Product session", () => {
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
      mkdirSync(`${rig.root}/developer/home`, { recursive: true })
      writeFileSync(`${rig.root}/developer/home/sentinel`, "developer-only")
      const result = runResolverRig(rig)
      expect(result.status, result.stderr).toBe(0)
      expect(statSync(`${rig.root}/developer`).mode & 0o777).toBe(0o000)
    } finally {
      if (existsSync(`${rig.root}/developer`)) {
        chmodSync(`${rig.root}/developer`, 0o700)
      }
      rig.cleanup()
    }
  })

  it("prepares broad Developer state only under the Developer namespace", () => {
    const rig = makeResolverRig({
      artifact: "developer",
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
      expect(existsSync(`${rig.root}/.korri-live-usb-persistent`)).toBe(true)
      expect(existsSync(`${rig.root}/developer/home/.config`)).toBe(true)
      expect(existsSync(`${rig.root}/developer/home/.cache/moonlight`)).toBe(
        true,
      )
      expect(existsSync(`${rig.root}/product/home/.config/korri`)).toBe(false)
    } finally {
      rig.cleanup()
    }
  })

  it("fails visibly for Developer when the boot parent is not removable USB", () => {
    const rig = makeResolverRig({
      artifact: "developer",
      bootSource: "/fake/nvme0n1p1",
      parentDevice: "/fake/nvme0n1",
      transport: "nvme",
      removable: "0",
      partitions: [{ device: "/fake/nvme0n1p2", label: "KORRI-PERSIST" }],
    })
    try {
      const result = runResolverRig(rig)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain("Developer")
      expect(readFileSync(rig.mountLog, "utf8")).not.toContain("tmpfs")
      expect(existsSync(`${rig.root}/.korri-live-usb-ephemeral`)).toBe(false)
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
  readonly artifact?: "product" | "developer"
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
  readonly home: string
  readonly deviceId: string
  readonly mountLog: string
  readonly chownLog: string
  readonly umountLog: string
  readonly artifact: "product" | "developer"
  readonly cleanup: () => void
}

function makeResolverRig(config: ResolverRigConfig): ResolverRig {
  const dir = mkdtempSync(resolve(tmpdir(), "korri-live-usb-resolver-"))
  const bin = resolve(dir, "bin")
  const root = resolve(dir, "state")
  const home = resolve(dir, "home")
  const deviceId = resolve(dir, "device-id")
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
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${mountLog}'\nfor failed in ${mountFailures}; do\n  for arg in "$@"; do\n    if [ "$arg" = "$failed" ]; then exit 32; fi\n  done\ndone\nexit 0\n`,
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
    artifact: config.artifact ?? "product",
    root,
    home,
    deviceId,
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
      KORRI_LIVE_USB_ARTIFACT: rig.artifact,
      KORRI_LIVE_USB_RUNTIME_HOME: rig.home,
      KORRI_LIVE_USB_DEVICE_ID_TARGET: rig.deviceId,
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
