#!/usr/bin/env python3
"""Privileged native driver for Korri Remap.

This is the product-owned launch boundary behind korri-remap-bridge. It creates
per-launch synthetic keyboard/gamepad devices through uinput, hides them from
libinput/Sway/normal users, grants read access only to korri-remap-runner, runs
the child as that user, and destroys the devices before exiting.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import pwd
import re
import select
import signal
import struct
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence

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

INPUT_EVENT = struct.Struct("llHHi")
UINPUT_USER_DEV = struct.Struct("80sHHHHI" + "i" * 64 * 4)

RUNNER_USER = "korri-remap-runner"
DEVICE_PREFIX = "Korri Remap"
STICK_THRESHOLD = 16000
DIRTY_CLEANUP_EXIT_CODE = 120

KEY_CODES = {
    "a": 30,
    "b": 48,
    "c": 46,
    "d": 32,
    "e": 18,
    "f": 33,
    "g": 34,
    "h": 35,
    "i": 23,
    "j": 36,
    "k": 37,
    "l": 38,
    "m": 50,
    "n": 49,
    "o": 24,
    "p": 25,
    "q": 16,
    "r": 19,
    "s": 31,
    "t": 20,
    "u": 22,
    "v": 47,
    "w": 17,
    "x": 45,
    "y": 21,
    "z": 44,
    "enter": 28,
    "escape": 1,
    "space": 57,
    "tab": 15,
    "backspace": 14,
    "arrow-up": 103,
    "arrow-down": 108,
    "arrow-left": 105,
    "arrow-right": 106,
}

BTN = {
    "south": 0x130,
    "east": 0x131,
    "north": 0x133,
    "west": 0x134,
    "select": 0x13A,
    "start": 0x13B,
}
DPAD_BTN = {
    "up": 0x220,
    "down": 0x221,
    "left": 0x222,
    "right": 0x223,
}
ABS = {
    "left:x": 0x00,
    "left:y": 0x01,
    "right:x": 0x03,
    "right:y": 0x04,
    "hat:x": 0x10,
    "hat:y": 0x11,
}

SOURCE_KEY_TO_REF = {
    BTN["south"]: "button.south",
    BTN["east"]: "button.east",
    BTN["north"]: "button.north",
    BTN["west"]: "button.west",
    BTN["select"]: "button.select",
    BTN["start"]: "button.start",
    DPAD_BTN["up"]: "dpad.up",
    DPAD_BTN["down"]: "dpad.down",
    DPAD_BTN["left"]: "dpad.left",
    DPAD_BTN["right"]: "dpad.right",
}

SOURCE_ABS_TO_DIRECTIONS = {
    ABS["hat:x"]: ("dpad.left", "dpad.right"),
    ABS["hat:y"]: ("dpad.up", "dpad.down"),
    ABS["left:x"]: ("stick.left.left", "stick.left.right"),
    ABS["left:y"]: ("stick.left.up", "stick.left.down"),
    ABS["right:x"]: ("stick.right.left", "stick.right.right"),
    ABS["right:y"]: ("stick.right.up", "stick.right.down"),
}


@dataclass(frozen=True)
class Target:
    ref: str
    kind: str
    key: str | None = None
    control: dict[str, str] | None = None


@dataclass(frozen=True)
class Binding:
    source_ref: str
    targets: tuple[Target, ...]


@dataclass
class Engine:
    bindings: dict[str, list[Binding]]
    sink: "NativeSink"
    active_sources: set[str] = field(default_factory=set)
    active_target_sources: dict[str, set[str]] = field(default_factory=dict)
    target_refs: dict[str, Target] = field(default_factory=dict)

    def set_source(self, source_ref: str, pressed: bool) -> None:
        if pressed:
            self._release_active_stick_peers(source_ref)
            self._press_source(source_ref)
        else:
            self._release_source(source_ref)

    def release_all(self) -> None:
        self.active_sources.clear()
        for target_ref, target in list(self.target_refs.items()):
            if target_ref in self.active_target_sources:
                self.active_target_sources.pop(target_ref, None)
                self.sink.release(target)
        self.sink.sync_all()

    def _press_source(self, source_ref: str) -> None:
        if source_ref in self.active_sources:
            return
        self.active_sources.add(source_ref)
        for binding in self.bindings.get(source_ref, []):
            for target in binding.targets:
                sources = self.active_target_sources.setdefault(target.ref, set())
                was_inactive = not sources
                sources.add(source_ref)
                if was_inactive:
                    self.sink.press(target)
        self.sink.sync_all()

    def _release_source(self, source_ref: str) -> None:
        if source_ref not in self.active_sources:
            return
        self.active_sources.remove(source_ref)
        for binding in self.bindings.get(source_ref, []):
            for target in binding.targets:
                sources = self.active_target_sources.get(target.ref)
                if not sources:
                    continue
                sources.discard(source_ref)
                if not sources:
                    self.active_target_sources.pop(target.ref, None)
                    self.sink.release(target)
        self.sink.sync_all()

    def _release_active_stick_peers(self, source_ref: str) -> None:
        group = stick_group(source_ref)
        if not group:
            return
        for active in list(self.active_sources):
            if active != source_ref and stick_group(active) == group:
                self._release_source(active)


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
            if axis in (ABS["hat:x"], ABS["hat:y"]):
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
            raise RuntimeError(f"{self.name} is not created")
        now = time.time()
        sec = int(now)
        usec = int((now - sec) * 1_000_000)
        os.write(self.fd, INPUT_EVENT.pack(sec, usec, event_type, code, value))

    def sync(self) -> None:
        self.emit(EV_SYN, SYN_REPORT, 0)


class NativeSink:
    def __init__(self, keyboard: UInputDevice, gamepad: UInputDevice) -> None:
        self.keyboard = keyboard
        self.gamepad = gamepad
        self.gamepad_axis_values: dict[int, int] = {}

    def press(self, target: Target) -> None:
        self._emit(target, True)

    def release(self, target: Target) -> None:
        self._emit(target, False)

    def sync_all(self) -> None:
        self.keyboard.sync()
        self.gamepad.sync()

    def _emit(self, target: Target, pressed: bool) -> None:
        if target.kind == "keyboard":
            assert target.key is not None
            code = KEY_CODES.get(target.key)
            if code is None:
                raise RuntimeError(f"unsupported keyboard target: key.{target.key}")
            self.keyboard.emit(EV_KEY, code, 1 if pressed else 0)
            return
        if target.kind != "controller" or target.control is None:
            raise RuntimeError(f"unsupported target: {target.ref}")
        control = target.control
        kind = control.get("kind")
        if kind == "button":
            self.gamepad.emit(EV_KEY, BTN[control["button"]], 1 if pressed else 0)
        elif kind == "dpad":
            axis, value = dpad_axis_value(control["direction"], pressed)
            self._set_gamepad_axis(axis, value)
        elif kind == "stick":
            axis, value = stick_axis_value(control["stick"], control["direction"], pressed)
            self._set_gamepad_axis(axis, value)
        else:
            raise RuntimeError(f"unsupported controller target: {target.ref}")

    def _set_gamepad_axis(self, axis: int, value: int) -> None:
        self.gamepad_axis_values[axis] = value
        self.gamepad.emit(EV_ABS, axis, value)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--launch-id", required=True)
    parser.add_argument("--policy-json", required=True)
    parser.add_argument("--runner-user", default=RUNNER_USER)
    parser.add_argument("--", dest="separator", action="store_true")
    args, child = parser.parse_known_args()
    if child and child[0] == "--":
        child = child[1:]
    if not child:
        fail("missing child command after --")
    if args.runner_user != RUNNER_USER:
        fail(f"runner user must be {RUNNER_USER}")
    if os.geteuid() != 0:
        fail("native driver must run as root")
    if not Path("/dev/uinput").exists():
        fail("/dev/uinput is missing")

    policy = json.loads(args.policy_json)
    bindings = decode_bindings(policy)
    controllers = resolve_sources(policy)
    keyboard = UInputDevice(
        f"{DEVICE_PREFIX} Keyboard {safe_launch_suffix(args.launch_id)}",
        keys=KEY_CODES.values(),
    )
    gamepad = UInputDevice(
        f"{DEVICE_PREFIX} Gamepad {safe_launch_suffix(args.launch_id)}",
        keys=[*BTN.values(), *DPAD_BTN.values()],
        axes=[ABS["left:x"], ABS["left:y"], ABS["right:x"], ABS["right:y"], ABS["hat:x"], ABS["hat:y"]],
    )
    source_fds: list[int] = []
    child_proc: subprocess.Popen[bytes] | None = None
    received_signal: int | None = None
    synthetic_device_names = {keyboard.name, gamepad.name}

    def on_signal(signum: int, _frame: object) -> None:
        nonlocal received_signal
        received_signal = signum
        if child_proc and child_proc.poll() is None:
            child_proc.terminate()

    signal.signal(signal.SIGTERM, on_signal)
    signal.signal(signal.SIGINT, on_signal)

    try:
        keyboard.create()
        gamepad.create()
        keyboard_node = find_event_node(keyboard.name, time.time() + 3)
        gamepad_node = find_event_node(gamepad.name, time.time() + 3)
        settle_udev()
        harden_event_node(keyboard_node, args.runner_user)
        harden_event_node(gamepad_node, args.runner_user)
        time.sleep(0.2)
        settle_udev()
        harden_event_node(keyboard_node, args.runner_user)
        harden_event_node(gamepad_node, args.runner_user)
        disable_sway_input(keyboard.name)
        disable_sway_input(gamepad.name)
        time.sleep(0.2)
        assert_sway_isolated({keyboard.name, gamepad.name})

        for player, path in controllers.items():
            fd = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
            source_fds.append(fd)

        sink = NativeSink(keyboard, gamepad)
        engine = Engine(bindings=bindings, sink=sink, target_refs=target_refs(bindings))
        child_proc = subprocess.Popen(
            runner_command(args.runner_user, child),
            env=child_environment(os.environ),
            cwd=os.getcwd(),
        )
        source_players = dict(zip(source_fds, controllers.keys(), strict=True))
        while child_proc.poll() is None and received_signal is None:
            ready, _, _ = select.select(source_fds, [], [], 0.05)
            for fd in ready:
                for event_type, code, value in read_available_events(fd):
                    for ref, pressed in source_events(source_players[fd], event_type, code, value):
                        engine.set_source(ref, pressed)
        engine.release_all()
        if child_proc.poll() is None:
            child_proc.terminate()
            try:
                child_proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                child_proc.kill()
                child_proc.wait(timeout=1)
        exit_code = child_proc.returncode if child_proc.returncode is not None else 1
    finally:
        for fd in source_fds:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            keyboard.destroy()
        finally:
            gamepad.destroy()
        if not wait_devices_gone(synthetic_device_names, time.time() + 3):
            print("korri-remap-native-driver: cleanup verification failed", file=sys.stderr)
            raise SystemExit(DIRTY_CLEANUP_EXIT_CODE)

    if received_signal is not None:
        return 128 + received_signal
    return exit_code


def decode_bindings(policy: dict[str, object]) -> dict[str, list[Binding]]:
    by_source: dict[str, list[Binding]] = {}
    for item in policy.get("bindings", []):
        if not isinstance(item, dict):
            fail("invalid binding in policy")
        source = item.get("source")
        targets_value = item.get("targets")
        if not isinstance(source, dict) or not isinstance(source.get("ref"), str):
            fail("invalid binding source")
        if not isinstance(targets_value, list):
            fail("invalid binding targets")
        targets = tuple(decode_target(target) for target in targets_value)
        binding = Binding(source_ref=source["ref"], targets=targets)
        by_source.setdefault(binding.source_ref, []).append(binding)
    if not by_source:
        fail("policy contains no bindings")
    return by_source


def decode_target(value: object) -> Target:
    if not isinstance(value, dict) or not isinstance(value.get("ref"), str):
        fail("invalid target")
    kind = value.get("kind")
    if kind == "keyboard":
        key = value.get("key")
        if not isinstance(key, str) or key not in KEY_CODES:
            fail(f"unsupported keyboard target: {value.get('ref')}")
        return Target(ref=value["ref"], kind="keyboard", key=key)
    if kind == "controller":
        control = value.get("control")
        if not isinstance(control, dict):
            fail("invalid controller target")
        return Target(ref=value["ref"], kind="controller", control={str(k): str(v) for k, v in control.items()})
    fail(f"unsupported target kind: {kind}")


def target_refs(bindings: dict[str, list[Binding]]) -> dict[str, Target]:
    result: dict[str, Target] = {}
    for group in bindings.values():
        for binding in group:
            for target in binding.targets:
                result[target.ref] = target
    return result


def resolve_sources(policy: dict[str, object]) -> dict[str, str]:
    controllers_value = policy.get("controllers")
    if not isinstance(controllers_value, dict):
        fail("policy controllers must be an object")
    devices = discover_input_devices()
    candidates = [device for device in devices if is_inputplumber_virtual_gamepad(device)]
    resolved: dict[str, str] = {}
    used_nodes: set[str] = set()
    for player, controller in controllers_value.items():
        if not isinstance(controller, dict) or controller.get("source") != "inputplumber-virtual-gamepad":
            fail(f"controller {player} must use inputplumber-virtual-gamepad")
        prefer = controller.get("prefer")
        preferred_name = None
        if isinstance(prefer, dict) and isinstance(prefer.get("name"), str):
            preferred_name = prefer["name"]
        selection = [device for device in candidates if preferred_name is None or slugify(device["name"]) == preferred_name]
        if len(selection) != 1:
            fail(f"controller {player} resolution failed: matched {len(selection)} InputPlumber virtual gamepads")
        event_node = selection[0]["eventNode"]
        if event_node in used_nodes:
            fail(f"controller {player} resolves to duplicate event node {event_node}")
        used_nodes.add(event_node)
        resolved[str(player)] = f"/dev/input/{event_node}"
    return resolved


def discover_input_devices() -> list[dict[str, str]]:
    text = Path("/proc/bus/input/devices").read_text(errors="replace")
    devices: list[dict[str, str]] = []
    for block in text.split("\n\n"):
        name_match = re.search(r'N: Name="(.*?)"', block)
        handlers_match = re.search(r"H: Handlers=(.*)", block)
        event_match = re.search(r"\b(event\d+)\b", handlers_match.group(1) if handlers_match else "")
        if not name_match or not event_match:
            continue
        sysfs_match = re.search(r"S: Sysfs=(.*)", block)
        phys_match = re.search(r"P: Phys=(.*)", block)
        uniq_match = re.search(r"U: Uniq=(.*)", block)
        handlers = handlers_match.group(1) if handlers_match else ""
        devices.append(
            {
                "name": name_match.group(1),
                "eventNode": event_match.group(1),
                "sysfsPath": sysfs_match.group(1).strip() if sysfs_match else "",
                "physicalPath": phys_match.group(1).strip() if phys_match else "",
                "uniqueId": uniq_match.group(1).strip() if uniq_match else "",
                "handlers": handlers,
                "class": input_device_class(name_match.group(1), handlers, block),
                "raw": block,
            }
        )
    return devices


def input_device_class(name: str, handlers: str, block: str) -> str:
    normalized = name.lower()
    if (
        "js" in handlers
        or "joystick" in block.lower()
        or "gamepad" in normalized
        or "xbox" in normalized
        or "x-box" in normalized
        or name in {"Microsoft X-Box 360 pad", "Microsoft Xbox Series S|X Controller"}
    ):
        return "gamepad"
    return "unknown"


def is_inputplumber_virtual_gamepad(device: dict[str, str]) -> bool:
    if device["class"] != "gamepad":
        return False
    evidence = "\n".join([device.get("name", ""), device.get("sysfsPath", ""), device.get("physicalPath", ""), device.get("uniqueId", ""), device.get("raw", "")]).lower()
    if "inputplumber" in evidence:
        return True
    return device.get("sysfsPath", "").startswith("/devices/virtual/input/") and device.get("name") in {
        "Microsoft X-Box 360 pad",
        "Microsoft Xbox Series S|X Controller",
    }


def source_events(player: str, event_type: int, code: int, value: int) -> list[tuple[str, bool]]:
    prefix = f"{player}."
    if event_type == EV_KEY and code in SOURCE_KEY_TO_REF:
        return [(prefix + SOURCE_KEY_TO_REF[code], value != 0)]
    if event_type == EV_ABS and code in SOURCE_ABS_TO_DIRECTIONS:
        negative, positive = SOURCE_ABS_TO_DIRECTIONS[code]
        if code in (ABS["hat:x"], ABS["hat:y"]):
            return [(prefix + negative, value < 0), (prefix + positive, value > 0)]
        return [(prefix + negative, value < -STICK_THRESHOLD), (prefix + positive, value > STICK_THRESHOLD)]
    return []


def read_available_events(fd: int) -> list[tuple[int, int, int]]:
    events: list[tuple[int, int, int]] = []
    while True:
        try:
            data = os.read(fd, INPUT_EVENT.size)
        except BlockingIOError:
            break
        if not data or len(data) < INPUT_EVENT.size:
            break
        _sec, _usec, event_type, code, value = INPUT_EVENT.unpack(data)
        if event_type != EV_SYN:
            events.append((event_type, code, value))
    return events


def dpad_axis_value(direction: str, pressed: bool) -> tuple[int, int]:
    if direction in ("left", "right"):
        return ABS["hat:x"], (-1 if direction == "left" and pressed else 1 if direction == "right" and pressed else 0)
    return ABS["hat:y"], (-1 if direction == "up" and pressed else 1 if direction == "down" and pressed else 0)


def stick_axis_value(stick: str, direction: str, pressed: bool) -> tuple[int, int]:
    axis = ABS[f"{stick}:{'x' if direction in ('left', 'right') else 'y'}"]
    if not pressed:
        return axis, 0
    if direction in ("left", "up"):
        return axis, -32768
    return axis, 32767


def stick_group(source_ref: str) -> str | None:
    parts = source_ref.split(".")
    if len(parts) == 4 and parts[1] == "stick":
        return ".".join(parts[:3])
    return None


def find_event_node(name: str, deadline: float) -> Path:
    while time.time() < deadline:
        for device in discover_input_devices():
            if device["name"] == name:
                return Path("/dev/input") / device["eventNode"]
        time.sleep(0.05)
    fail(f"timed out waiting for event node for {name}")


def harden_event_node(path: Path, user: str) -> None:
    run_quiet(["setfacl", "-b", str(path)])
    os.chown(path, 0, 0)
    os.chmod(path, 0o600)
    run_quiet(["setfacl", "-m", f"u:{user}:r", str(path)])


def disable_sway_input(device_name: str) -> None:
    inputs = sway_inputs()
    if not isinstance(inputs, list):
        return
    for entry in inputs:
        if entry.get("name") != device_name:
            continue
        identifier = entry.get("identifier")
        if isinstance(identifier, str):
            run_quiet(["swaymsg", "input", identifier, "events", "disabled"], env=sway_env())


def assert_sway_isolated(device_names: set[str]) -> None:
    inputs = sway_inputs()
    if not isinstance(inputs, list):
        return
    active = [
        entry.get("name")
        for entry in inputs
        if entry.get("name") in device_names and not sway_entry_is_disabled(entry)
    ]
    if active:
        fail(f"synthetic Remap devices are active in Sway: {active}")


def sway_entry_is_disabled(entry: object) -> bool:
    if isinstance(entry, dict):
        for key, value in entry.items():
            if key == "send_events" and value == "disabled":
                return True
            if isinstance(value, (dict, list)) and sway_entry_is_disabled(value):
                return True
    if isinstance(entry, list):
        return any(sway_entry_is_disabled(value) for value in entry)
    return False


def sway_inputs() -> object:
    try:
        output = subprocess.check_output(["swaymsg", "-t", "get_inputs"], text=True, stderr=subprocess.STDOUT, timeout=2, env=sway_env())
        return json.loads(output)
    except Exception:
        return None


def sway_env() -> dict[str, str]:
    env = os.environ.copy()
    if "SWAYSOCK" not in env:
        for runtime in Path("/run/user").glob("*/sway-ipc.*.sock"):
            env["SWAYSOCK"] = str(runtime)
            break
    return env


def runner_command(user: str, child: Sequence[str]) -> list[str]:
    entry = pwd.getpwnam(user)
    return ["setpriv", f"--reuid={entry.pw_uid}", f"--regid={entry.pw_gid}", "--init-groups", *child]


def child_environment(env: os._Environ[str]) -> dict[str, str]:
    return {key: value for key, value in env.items() if not key.startswith("KORRI_REMAP_")}


def wait_devices_gone(names: set[str], deadline: float) -> bool:
    while time.time() < deadline:
        present = {device["name"] for device in discover_input_devices() if device["name"] in names}
        if not present:
            return True
        time.sleep(0.05)
    return False


def settle_udev() -> None:
    run_quiet(["udevadm", "settle"])


def run_quiet(command: Sequence[str], env: dict[str, str] | None = None) -> None:
    subprocess.run(command, check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=2, env=env)


def ioctl(fd: int, request: int, value: int) -> None:
    fcntl.ioctl(fd, request, value)


def slugify(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.strip().lower()))


def safe_launch_suffix(value: str) -> str:
    suffix = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip())[:32]
    return suffix or "launch"


def fail(message: str) -> None:
    print(f"korri-remap-native-driver: {message}", file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    raise SystemExit(main())
