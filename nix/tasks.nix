# Korri task definitions. Runnable apps and generated help derive from the
# same definitions so the command surface cannot drift from its documentation.
{ pkgs }:
let
  definitions = {
    portal-check = {
      description = "Run portal unit tests and typecheck.";
      runtimeInputs = [ pkgs.bun ];
      script = ''
        cd "$KORRI_ROOT/clients/portal"
        bun test
        bun run typecheck
      '';
    };
  };

  exports = pkgs.lib.mapAttrs (
    _:
    task:
    pkgs.lib.concatStringsSep "\n" (
      pkgs.lib.mapAttrsToList (name: value: ''export ${name}="${value}"'') (task.env or { })
    )
  ) definitions;

  makeTask = name: task:
    pkgs.writeShellApplication {
      inherit name;
      runtimeInputs = [ pkgs.git ] ++ task.runtimeInputs;
      text = ''
        KORRI_ROOT="$(git rev-parse --show-toplevel)"
        export KORRI_ROOT
        ${exports.${name}}
        ${task.script}
      '';
    };

  packages = pkgs.lib.mapAttrs makeTask definitions;

  helpText = pkgs.lib.concatStringsSep "\n" (
    pkgs.lib.mapAttrsToList (
      name:
      task:
      "  nix run .#${name}${pkgs.lib.optionalString (task ? takesArgs) " -- <args>"}\n      ${task.description}"
    ) definitions
  );

  help = pkgs.writeShellApplication {
    name = "help";
    runtimeInputs = [ ];
    text = ''
      cat <<'EOF'
      Korri tasks (declared in nix/tasks.nix):

      ${helpText}
      EOF
    '';
  };

  toApp = package: {
    type = "app";
    program = "${package}/bin/${package.name}";
  };
in
(pkgs.lib.mapAttrs (_: package: toApp package) packages)
// {
  help = toApp help;
  default = toApp help;
}
