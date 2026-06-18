import { describe, expect, it } from "bun:test"

const moduleSource = await Bun.file(
  "product/systems/nixos/modules/korri-steam.nix",
).text()

describe("korri Steam Nix module", () => {
  it("uses the Nix-provided systemctl in the AppID launcher", () => {
    expect(moduleSource).not.toContain(
      'if /bin/systemctl is-active --quiet "$service_name"',
    )
    expect(moduleSource).toContain(
      'if ${pkgs.systemd}/bin/systemctl is-active --quiet "$service_name"',
    )
  })
})
