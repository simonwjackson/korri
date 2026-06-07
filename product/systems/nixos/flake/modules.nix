{
  self,
  nix-on-rocks,
  fake-08-src,
  smbr-src,
  sm127-src,
  nixpkgs-godot,
  ...
}:

rec {
  # Power-user opt-in: a module that wires the Korri substrate-package
  # overlay into `nixpkgs.overlays`. Importing this module replaces
  # `pkgs.gamescope`, `pkgs.sunshine`, and `pkgs.moonlight-embedded`
  # for the whole host.
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
        fake-08-src
        smbr-src
        sm127-src
        nixpkgs-godot
        ;
    };
  };

  # Auto-attached sway pin for the x86 compositor runtime contract.
  # Gamescope is owned by the global Korri package overlay so
  # `pkgs.gamescope` remains `gamescope-korri`. Imported by
  # korri-compositor below so downstream consumers inherit the
  # known-good sway version without touching nixpkgs.overlays
  # themselves. No-ops on non-x86 systems via the overlay itself.
  korri-x86-compositor-overlay = import ../modules/korri-x86-compositor-overlay.nix {
    overlay = import ../overlays/korri-x86-compositor.nix;
  };

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
  # that only enable services.korri.server without streaming still get
  # those option declarations but no behavior, since each module's
  # config block is gated on its own enable toggle. Duplicate imports
  # dedupe via the `key` field on compositor/input/cli/client modules.
  korri-server = {
    imports = [
      korri-compositor
      korri-input
      (import ../modules/korri-server.nix { korri = self; })
    ];
  };
  # Aggregate composes the three product roles. Compositor and input
  # are listed explicitly even though korri-server transitively
  # imports them, so consumers can read the role topology directly
  # off the aggregate. Duplicate imports dedupe via the `key` field.
  korri = {
    imports = [
      korri-compositor
      korri-input
      korri-server
    ];
  };
  default = korri;
}
