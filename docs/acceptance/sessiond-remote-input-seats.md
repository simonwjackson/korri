# Sessiond remote input seats acceptance

## Launch opt-in proof

- Config owner: `product/plugins/rpcs3/nix/nixos-module.nix` renders the code-owned RPCS3 platform-default launcher `@korri:rpcs3/rpcs3`.
- Opt-in condition: when `services.korri.input.inputSeat.enable = true`, that launcher includes `launch.with."@korri:input-seat".runtimeSupportsExtraSeats = true`.
- Verification: `product/plugins/rpcs3/nix/module-check.nix` proves the RPCS3 launcher has no input-seat companion when input-seat support is disabled and explicitly opts in when input-seat support is enabled.

Hardware validation is a no-go unless the resolved launch companions for the target Skate 3/RPCS3 launch include `@korri:input-seat` with `runtimeSupportsExtraSeats: true`, and sessiond status/events show the input-seat pre-spawn gate ran before emulator spawn.

## Hardware validation checklist

- [ ] Resolved Skate 3/RPCS3 launch companions include `@korri:input-seat`.
- [ ] Korri seats are visible before the RPCS3 child process is spawned.
- [ ] Moonlight/Sunshine controller frames update the matching Korri seat.
- [ ] RPCS3 sees `Korri Seat P1` through the generated Evdev input profile.
- [ ] Skate 3 boots with controller input available without restart, fixed sleep, or manual wiggle.
- [ ] A second runtime/emulator validates the same sessiond input-seat lifecycle outside RPCS3.
