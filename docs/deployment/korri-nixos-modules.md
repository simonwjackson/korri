---
title: Korri NixOS modules
date: 2026-05-21
---

# Korri NixOS modules

Korri's public product roles are:

- `services.korri.server`: headless/control-plane server. Use this for hosts that serve the library, advertise stream capability, or coordinate game-stream intents without owning a GUI session.
- `services.korri.client`: GUI package/runtime role. It installs the selected Korri desktop package and intentionally does not autostart it.
- `services.korri.kiosk`: appliance session role. It owns the system Sway kiosk service, Korri client autostart, XDG session roots, and product input lifecycle coordination.

Lower-level modules remain available for advanced composition:

- `services.korri.inputd`: product input bridge daemon and shortcut command surface.
- `services.korri.gameStream`: Sunshine runner integration below the server stream-host role.
- `services.korri.headlessSource`: legacy headless source surface superseded by `services.korri.server` for new deployments.

## Ownership boundary

Korri product modules own generic product behavior: server lifecycle, client package selection, kiosk session ownership, client autostart, and normalized input ordering. Platform adapters own hardware facts: display transforms, touchscreen calibration, InputPlumber maps, event names, audio UCM, container/uinput quirks, boot media, secrets, and builder topology.

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

Generic Korri modules do not encode device-specific hardware strings. The RockNix SM8550 appliance targets keep those facts in `nix/images/platforms/rocknix-sm8550.nix`, which consumes nix-on-rocks substrate modules and device profiles while Korri owns product service composition.
