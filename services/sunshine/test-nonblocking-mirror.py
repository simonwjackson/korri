#!/usr/bin/env python3
"""Model the declared nonblocking SOCK_SEQPACKET transport under backpressure.

This does not execute compiled Sunshine code. The Nix package build proves that
patch 0015 compiles. Final device validation proves runtime behavior.
"""

import errno
import os
import socket
import tempfile
import time

MAX_FRAME_BYTES = 2048
ATTEMPTS = 4096
MAX_SECONDS = 2.0


def submit(path: str, frame: bytes) -> None:
    if len(frame) > MAX_FRAME_BYTES:
        return
    client = socket.socket(
        socket.AF_UNIX,
        socket.SOCK_SEQPACKET | socket.SOCK_CLOEXEC | socket.SOCK_NONBLOCK,
    )
    try:
        assert not os.get_inheritable(client.fileno())
        result = client.connect_ex(path)
        if result != 0:
            assert result in {
                errno.EAGAIN,
                errno.EWOULDBLOCK,
                errno.EINPROGRESS,
                errno.ECONNREFUSED,
            }
            return
        try:
            written = client.send(frame, socket.MSG_DONTWAIT | socket.MSG_NOSIGNAL)
        except BlockingIOError:
            return
        if written != len(frame):
            raise SystemExit(f"incomplete SOCK_SEQPACKET message: {written}/{len(frame)}")
    finally:
        client.close()


with tempfile.TemporaryDirectory() as runtime_dir:
    socket_path = os.path.join(runtime_dir, "mirror.sock")
    server = socket.socket(socket.AF_UNIX, socket.SOCK_SEQPACKET | socket.SOCK_CLOEXEC)
    try:
        server.bind(socket_path)
        server.listen(1)
        frame = b'{"mirrorToken":"test","frame":{"kind":"source-state"}}\n'
        started = time.monotonic()
        for _ in range(ATTEMPTS):
            submit(socket_path, frame)
        elapsed = time.monotonic() - started
        if elapsed > MAX_SECONDS:
            raise SystemExit(
                f"nonblocking mirror fixture exceeded {MAX_SECONDS:.1f}s: {elapsed:.3f}s"
            )
    finally:
        server.close()
