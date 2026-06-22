import { describe, expect, it } from "bun:test"

const driverSource = await Bun.file(
  "product/plugins/remap/packages/korri-remap-bridge/native-driver.py",
).text()
const packageSource = await Bun.file(
  "product/plugins/remap/nix/remap-bridge.nix",
).text()

describe("korri-remap native driver contract", () => {
  it("only resolves InputPlumber-normalized virtual gamepads as sources", () => {
    expect(driverSource).toContain("def input_device_class")
    expect(driverSource).toContain('"Microsoft Xbox Series S|X Controller"')
    expect(driverSource).toContain("def is_inputplumber_virtual_gamepad")
    expect(driverSource).toContain("controller {player} must use inputplumber-virtual-gamepad")
    expect(driverSource).toContain("controller {player} resolution failed")
    expect(driverSource).not.toContain("/dev/input/.inputplumber/sources")
  })

  it("creates temporary keyboard and gamepad uinput devices", () => {
    expect(driverSource).toContain("UI_DEV_CREATE")
    expect(driverSource).toContain("UI_DEV_DESTROY")
    expect(driverSource).toContain('f"{DEVICE_PREFIX} Keyboard')
    expect(driverSource).toContain('f"{DEVICE_PREFIX} Gamepad')
    expect(driverSource).toContain("keys=KEY_CODES.values()")
    expect(driverSource).toContain("axes=[ABS[")
  })

  it("restricts synthetic device nodes to the Remap runner", () => {
    expect(driverSource).toContain('RUNNER_USER = "korri-remap-runner"')
    expect(driverSource).toContain('run_quiet(["setfacl", "-b", str(path)])')
    expect(driverSource).toContain("os.chown(path, 0, 0)")
    expect(driverSource).toContain("os.chmod(path, 0o600)")
    expect(driverSource).toContain('run_quiet(["setfacl", "-m", f"u:{user}:r", str(path)])')
  })

  it("launches the child as korri-remap-runner with Remap env stripped", () => {
    expect(driverSource).toContain('"--reuid={entry.pw_uid}"')
    expect(driverSource).toContain('"--regid={entry.pw_gid}"')
    expect(driverSource).toContain('"--init-groups"')
    expect(driverSource).toContain('if not key.startswith("KORRI_REMAP_")')
  })

  it("fails closed when cleanup cannot prove synthetic devices disappeared", () => {
    expect(driverSource).toContain("settle_udev()")
    expect(driverSource).toContain("assert_sway_isolated")
    expect(driverSource).toContain('key == "send_events" and value == "disabled"')
    expect(driverSource).toContain("wait_devices_gone(synthetic_device_names")
    expect(driverSource).toContain("DIRTY_CLEANUP_EXIT_CODE = 120")
    expect(driverSource).toContain("cleanup verification failed")
    expect(driverSource).toContain("raise SystemExit(DIRTY_CLEANUP_EXIT_CODE)")
  })

  it("ships the native driver behind trusted package-owned env", () => {
    expect(packageSource).toContain("export KORRI_REMAP_NATIVE_DRIVER=enabled")
    expect(packageSource).toContain("export KORRI_REMAP_NATIVE_DRIVER_PYTHON=${lib.getExe python3}")
    expect(packageSource).toContain("export KORRI_REMAP_NATIVE_DRIVER_PATH=${../packages/korri-remap-bridge/native-driver.py}")
  })
})
