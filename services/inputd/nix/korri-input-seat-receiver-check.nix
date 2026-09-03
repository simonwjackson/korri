{ pkgs, inputdPackage }:
pkgs.runCommand "korri-input-seat-receiver-check" {
  nativeBuildInputs = [ pkgs.python3 ];
} ''
  set -euo pipefail
  test -x ${inputdPackage}/bin/korri-input-seat-receiver
  runtime="$TMPDIR/runtime"
  mkdir -m 700 "$runtime"
  uid="$(id -u)"
  gid="$(id -g)"
  ${inputdPackage}/bin/korri-input-seat-receiver \
    --runtime-dir "$runtime" \
    --control-uid "$uid" \
    --control-gid "$gid" \
    --sunshine-uid "$uid" \
    --sunshine-gid "$gid" \
    --event-gid "$gid" \
    --dry-run \
    >"$TMPDIR/receiver.out" 2>"$TMPDIR/receiver.err" &
  receiver=$!
  trap 'kill "$receiver" 2>/dev/null || true; wait "$receiver" 2>/dev/null || true; cat "$TMPDIR/receiver.err" >&2' EXIT
  for _ in $(seq 1 100); do
    test -S "$runtime/control.sock" && break
    sleep 0.01
  done
  test -S "$runtime/control.sock"
  python3 - "$runtime" <<'PY'
import json, socket, sys, time
from pathlib import Path
root = Path(sys.argv[1])
launch = "0123456789abcdef0123456789abcdef"
def request(op): return bytes([1, op]) + launch.encode()
control = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
control.connect(str(root / "control.sock"))
control.sendall(request(1))
assert control.recv(3) == bytes([1, 0, 0])
for _ in range(100):
    if (root / "sunshine-active-launch.json").is_file(): break
    time.sleep(0.01)
sidecar = json.loads((root / "sunshine-active-launch.json").read_text())
assert set(sidecar) == {"launchId", "generation", "mirrorToken"}
assert sidecar["launchId"] == launch
assert len(sidecar["mirrorToken"]) == 64
mirror = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET)
mirror.connect(str(root / "sunshine-input-seat.sock"))
frame = {"mirrorToken": sidecar["mirrorToken"], "frame": {"kind": "source-connected", "launchId": launch, "controllerNumber": 0}}
mirror.sendall((json.dumps(frame, separators=(",", ":")) + "\n").encode())
mirror.close()
control.sendall(request(2))
assert control.recv(3) == bytes([1, 0, 0])
control.close()
for _ in range(100):
    if not (root / "sunshine-active-launch.json").exists(): break
    time.sleep(0.01)
assert not (root / "sunshine-active-launch.json").exists()
assert not (root / "sunshine-input-seat.sock").exists()
PY
  kill -TERM "$receiver"
  wait "$receiver"
  trap - EXIT
  touch "$out"
''
