#!/usr/bin/env python3
"""Korri input-seat uinput helper.

Sessiond supervises this helper and speaks NDJSON over stdin/stdout. The helper
owns /dev/uinput descriptors, creates gamepad-only Korri Seat P* devices, writes
validated gamepad state, and destroys devices on release or process exit.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import struct
import sys
from dataclasses import dataclass
from typing import Any, Iterable

UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502
UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_SET_ABSBIT = 0x40045567
UI_SET_PHYS = 0x4008556C

EV_SYN = 0x00
EV_KEY = 0x01
EV_ABS = 0x03
SYN_REPORT = 0x00
BUS_USB = 0x03

BTN_A = 0x130
BTN_B = 0x131
BTN_X = 0x133
BTN_Y = 0x134
BTN_TL = 0x136
BTN_TR = 0x137
BTN_SELECT = 0x13A
BTN_START = 0x13B
BTN_MODE = 0x13C
BTN_THUMBL = 0x13D
BTN_THUMBR = 0x13E

ABS_X = 0x00
ABS_Y = 0x01
ABS_Z = 0x02
ABS_RX = 0x03
ABS_RY = 0x04
ABS_RZ = 0x05
ABS_HAT0X = 0x10
ABS_HAT0Y = 0x11

INPUT_EVENT = struct.Struct("llHHi")
UINPUT_USER_DEV = struct.Struct("80sHHHHI" + "i" * 64 * 4)

MAX_PLAYERS = 4
MAX_LINE_BYTES = 8192
DEVICE_RE = re.compile(r"^Korri Seat P([1-4])$")
PHYS_RE = re.compile(r"^korri/input-seat/p([1-4])$")
UNIQ_RE = re.compile(r"^korri-seat-p([1-4])$")

# Sunshine/Moonlight XInput-style button bits.
BUTTON_MAP = {
    0x0010: BTN_START,
    0x0020: BTN_SELECT,
    0x0040: BTN_THUMBL,
    0x0080: BTN_THUMBR,
    0x0100: BTN_TL,
    0x0200: BTN_TR,
    0x0400: BTN_MODE,
    0x1000: BTN_A,
    0x2000: BTN_B,
    0x4000: BTN_X,
    0x8000: BTN_Y,
}
DPAD_UP = 0x0001
DPAD_DOWN = 0x0002
DPAD_LEFT = 0x0004
DPAD_RIGHT = 0x0008
SUPPORTED_BUTTON_MASK = (
    DPAD_UP
    | DPAD_DOWN
    | DPAD_LEFT
    | DPAD_RIGHT
    | 0x0010
    | 0x0020
    | 0x0040
    | 0x0080
    | 0x0100
    | 0x0200
    | 0x0400
    | 0x1000
    | 0x2000
    | 0x4000
    | 0x8000
)
KEYS = tuple(BUTTON_MAP.values())
AXES = (ABS_X, ABS_Y, ABS_Z, ABS_RX, ABS_RY, ABS_RZ, ABS_HAT0X, ABS_HAT0Y)


class ProtocolError(Exception):
    pass


def ioctl(fd: int, request: int, value: int | bytes) -> None:
    fcntl.ioctl(fd, request, value)


@dataclass
class SeatDevice:
    slot: int
    name: str
    phys: str
    token: str
    dry_run: bool = False
    fd: int | None = None

    def create(self) -> None:
        if self.dry_run:
            return
        try:
            fd = os.open("/dev/uinput", os.O_WRONLY | os.O_NONBLOCK | os.O_CLOEXEC)
            os.set_inheritable(fd, False)
            self.fd = fd
            ioctl(fd, UI_SET_EVBIT, EV_KEY)
            ioctl(fd, UI_SET_EVBIT, EV_ABS)
            for key in KEYS:
                ioctl(fd, UI_SET_KEYBIT, key)
            for axis in AXES:
                ioctl(fd, UI_SET_ABSBIT, axis)
            ioctl(fd, UI_SET_PHYS, self.phys.encode("utf-8") + b"\0")

            absmax = [0] * 64
            absmin = [0] * 64
            absfuzz = [0] * 64
            absflat = [0] * 64
            for axis in AXES:
                if axis in (ABS_HAT0X, ABS_HAT0Y):
                    absmin[axis] = -1
                    absmax[axis] = 1
                elif axis in (ABS_Z, ABS_RZ):
                    absmin[axis] = 0
                    absmax[axis] = 255
                else:
                    absmin[axis] = -32768
                    absmax[axis] = 32767
                    absflat[axis] = 4096

            payload = UINPUT_USER_DEV.pack(
                self.name.encode("utf-8")[:79],
                BUS_USB,
                0x045E,
                0x028E,
                1,
                0,
                *absmax,
                *absmin,
                *absfuzz,
                *absflat,
            )
            os.write(fd, payload)
            ioctl(fd, UI_DEV_CREATE, 0)
        except Exception:
            self.destroy()
            raise

    def destroy(self) -> None:
        fd = self.fd
        self.fd = None
        if fd is None:
            return
        try:
            ioctl(fd, UI_DEV_DESTROY, 0)
        finally:
            os.close(fd)

    def emit_state(self, state: dict[str, int]) -> None:
        if self.dry_run:
            return
        if self.fd is None:
            raise ProtocolError("seat is not created")
        buttons = state["buttons"]
        for mask, key in BUTTON_MAP.items():
            self.emit(EV_KEY, key, 1 if buttons & mask else 0)
        self.emit(EV_ABS, ABS_HAT0X, hat_axis(buttons, DPAD_LEFT, DPAD_RIGHT))
        self.emit(EV_ABS, ABS_HAT0Y, hat_axis(buttons, DPAD_UP, DPAD_DOWN))
        self.emit(EV_ABS, ABS_Z, state["leftTrigger"])
        self.emit(EV_ABS, ABS_RZ, state["rightTrigger"])
        self.emit(EV_ABS, ABS_X, state["leftStickX"])
        self.emit(EV_ABS, ABS_Y, state["leftStickY"])
        self.emit(EV_ABS, ABS_RX, state["rightStickX"])
        self.emit(EV_ABS, ABS_RY, state["rightStickY"])
        self.emit(EV_SYN, SYN_REPORT, 0)

    def emit(self, event_type: int, code: int, value: int) -> None:
        if event_type not in (EV_SYN, EV_KEY, EV_ABS):
            raise ProtocolError("unsupported event type")
        if self.fd is None:
            raise ProtocolError("seat is not created")
        os.write(self.fd, INPUT_EVENT.pack(0, 0, event_type, code, value))


def hat_axis(buttons: int, negative_mask: int, positive_mask: int) -> int:
    negative = bool(buttons & negative_mask)
    positive = bool(buttons & positive_mask)
    if negative == positive:
        return 0
    return -1 if negative else 1


class Helper:
    def __init__(self, *, dry_run: bool = False) -> None:
        self.dry_run = dry_run
        self.seats: dict[str, SeatDevice] = {}

    def close(self) -> None:
        for seat in list(self.seats.values()):
            seat.destroy()
        self.seats.clear()

    def handle(self, command: dict[str, Any]) -> dict[str, Any]:
        op = require_string(command, "op")
        if op == "create":
            return self.create(command)
        if op == "state":
            return self.state(command)
        if op == "release":
            return self.release(command)
        raise ProtocolError("unknown operation")

    def create(self, command: dict[str, Any]) -> dict[str, Any]:
        slot = require_slot(command)
        name = require_string(command, "name")
        phys = require_string(command, "phys")
        uniq = require_string(command, "uniq")
        if DEVICE_RE.fullmatch(name) is None or name != f"Korri Seat P{slot}":
            raise ProtocolError("invalid seat name")
        if PHYS_RE.fullmatch(phys) is None or phys != f"korri/input-seat/p{slot}":
            raise ProtocolError("invalid seat phys")
        if UNIQ_RE.fullmatch(uniq) is None or uniq != f"korri-seat-p{slot}":
            raise ProtocolError("invalid seat token identity")
        token = uniq
        if token in self.seats:
            raise ProtocolError("seat already exists")
        seat = SeatDevice(slot=slot, name=name, phys=phys, token=token, dry_run=self.dry_run)
        seat.create()
        self.seats[token] = seat
        return {"ok": True, "token": token}

    def state(self, command: dict[str, Any]) -> dict[str, Any]:
        token = require_string(command, "token")
        slot = require_slot(command)
        seat = self.seats.get(token)
        if seat is None or seat.slot != slot:
            raise ProtocolError("unknown seat token")
        state = validate_state(command.get("state"))
        seat.emit_state(state)
        return {"ok": True}

    def release(self, command: dict[str, Any]) -> dict[str, Any]:
        token = require_string(command, "token")
        slot = require_slot(command)
        seat = self.seats.get(token)
        if seat is None or seat.slot != slot:
            raise ProtocolError("unknown seat token")
        self.seats.pop(token, None)
        seat.destroy()
        return {"ok": True}


def require_slot(command: dict[str, Any]) -> int:
    slot = command.get("slot")
    if not isinstance(slot, int) or slot < 1 or slot > MAX_PLAYERS:
        raise ProtocolError("invalid slot")
    return slot


def require_string(command: dict[str, Any], field: str) -> str:
    value = command.get(field)
    if not isinstance(value, str) or not value or len(value) > 128 or "\n" in value:
        raise ProtocolError(f"invalid {field}")
    return value


def validate_state(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        raise ProtocolError("invalid state")
    fields = {
        "buttons": (0, 0xFFFFFFFF),
        "leftTrigger": (0, 255),
        "rightTrigger": (0, 255),
        "leftStickX": (-32768, 32767),
        "leftStickY": (-32768, 32767),
        "rightStickX": (-32768, 32767),
        "rightStickY": (-32768, 32767),
    }
    out: dict[str, int] = {}
    for field, (minimum, maximum) in fields.items():
        item = value.get(field)
        if not isinstance(item, int) or item < minimum or item > maximum:
            raise ProtocolError(f"invalid {field}")
        out[field] = item
    if out["buttons"] & ~SUPPORTED_BUTTON_MASK:
        raise ProtocolError("unsupported button bits")
    return out


def serve(helper: Helper) -> None:
    try:
        for raw in sys.stdin.buffer:
            if len(raw) > MAX_LINE_BYTES:
                write_response({"id": None, "ok": False, "error": "command too large"})
                continue
            try:
                command = json.loads(raw.decode("utf-8"))
                if not isinstance(command, dict):
                    raise ProtocolError("command must be an object")
                command_id = command.get("id")
                if not isinstance(command_id, int):
                    raise ProtocolError("invalid id")
                response = helper.handle(command)
                response["id"] = command_id
                write_response(response)
            except Exception as error:
                command_id = command.get("id") if isinstance(locals().get("command"), dict) else None
                write_response({"id": command_id, "ok": False, "error": str(error)})
    finally:
        helper.close()


def write_response(response: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def run_self_test() -> None:
    helper = Helper(dry_run=True)
    created = helper.handle(
        {
            "op": "create",
            "slot": 1,
            "name": "Korri Seat P1",
            "phys": "korri/input-seat/p1",
            "uniq": "korri-seat-p1",
        }
    )
    token = created["token"]
    helper.handle(
        {
            "op": "state",
            "slot": 1,
            "token": token,
            "state": {
                "buttons": 0x1000,
                "leftTrigger": 255,
                "rightTrigger": 0,
                "leftStickX": -1,
                "leftStickY": 1,
                "rightStickX": 0,
                "rightStickY": 42,
            },
        }
    )
    try:
        helper.handle(
            {
                "op": "state",
                "slot": 1,
                "token": token,
                "state": {
                    "buttons": 0x10000,
                    "leftTrigger": 0,
                    "rightTrigger": 0,
                    "leftStickX": 0,
                    "leftStickY": 0,
                    "rightStickX": 0,
                    "rightStickY": 0,
                },
            }
        )
    except ProtocolError:
        pass
    else:
        raise AssertionError("unsupported button bits were accepted")
    try:
        helper.handle({"op": "release", "slot": 2, "token": token})
    except ProtocolError:
        pass
    else:
        raise AssertionError("wrong-slot release was accepted")
    if token not in helper.seats:
        raise AssertionError("wrong-slot release removed a live seat")
    helper.handle({"op": "release", "slot": 1, "token": token})
    helper.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="validate protocol without opening /dev/uinput")
    parser.add_argument("--self-test", action="store_true", help="run protocol self-test without opening /dev/uinput")
    args = parser.parse_args()
    if args.self_test:
        run_self_test()
        return 0
    serve(Helper(dry_run=args.dry_run))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
