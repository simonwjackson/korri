#!/usr/bin/env python3
"""Probe whether plain uinput can be a private Remap sink.

Creates a temporary virtual keyboard and gamepad, emits sample events, and checks
whether an outside reader can observe the same events as the target reader.

This is a spike utility, not production code.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import pwd
import re
import select
import struct
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

# ioctl constants from linux/uinput.h for x86/aarch64 Linux.
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502
UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_SET_ABSBIT = 0x40045567

EV_SYN = 0x00
EV_KEY = 0x01
EV_ABS = 0x03
SYN_REPORT = 0

BUS_USB = 0x03

KEY_A = 30
KEY_UP = 103
KEY_DOWN = 108
KEY_LEFT = 105
KEY_RIGHT = 106
KEY_Z = 44
KEY_ENTER = 28

BTN_SOUTH = 0x130
BTN_EAST = 0x131
BTN_NORTH = 0x133
BTN_WEST = 0x134
BTN_SELECT = 0x13A
BTN_START = 0x13B
BTN_DPAD_UP = 0x220
BTN_DPAD_DOWN = 0x221
BTN_DPAD_LEFT = 0x222
BTN_DPAD_RIGHT = 0x223

ABS_X = 0x00
ABS_Y = 0x01
ABS_RX = 0x03
ABS_RY = 0x04
ABS_HAT0X = 0x10
ABS_HAT0Y = 0x11

INPUT_EVENT = struct.Struct("llHHi")
UINPUT_USER_DEV = struct.Struct("80sHHHHI" + "i" * 64 * 4)

KEYBOARD_NAME = "korri-remap-spike-keyboard"
GAMEPAD_NAME = "korri-remap-spike-gamepad"


@dataclass
class Reader:
    label: str
    path: Path
    events: list[dict[str, int]] = field(default_factory=list)
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)

    def _run(self) -> None:
        try:
            fd = os.open(self.path, os.O_RDONLY | os.O_NONBLOCK)
        except OSError as error:
            self.events.append({"open_error": error.errno})
            return
        with os.fdopen(fd, "rb", buffering=0) as handle:
            while not self._stop.is_set():
                ready, _, _ = select.select([handle], [], [], 0.05)
                if not ready:
                    continue
                try:
                    data = handle.read(INPUT_EVENT.size)
                except BlockingIOError:
                    continue
                if not data or len(data) < INPUT_EVENT.size:
                    continue
                _sec, _usec, event_type, code, value = INPUT_EVENT.unpack(data)
                if event_type == EV_SYN:
                    continue
                self.events.append({"type": event_type, "code": code, "value": value})


class UInputDevice:
    def __init__(self, name: str, *, keys: Iterable[int], axes: Iterable[int] = ()) -> None:
        self.name = name
        self.keys = list(keys)
        self.axes = list(axes)
        self.fd: int | None = None

    def create(self) -> None:
        fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK)
        self.fd = fd
        ioctl(fd, UI_SET_EVBIT, EV_KEY)
        for key in self.keys:
            ioctl(fd, UI_SET_KEYBIT, key)
        if self.axes:
            ioctl(fd, UI_SET_EVBIT, EV_ABS)
            for axis in self.axes:
                ioctl(fd, UI_SET_ABSBIT, axis)

        absmax = [0] * 64
        absmin = [0] * 64
        absfuzz = [0] * 64
        absflat = [0] * 64
        for axis in self.axes:
            if axis in (ABS_HAT0X, ABS_HAT0Y):
                absmin[axis] = -1
                absmax[axis] = 1
            else:
                absmin[axis] = -32768
                absmax[axis] = 32767
                absflat[axis] = 4096

        payload = UINPUT_USER_DEV.pack(
            self.name.encode()[:79],
            BUS_USB,
            0x1D6B,
            0xC0DE,
            1,
            0,
            *absmax,
            *absmin,
            *absfuzz,
            *absflat,
        )
        os.write(fd, payload)
        fcntl.ioctl(fd, UI_DEV_CREATE)

    def destroy(self) -> None:
        if self.fd is None:
            return
        try:
            fcntl.ioctl(self.fd, UI_DEV_DESTROY)
        finally:
            os.close(self.fd)
            self.fd = None

    def emit(self, event_type: int, code: int, value: int) -> None:
        if self.fd is None:
            raise RuntimeError("device not created")
        now = time.time()
        sec = int(now)
        usec = int((now - sec) * 1_000_000)
        os.write(self.fd, INPUT_EVENT.pack(sec, usec, event_type, code, value))

    def sync(self) -> None:
        self.emit(EV_SYN, SYN_REPORT, 0)


def ioctl(fd: int, request: int, value: int) -> None:
    fcntl.ioctl(fd, request, value)


def find_event_node(name: str, deadline: float) -> Path:
    while time.time() < deadline:
        devices = Path("/proc/bus/input/devices").read_text(errors="replace")
        for block in devices.split("\n\n"):
            if f'N: Name="{name}"' not in block:
                continue
            match = re.search(r"H: Handlers=.*?\b(event\d+)\b", block)
            if match:
                return Path("/dev/input") / match.group(1)
        time.sleep(0.05)
    raise RuntimeError(f"timed out waiting for {name} event node")


def sway_env() -> dict[str, str]:
    env = os.environ.copy()
    if "SWAYSOCK" not in env:
        for runtime in Path("/run/user").glob("*/sway-ipc.*.sock"):
            env["SWAYSOCK"] = str(runtime)
            break
    return env


def sway_inputs() -> list[dict[str, object]] | str:
    try:
        output = subprocess.check_output(
            ["swaymsg", "-t", "get_inputs"],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=2,
            env=sway_env(),
        )
        return json.loads(output)
    except Exception as error:  # noqa: BLE001 - spike diagnostic
        return str(error)


def attach_to_seat(seat: str, event_node: Path) -> None:
    device = Path("/sys/class/input") / event_node.name / "device"
    sys_path = os.path.realpath(device)
    subprocess.run(["loginctl", "attach", seat, sys_path], check=False, timeout=2)
    subprocess.run(["udevadm", "settle"], check=False, timeout=2)


def disable_sway_input(device_name: str, inputs: list[dict[str, object]] | str) -> None:
    for entry in matching_sway_inputs(inputs):
        if entry.get("name") != device_name:
            continue
        identifier = entry.get("identifier")
        if not isinstance(identifier, str):
            continue
        subprocess.run(
            ["swaymsg", "input", identifier, "events", "disabled"],
            check=False,
            timeout=2,
            env=sway_env(),
        )


def matching_sway_inputs(inputs: list[dict[str, object]] | str) -> list[dict[str, object]]:
    if isinstance(inputs, str):
        return []
    matches = []
    for entry in inputs:
        name = str(entry.get("name", ""))
        if name in {KEYBOARD_NAME, GAMEPAD_NAME}:
            matches.append(entry)
    return matches


def stat_node(path: Path) -> dict[str, object]:
    stat = path.stat()
    return {
        "mode": oct(stat.st_mode & 0o777),
        "uid": stat.st_uid,
        "gid": stat.st_gid,
    }


def user_can_read(user: str, path: Path) -> bool:
    if user == "korri":
        command = [
            "setpriv",
            "--reuid=2000",
            "--regid=991",
            "--clear-groups",
            "test",
            "-r",
            str(path),
        ]
    else:
        command = ["su", "-s", "/bin/sh", user, "-c", f"test -r {path}"]
    result = subprocess.run(
        command,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        timeout=2,
    )
    return result.returncode == 0


def strip_acl(path: Path) -> None:
    subprocess.run(["setfacl", "-b", str(path)], check=False, timeout=2)
    os.chmod(path, 0o600)
    os.chown(path, 0, 0)


def grant_acl(user: str, path: Path) -> None:
    subprocess.run(["setfacl", "-m", f"u:{user}:r", str(path)], check=False, timeout=2)


def run_as_user_command(user: str, command: list[str]) -> list[str]:
    entry = pwd.getpwnam(user)
    return [
        "setpriv",
        f"--reuid={entry.pw_uid}",
        f"--regid={entry.pw_gid}",
        "--clear-groups",
        *command,
    ]


def read_events_for(path: Path, duration: float) -> list[dict[str, int]]:
    events: list[dict[str, int]] = []
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    except OSError as error:
        return [{"open_error": error.errno}]
    deadline = time.time() + duration
    with os.fdopen(fd, "rb", buffering=0) as handle:
        while time.time() < deadline:
            ready, _, _ = select.select([handle], [], [], 0.05)
            if not ready:
                continue
            try:
                data = handle.read(INPUT_EVENT.size)
            except BlockingIOError:
                continue
            if not data or len(data) < INPUT_EVENT.size:
                continue
            _sec, _usec, event_type, code, value = INPUT_EVENT.unpack(data)
            if event_type == EV_SYN:
                continue
            events.append({"type": event_type, "code": code, "value": value})
    return events


def start_reader_process(label: str, user: str, path: Path) -> tuple[str, subprocess.Popen[str]]:
    command = run_as_user_command(
        user,
        [sys.executable, str(Path(__file__).resolve()), "--reader", str(path)],
    )
    return label, subprocess.Popen(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def start_user_readers(target_user: str | None, keyboard_node: Path, gamepad_node: Path) -> list[tuple[str, subprocess.Popen[str]]]:
    readers = [
        start_reader_process("korri-keyboard", "korri", keyboard_node),
        start_reader_process("korri-gamepad", "korri", gamepad_node),
    ]
    if target_user:
        readers.extend(
            [
                start_reader_process(f"{target_user}-keyboard", target_user, keyboard_node),
                start_reader_process(f"{target_user}-gamepad", target_user, gamepad_node),
            ]
        )
    return readers


def collect_user_readers(readers: list[tuple[str, subprocess.Popen[str]]]) -> dict[str, object]:
    results: dict[str, object] = {}
    for label, process in readers:
        try:
            stdout, stderr = process.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate(timeout=1)
        try:
            results[label] = json.loads(stdout or "[]")
        except json.JSONDecodeError:
            results[label] = {"stdout": stdout, "stderr": stderr, "returncode": process.returncode}
    return results


def has_input_events(value: object) -> bool:
    return isinstance(value, list) and any(
        isinstance(item, dict) and "type" in item and "code" in item for item in value
    )


def udev_properties(path: Path) -> dict[str, str]:
    try:
        output = subprocess.check_output(
            ["udevadm", "info", "--query=property", f"--name={path}"],
            text=True,
            stderr=subprocess.STDOUT,
            timeout=2,
        )
    except Exception as error:  # noqa: BLE001 - spike diagnostic
        return {"error": str(error)}
    properties: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in {
            "ID_INPUT",
            "ID_INPUT_KEY",
            "ID_INPUT_KEYBOARD",
            "ID_INPUT_JOYSTICK",
            "LIBINPUT_IGNORE_DEVICE",
            "TAGS",
            "CURRENT_TAGS",
            "DEVLINKS",
        }:
            properties[key] = value
    return properties


def emit_sample_events(keyboard: UInputDevice, gamepad: UInputDevice) -> None:
    keyboard.emit(EV_KEY, KEY_A, 1)
    keyboard.sync()
    keyboard.emit(EV_KEY, KEY_A, 0)
    keyboard.sync()

    gamepad.emit(EV_KEY, BTN_SOUTH, 1)
    gamepad.sync()
    gamepad.emit(EV_KEY, BTN_SOUTH, 0)
    gamepad.sync()
    gamepad.emit(EV_ABS, ABS_X, 24000)
    gamepad.sync()
    gamepad.emit(EV_ABS, ABS_X, 0)
    gamepad.sync()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="print machine-readable result")
    parser.add_argument("--reader", help=argparse.SUPPRESS)
    parser.add_argument("--reader-duration", type=float, default=1.5, help=argparse.SUPPRESS)
    parser.add_argument(
        "--attach-seat",
        help="experimental: attach synthetic devices to this logind seat before emitting events",
    )
    parser.add_argument(
        "--disable-in-sway",
        action="store_true",
        help="experimental: disable synthetic devices in the running Sway seat before emitting events",
    )
    parser.add_argument(
        "--strip-acl",
        action="store_true",
        help="remove ACLs from synthetic event nodes after creation",
    )
    parser.add_argument(
        "--target-user",
        help="grant/read synthetic event nodes as this user to model a dedicated launch user",
    )
    args = parser.parse_args()

    if args.reader:
        print(json.dumps(read_events_for(Path(args.reader), args.reader_duration)))
        return 0

    if os.geteuid() != 0:
        print("must run as root to create uinput devices", file=sys.stderr)
        return 2
    if not Path("/dev/uinput").exists():
        print("/dev/uinput is missing", file=sys.stderr)
        return 2

    keyboard = UInputDevice(
        KEYBOARD_NAME,
        keys=[KEY_A, KEY_Z, KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_ENTER],
    )
    gamepad = UInputDevice(
        GAMEPAD_NAME,
        keys=[BTN_SOUTH, BTN_EAST, BTN_NORTH, BTN_WEST, BTN_SELECT, BTN_START, BTN_DPAD_UP, BTN_DPAD_DOWN, BTN_DPAD_LEFT, BTN_DPAD_RIGHT],
        axes=[ABS_X, ABS_Y, ABS_RX, ABS_RY, ABS_HAT0X, ABS_HAT0Y],
    )

    readers: list[Reader] = []
    try:
        before = sway_inputs()
        keyboard.create()
        gamepad.create()
        keyboard_node = find_event_node(KEYBOARD_NAME, time.time() + 3)
        gamepad_node = find_event_node(GAMEPAD_NAME, time.time() + 3)
        if args.strip_acl:
            strip_acl(keyboard_node)
            strip_acl(gamepad_node)
        if args.target_user:
            grant_acl(args.target_user, keyboard_node)
            grant_acl(args.target_user, gamepad_node)
        keyboard_node_stat = stat_node(keyboard_node)
        gamepad_node_stat = stat_node(gamepad_node)
        keyboard_udev = udev_properties(keyboard_node)
        gamepad_udev = udev_properties(gamepad_node)
        korri_can_read_keyboard = user_can_read("korri", keyboard_node)
        korri_can_read_gamepad = user_can_read("korri", gamepad_node)
        if args.attach_seat:
            attach_to_seat(args.attach_seat, keyboard_node)
            attach_to_seat(args.attach_seat, gamepad_node)
        time.sleep(0.5)
        after = sway_inputs()
        if args.strip_acl:
            strip_acl(keyboard_node)
            strip_acl(gamepad_node)
        if args.target_user:
            grant_acl(args.target_user, keyboard_node)
            grant_acl(args.target_user, gamepad_node)
        keyboard_node_stat = stat_node(keyboard_node)
        gamepad_node_stat = stat_node(gamepad_node)
        if args.disable_in_sway:
            disable_sway_input(KEYBOARD_NAME, after)
            disable_sway_input(GAMEPAD_NAME, after)
            time.sleep(0.2)
            after = sway_inputs()

        readers = [
            Reader("target-keyboard", keyboard_node),
            Reader("outside-keyboard", keyboard_node),
            Reader("target-gamepad", gamepad_node),
            Reader("outside-gamepad", gamepad_node),
        ]
        for reader in readers:
            reader.start()
        user_readers = start_user_readers(args.target_user, keyboard_node, gamepad_node)
        time.sleep(0.2)
        emit_sample_events(keyboard, gamepad)
        time.sleep(0.5)
        user_reader_results = collect_user_readers(user_readers)
    finally:
        for reader in readers:
            reader.stop()
        keyboard.destroy()
        gamepad.destroy()

    result = {
        "keyboardNode": str(keyboard_node),
        "keyboardNodeStat": keyboard_node_stat,
        "gamepadNode": str(gamepad_node),
        "gamepadNodeStat": gamepad_node_stat,
        "keyboardUdev": keyboard_udev,
        "gamepadUdev": gamepad_udev,
        "korriCanReadKeyboardNode": korri_can_read_keyboard,
        "korriCanReadGamepadNode": korri_can_read_gamepad,
        "swayBeforeError": before if isinstance(before, str) else None,
        "swayAfterError": after if isinstance(after, str) else None,
        "attachSeat": args.attach_seat,
        "disableInSway": args.disable_in_sway,
        "stripAcl": args.strip_acl,
        "targetUser": args.target_user,
        "swaySawSyntheticDevices": matching_sway_inputs(after),
        "readers": {reader.label: reader.events for reader in readers},
        "userReaders": user_reader_results,
    }
    target_ok = bool(result["readers"]["target-keyboard"]) and bool(result["readers"]["target-gamepad"])
    outside_leak = bool(result["readers"]["outside-keyboard"]) or bool(result["readers"]["outside-gamepad"])
    sway_leak = bool(result["swaySawSyntheticDevices"])
    user_readers = result["userReaders"]
    assert isinstance(user_readers, dict)
    korri_user_received = has_input_events(user_readers.get("korri-keyboard")) or has_input_events(
        user_readers.get("korri-gamepad")
    )
    target_user_received = False
    if args.target_user:
        target_user_received = has_input_events(user_readers.get(f"{args.target_user}-keyboard")) and has_input_events(
            user_readers.get(f"{args.target_user}-gamepad")
        )
    result["targetReceived"] = target_ok
    result["targetUserReceived"] = target_user_received
    result["korriUserReceived"] = korri_user_received
    result["outsideReaderReceived"] = outside_leak
    result["swaySawDevices"] = sway_leak
    result["privateCandidate"] = target_ok and not outside_leak and not sway_leak
    result["korriUiIsolatedCandidate"] = (
        (target_user_received if args.target_user else target_ok)
        and not sway_leak
        and not korri_user_received
    )

    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"keyboard node: {result['keyboardNode']}")
        print(f"gamepad node:  {result['gamepadNode']}")
        print(f"target received: {target_ok}")
        print(f"outside reader received: {outside_leak}")
        print(f"sway saw devices: {sway_leak}")
        print(f"private candidate: {result['privateCandidate']}")
        if not result["privateCandidate"]:
            print("RESULT: FAIL - plain uinput is not private enough for Remap")
        else:
            print("RESULT: PASS - candidate needs deeper validation")

    return 0 if result["privateCandidate"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
