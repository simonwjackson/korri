export const EV_KEY = 1
export const EV_SW = 5

export const BTN_A = 0x130
export const BTN_B = 0x131
export const BTN_X = 0x133
export const BTN_Y = 0x134
export const BTN_TL = 0x136
export const BTN_TR = 0x137
export const BTN_SELECT = 0x13a
export const BTN_START = 0x13b
export const BTN_THUMBL = 0x13d
export const BTN_THUMBR = 0x13e
export const BTN_DPAD_UP = 0x220
export const BTN_DPAD_DOWN = 0x221
export const BTN_DPAD_LEFT = 0x222
export const BTN_DPAD_RIGHT = 0x223
export const BTN_BACK = 0x116

export const KEY_VOLUMEUP = 0x73
export const KEY_VOLUMEDOWN = 0x72
export const KEY_BRIGHTNESSUP = 0xe1
export const KEY_BRIGHTNESSDOWN = 0xe0
export const KEY_POWER = 0x74
export const KEY_RECORD = 0xa7
export const SW_LID = 0x00

export const KORRI_KILL_GAME_BUTTONS = [
  BTN_TL,
  BTN_TR,
  BTN_SELECT,
  BTN_START,
] as const

export const KORRI_SESSION_TOGGLE_BUTTONS = [
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_START,
] as const
