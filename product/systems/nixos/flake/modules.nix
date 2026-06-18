{
  self,
  nix-on-rocks,
  wasm4-src,
  nixpkgs-godot,
  ...
}:

rec {
  # Power-user opt-in: a module that wires the Korri shared runtime package
  # overlay into `nixpkgs.overlays` for the whole host.
  # Avoid in evaluations where `nixpkgs.pkgs` is set externally (e.g.
  # `pkgs.testers.runNixOSTest`), because that marks
  # `nixpkgs.overlays` read-only. Day-to-day consumers do NOT need
  # this: every Korri product module below already defaults the
  # specific package options (`services.sunshine.package`,
  # `rocknix.sm8550.moonlight.package`) it cares about to the Korri
  # downstream builds, so the substitution happens through the option
  # graph rather than through `pkgs` itself.
  korri-nixpkgs-overlay = import ../modules/korri-nixpkgs-overlay.nix {
    overlay = import ../overlays/korri-packages.nix {
      inherit
        nix-on-rocks
        wasm4-src
        nixpkgs-godot
        ;
    };
  };

  # Auto-attached sway pin for the x86 compositor runtime contract.
  # Imported by korri-compositor below so downstream consumers inherit the
  # known-good sway version without touching nixpkgs.overlays themselves.
  # No-ops on non-x86 systems via the overlay itself.
  korri-x86-compositor-overlay = import ../modules/korri-x86-compositor-overlay.nix {
    overlay = import ../overlays/korri-x86-compositor.nix;
  };

  korri-runtime = import ../modules/korri-runtime.nix;
  korri-setup = import ../modules/korri-setup.nix;
  # Per-platform opt-in: removable-media mounting + card-wins config-root
  # exposure through config-roots.d. Bundles korri-runtime so the module's
  # user/group defaults resolve standalone; intentionally NOT part of the
  # korri-daemon aggregate — platforms enable it explicitly.
  korri-removable-media = {
    imports = [
      korri-runtime
      (import ../modules/korri-removable-media.nix)
    ];
  };
  # SM8550/product opt-in: Steam plugin-owned guest adapter. Bundles
  # korri-runtime so the default state/home paths resolve standalone; not part
  # of the daemon aggregate because Steam launch/session policy is platform
  # posture, not a baseline daemon dependency.
  korri-steam = {
    imports = [
      korri-runtime
      (import ../../../plugins/steam/nix/nixos-module.nix)
    ];
  };
  korri-login = import ../modules/korri-login.nix;
  korri-client = import ../modules/korri-client.nix { korri = self; };
  korri-cli = import ../modules/korri-cli.nix { korri = self; };
  korri-game-stream = import ../modules/korri-game-stream.nix { korri = self; };
  korri-sessiond = import ../modules/korri-sessiond.nix { korri = self; };
  # Per-role input module: provider + inputd peer sub-trees.
  korri-input = import ../modules/korri-input.nix { korri = self; };
  # Per-role compositor module. Bundles the Korri client install so the
  # kiosk-surface sub-tree can default `kiosk.command` to the selected
  # client package without callers wiring it themselves, and imports
  # the input module so `services.korri.input.inputd.*` is in scope
  # when the kiosk surface wires inputd ordering.
  korri-compositor = {
    imports = [
      korri-client
      korri-input
      korri-x86-compositor-overlay
      (import ../modules/korri-compositor.nix { korri = self; })
    ];
  };
  # Server module imports compositor + input alongside its own file so
  # the cross-tree streaming assertions can reference the
  # services.korri.{compositor,input.provider}.enable options. Hosts
  # that only enable services.korri.daemon without streaming still get
  # those option declarations but no behavior, since each module's
  # config block is gated on its own enable toggle. Duplicate imports
  # dedupe via the `key` field on compositor/input/cli/client modules.
  korri-daemon = {
    imports = [
      korri-runtime
      korri-setup
      korri-login
      korri-compositor
      korri-input
      (import ../modules/korri-daemon.nix { korri = self; })
    ];
  };
  # Aggregate composes the three product roles. Compositor and input
  # are listed explicitly even though korrid transitively
  # imports them, so consumers can read the role topology directly
  # off the aggregate. Duplicate imports dedupe via the `key` field.
  korri = {
    imports = [
      korri-runtime
      korri-setup
      korri-login
      korri-compositor
      korri-input
      korri-daemon
    ];
  };
  default = korri;
}
