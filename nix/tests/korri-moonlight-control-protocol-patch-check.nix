{
  pkgs,
  patchPath,
  readmePath,
}:

let
  lib = pkgs.lib;
  check = message: assertion: { inherit message assertion; };

  patch = builtins.readFile patchPath;
  readme = builtins.readFile readmePath;
  contains = needle: haystack: lib.hasInfix needle haystack;

  checks = [
    (check "Moonlight local control protocol is named generically" (
      contains "moonlight.local-control" patch
      && contains "Moonlight local control protocol" readme
      && !(contains "korri.local-control" patch)
    ))
    (check "Moonlight local control protocol uses filesystem AF_UNIX sockets" (
      contains "AF_UNIX" patch
      && contains "SOCK_STREAM | SOCK_CLOEXEC" patch
      && contains "struct sockaddr_un" patch
      && !(contains "AF_INET" patch)
      && !(contains "SOCK_DGRAM" patch)
    ))
    (check "Moonlight local control protocol requires launcher runtime dir ownership checks" (
      contains "MOONLIGHT_LOCAL_CONTROL_RUNTIME_DIR" patch
      && contains "MOONLIGHT_LOCAL_CONTROL_SOCKET" patch
      && contains "st.st_uid != getuid()" patch
      && contains "st.st_mode & 0022" patch
      && contains "strncmp(runtime_dir, socket_path" patch
    ))
    (check "Moonlight local control protocol cleans only safe stale sockets" (
      contains "lstat(socket_path" patch
      && contains "S_ISSOCK" patch
      && contains "stale socket owner mismatch" patch
      && contains "unlink(socket_path)" patch
    ))
    (check "Moonlight local control protocol rejects unauthorized peers before reading frames" (
      contains "SO_PEERCRED" patch
      && contains "moonlight_local_control_peer_authorized(client_fd)" patch
      && contains "MOONLIGHT_LOCAL_CONTROL_ALLOW_ROOT" patch
    ))
    (check "Moonlight local control protocol bounds frames and clients" (
      contains "MOONLIGHT_CONTROL_MAX_FRAME_BYTES 65536" patch
      && contains "MOONLIGHT_CONTROL_MAX_CLIENTS 4" patch
      && contains "oversized frame" patch
      && contains "used == 0" patch
    ))
    (check "Moonlight local control protocol uses json-c instead of hand-rolled JSON parsing" (
      contains "json-c/json.h" patch
      && contains "json_tokener_parse_ex" patch
      && contains "pkg_check_modules(JSONC REQUIRED json-c)" patch
    ))
    (check "Moonlight local control protocol serves hello state and subscribe methods" (
      contains "protocol.hello" patch
      && contains "state.get" patch
      && contains "events.subscribe" patch
      && contains "state.snapshot" patch
      && contains "moonlight.event" patch
    ))
    (check "Moonlight local control protocol advertises observer/controller authority separately" (
      contains "MOONLIGHT_LOCAL_CONTROL_AUTHORITY" patch
      && contains "observer" patch
      && contains "controller" patch
      && contains "capabilities" patch
    ))
    (check "Moonlight local control protocol documents local-only non-remote scope" (
      contains "Linux-only local IPC" readme
      && contains "LAN, HTTP, mDNS, Tailscale, browser-facing APIs" readme
    ))
  ];

  failures = builtins.filter (candidate: !candidate.assertion) checks;
in
if failures != [ ] then
  throw "Korri Moonlight local control protocol patch check failed:\n${
    lib.concatMapStringsSep "\n" (failure: "- ${failure.message}") failures
  }"
else
  pkgs.runCommand "korri-moonlight-control-protocol-patch-check" { } ''
    mkdir -p "$out"

    cat > "$out/summary.txt" <<'EOF'
    Korri Moonlight local control protocol patch invariants passed.
    EOF
  ''
