import { describe, expect, it } from "bun:test"

const moduleSource = await Bun.file(
  "product/plugins/remap/nix/nixos-module.nix",
).text()

describe("Remap plugin NixOS module", () => {
  it("creates the fixed Remap runner identity", () => {
    expect(moduleSource).toContain('default = "korri-remap-runner"')
    expect(moduleSource).toContain(`users.groups.$${"{cfg.runnerGroup}"}`)
    expect(moduleSource).toContain(`users.users.$${"{cfg.runnerUser}"}`)
    expect(moduleSource).toContain("isSystemUser = true")
    expect(moduleSource).toContain('extraGroups = [ "render" "video" ]')
  })

  it("installs the bridge as a root-owned setuid wrapper", () => {
    expect(moduleSource).toContain("security.wrappers.korri-remap-bridge")
    expect(moduleSource).toContain(
      `source = "$${"{cfg.package}"}/bin/korri-remap-bridge"`,
    )
    expect(moduleSource).toContain('owner = "root"')
    expect(moduleSource).toContain("setuid = true")
  })

  it("prepares uinput and exposes native-driver readiness", () => {
    expect(moduleSource).toContain('boot.kernelModules = [ "uinput" ]')
    expect(moduleSource).toContain(
      'environment.variables.KORRI_REMAP_NATIVE_DRIVER = "enabled"',
    )
  })

  it("exposes Remap keyboard sinks to the active seat", () => {
    expect(moduleSource).toContain('ATTR{name}=="Korri Remap Keyboard*"')
    expect(moduleSource).toContain('ATTRS{name}=="Korri Remap Keyboard*"')
    expect(moduleSource).toContain('ENV{LIBINPUT_IGNORE_DEVICE}="0"')
    expect(moduleSource).toContain('ENV{ID_INPUT_KEYBOARD}="1"')
    expect(moduleSource).toContain('MODE="0660"')
    expect(moduleSource).toContain('GROUP="input"')
    expect(moduleSource).toContain('TAG+="uaccess"')
    expect(moduleSource).toContain('TAG+="seat"')
  })

  it("hides Remap gamepad sinks from libinput, uaccess, and seats", () => {
    expect(moduleSource).toContain('ATTR{name}=="Korri Remap Gamepad*"')
    expect(moduleSource).toContain('ATTRS{name}=="Korri Remap Gamepad*"')
    expect(moduleSource).toContain('ENV{LIBINPUT_IGNORE_DEVICE}="1"')
    expect(moduleSource).toContain('ENV{ID_INPUT_JOYSTICK}="0"')
    expect(moduleSource).toContain('MODE="0600"')
    expect(moduleSource).toContain('GROUP="root"')
    expect(moduleSource).toContain('TAG-="uaccess"')
    expect(moduleSource).toContain('TAG-="seat"')
  })
})
