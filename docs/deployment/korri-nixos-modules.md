---
title: Korri NixOS modules
date: 2026-05-21
---

# Korri NixOS modules

Korri's public product roles are:

- `services.korri.server`: headless/control-plane server. Use this for hosts that serve the library, advertise stream capability, or coordinate game-stream intents without owning a GUI session. It exports `KORRI_LAUNCH_ARTIFACTS_DIR` for generated per-launch app config artifacts.
- `services.korri.client`: GUI package/runtime role. It installs the selected Korri desktop package and intentionally does not autostart it.
- `services.korri.kiosk`: appliance session role. It owns the system Sway kiosk service, Korri client autostart, XDG session roots, and product input lifecycle coordination.

Launch authoring uses built-in app ids, optional `apps.<id>` overrides, top-level `modules`, and nested `launch` blocks. See [Korri launch config apps and modules](./korri-launch-config.md). App executables are still Nix/image capabilities: add emulator packages to `services.korri.sessiond.path` for managed foreground launches instead of encoding package paths in YAML.

Lower-level modules remain available for advanced composition:

- `services.korri.inputd`: product input bridge daemon and shortcut command surface.
- `services.korri.gameStream`: Sunshine runner integration below the server stream-host role.
- `services.korri.headlessSource`: legacy headless source surface superseded by `services.korri.server` for new deployments.

## Ownership boundary

Korri product modules own generic product behavior: server lifecycle, client package selection, kiosk session ownership, client autostart, normalized input ordering, and the requirement that appliance gamepad input comes through a normalized provider. Platform adapters own hardware facts: display transforms, touchscreen calibration, InputPlumber maps, event names, audio UCM, container/uinput quirks, boot media, secrets, and builder topology.

For controller-bearing kiosk appliances, `inputplumber` is the normalized provider. `seatd` may still be required for compositor seat access, but it is not a controller-normalization provider. When a kiosk declares `services.korri.kiosk.input.required = true` with provider name `inputplumber`, Korri configures inputd and Moonlight launch preflight to require an InputPlumber virtual gamepad and fail closed instead of falling back to raw physical devices.

A downstream deployment such as Sobo/Mountainous should import the platform hardware quirks module and Korri modules, then set only personal/deployment values. During cutover, remove the old hand-owned product kiosk autostart/session mutations in the same change that enables `services.korri.kiosk`, so exactly one product session owner remains active.

## Minimal examples

Headless/control-plane host:

```nix
{
  services.korri.server = {
    enable = true;
    serviceMode = "system";
    user = "korri-server";
  };
}
```

Appliance kiosk with platform-provided normalized input:

```nix
{
  services.korri.kiosk = {
    enable = true;
    input = {
      required = true;
      provider = {
        enable = true;
        name = "platform-input";
        services = [ "platform-input.service" ];
      };
    };
    sway.extraConfig = ''
      # platform display/session fragments belong here or in a platform module
    '';
  };
}
```

For constrained guests that must run as root, platform modules may set `services.korri.kiosk.user = "root"` and `createUser = false`. If the platform already owns a stable session bus, configure:

```nix
{
  services.korri.kiosk = {
    runtimeDir = "/run/user/0";
    sessionBus = {
      mode = "existing";
      address = "unix:path=/run/user/0/bus";
      services = [ "platform-session-dbus.service" ];
    };
  };
}
```

Generic Korri modules do not encode device-specific hardware strings. The RockNix SM8550 appliance targets keep those facts in `product/systems/nixos/images/platforms/rocknix-sm8550.nix`, which consumes nix-on-rocks substrate modules and device profiles while Korri owns product service composition. Static evaluation proves provider wiring and service environment; physical device smoke still must prove InputPlumber loaded its maps and created the expected virtual target.
