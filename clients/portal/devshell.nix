# Portal (TS/React) toolchain. Owned by clients/portal; composed by the
# root flake as devShells.<system>.portal.
{ pkgs }:
pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    typescript
  ];
}
