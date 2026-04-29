import type { LoggerOptions } from "pino"
import pino from "pino"

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined"
}

function isNode(): boolean {
  return (
    typeof process !== "undefined" &&
    process.versions != null &&
    process.versions.node != null
  )
}

function getMode(): string {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE) {
    return import.meta.env.MODE
  }

  if (isNode() && process.env?.NODE_ENV) {
    return process.env.NODE_ENV
  }

  return "production"
}

const mode = getMode()
const isDevelopment = mode === "development"

const options: LoggerOptions = {
  level: "info",
  base: {
    env: mode,
    app: "Starter App",
  },
  ...(isBrowser()
    ? {
        browser: {
          asObject: false,
        },
      }
    : {}),
  ...(isNode() && isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: false,
            ignore: "pid,hostname,time,env,app,component",
          },
        },
      }
    : {}),
}

export const logger = pino(options)

export const levels = {
  trace: "trace",
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  fatal: "fatal",
} as const

export function createLogger(component: string) {
  return logger.child({ component })
}

export default logger
