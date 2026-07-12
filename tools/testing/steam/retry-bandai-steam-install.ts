#!/usr/bin/env bun

interface RemoteResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

const args = new Map<string, string>()
for (let index = 2; index < Bun.argv.length; index += 1) {
  const arg = Bun.argv[index]
  const next = Bun.argv[index + 1]
  if (arg.startsWith("--") && next && !next.startsWith("--")) {
    args.set(arg.slice(2), next)
    index += 1
  }
}

const host = args.get("host") ?? "bandai-guest-ip"
const sshConfig = args.get("ssh-config") ?? "/tmp/bandai-deploy/ssh_config_ip"
const rpcUrl = args.get("rpc-url") ?? "http://bandai:3001/api/rpc"
const appId = args.get("app-id") ?? "1029210"
const helper =
  args.get("helper") ?? "/run/current-system/sw/bin/korri-steam-app-install"

function rpcRequestId(): string {
  return `${Date.now()}000001`
}

async function runRemoteInstall(): Promise<RemoteResult> {
  const proc = Bun.spawn(["ssh", "-F", sshConfig, host, helper, appId], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

async function callRpc(tag: string, payload: unknown): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      _tag: "Request",
      id: rpcRequestId(),
      tag,
      payload,
      headers: [],
    }),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`)
  }
  const parsed = JSON.parse(text) as unknown
  const frames = Array.isArray(parsed) ? parsed : [parsed]
  const exit = frames.find(isExitFrame)
  if (!exit) throw new Error(`RPC response missing Exit frame: ${text}`)
  if (exit.exit._tag === "Success") return exit.exit.value
  throw new Error(
    `RPC failure: ${JSON.stringify(exit.exit.cause ?? exit.exit)}`,
  )
}

function isExitFrame(value: unknown): value is {
  readonly _tag: "Exit"
  readonly exit:
    | { readonly _tag: "Success"; readonly value: unknown }
    | { readonly _tag: "Failure"; readonly cause?: unknown }
} {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { _tag?: unknown })._tag === "Exit" &&
    typeof (value as { exit?: unknown }).exit === "object" &&
    (value as { exit?: unknown }).exit !== null
  )
}

const startedAt = new Date()
const install = await runRemoteInstall()
const installSucceeded = install.exitCode === 0

let status: unknown
try {
  status = await callRpc("app.plugin.install.status", {
    providerId: "@korri:steam",
    appId,
  })
} catch (error) {
  status = { error: error instanceof Error ? error.message : String(error) }
}

const report = {
  host,
  appId,
  helper,
  startedAt: startedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  install: {
    exitCode: install.exitCode,
    stdoutTail: install.stdout.trim().split("\n").slice(-20),
    stderrTail: install.stderr.trim().split("\n").filter(Boolean).slice(-20),
  },
  status,
}

console.log(JSON.stringify(report, null, 2))
if (!installSucceeded) process.exit(install.exitCode || 1)
