import { afterEach, describe, expect, it } from "bun:test";
import register, {
  classifySteamLaunchTranscript,
  classifySteamRuntimeVerifyTranscript,
  normalizeKorridRpcUrl,
} from "../extensions/korrid-tools";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("korrid-tools Pi package", () => {
  it("registers read-only and mutating tools with confirmation fields", () => {
    const tools: Array<{
      readonly name: string;
      readonly parameters: unknown;
    }> = [];
    register({
      registerTool: (tool) =>
        tools.push({ name: tool.name, parameters: tool.parameters }),
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      "korrid_query",
      "korrid_find_game",
      "korrid_dry_run_launch",
      "korrid_launch_game",
      "korrid_stop_session",
      "korri_steam_launch_supervise",
      "korri_steam_runtime_verify",
    ]);
    expect(JSON.stringify(tools[0].parameters)).toContain("source-status");
    expect(JSON.stringify(tools[0].parameters)).toContain("rpc");
    expect(JSON.stringify(tools[1].parameters)).toContain("query");
    expect(JSON.stringify(tools[2].parameters)).toContain("profileId");
    expect(JSON.stringify(tools[3].parameters)).toContain("appId");
    expect(JSON.stringify(tools[3].parameters)).toContain("confirmLaunch");
    expect(JSON.stringify(tools[4].parameters)).toContain("confirmStop");
    expect(JSON.stringify(tools[5].parameters)).toContain("expectedGameExe");
    expect(JSON.stringify(tools[5].parameters)).toContain("timeoutSeconds");
    expect(JSON.stringify(tools[6].parameters)).toContain("expectedWrapperBin");
  });

  it("normalizes host, base URL, and RPC URL inputs", () => {
    expect(normalizeKorridRpcUrl("bandai")).toBe("http://bandai:3001/api/rpc");
    expect(normalizeKorridRpcUrl("http://bandai:3001")).toBe(
      "http://bandai:3001/api/rpc",
    );
    expect(normalizeKorridRpcUrl("http://bandai:3001/api/rpc")).toBe(
      "http://bandai:3001/api/rpc",
    );
  });

  it("supports allowlisted read-only raw rpc queries", async () => {
    let body = "";
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      body = String(init?.body);
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: { _tag: "Success", value: { ok: true } },
      });
    }) as typeof fetch;

    const tool = registeredTool("korrid_query");
    const result = await tool.execute("call-1", {
      command: "rpc",
      tag: "app.source.list",
      payload: { compact: true },
      url: "http://bandai:3001",
    });

    expect(result).toMatchObject({ details: { ok: true } });
    expect(JSON.parse(body)).toMatchObject({
      tag: "app.source.list",
      payload: { compact: true },
    });
  });

  it("finds games by querying the library list RPC", async () => {
    let body = "";
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      body = String(init?.body);
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: {
          _tag: "Success",
          value: {
            games: [
              { id: "snes/echo.smc", title: "Echo Runner" },
              { id: "nes/mario.nes", title: "Mario" },
            ],
          },
        },
      });
    }) as typeof fetch;

    const tool = registeredTool("korrid_find_game");
    const result = await tool.execute("call-1", {
      query: "echo",
      url: "http://bandai:3001",
    });

    expect(result).toMatchObject({
      details: {
        ok: true,
        result: {
          _tag: "GameFound",
          game: { id: "snes/echo.smc", title: "Echo Runner" },
        },
      },
    });
    expect(JSON.parse(body)).toMatchObject({ tag: "app.library.list" });
  });

  it("finds exact ids before partial title matches", async () => {
    globalThis.fetch = libraryFetch([
      { id: "snes/echo.smc", title: "Echo Runner" },
      { id: "nes/echo.smc", title: "Echo Clone" },
    ]);

    const tool = registeredTool("korrid_find_game");
    const result = await tool.execute("call-1", { query: "snes/echo.smc" });

    expect(result).toMatchObject({
      details: {
        result: { _tag: "GameFound", match: "exact-id" },
      },
    });
  });

  it("returns explicit error find results for missing and ambiguous queries", async () => {
    globalThis.fetch = (async () =>
      Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: {
          _tag: "Success",
          value: {
            games: [
              { id: "snes/echo.smc", title: "Echo Runner" },
              { id: "snes/echo-2.smc", title: "Echo Runner 2" },
            ],
          },
        },
      })) as typeof fetch;

    const tool = registeredTool("korrid_find_game");
    const ambiguous = await tool.execute("call-1", { query: "echo" });

    expect(ambiguous).toMatchObject({ isError: true });
    expect(JSON.stringify(ambiguous)).toContain("AmbiguousGame");

    globalThis.fetch = libraryFetch([{ id: "snes/echo.smc", title: "Echo" }]);
    const missing = await tool.execute("call-2", { query: "missing" });
    expect(missing).toMatchObject({ isError: true });
    expect(JSON.stringify(missing)).toContain("GameNotFound");

    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return Response.json({});
    }) as typeof fetch;
    const empty = await tool.execute("call-3", { query: "   " });
    expect(empty).toMatchObject({ isError: true });
    expect(JSON.stringify(empty)).toContain("MissingQuery");
    expect(fetchCalls).toBe(0);
  });

  it("dry-runs launch through the daemon dry-run RPC without confirmation", async () => {
    let body = "";
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      body = String(init?.body);
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: {
          _tag: "Success",
          value: {
            _tag: "LaunchDryRunOk",
            selection: { id: "snes/echo.smc", profileId: "default" },
            spec: { command: "echo", args: ["hello"] },
            readiness: { _tag: "SessionReady", mode: "idle" },
            caveats: [],
          },
        },
      });
    }) as typeof fetch;

    const tool = registeredTool("korrid_dry_run_launch");
    const result = await tool.execute("call-1", {
      id: "snes/echo.smc",
      profileId: "default",
    });

    expect(result).toMatchObject({ details: { ok: true } });
    expect(JSON.parse(body)).toMatchObject({
      tag: "app.library.launch.dry-run",
      payload: { id: "snes/echo.smc", profileId: "default" },
    });
  });

  it("forwards app id in confirmed launch payloads", async () => {
    let body = "";
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      body = String(init?.body);
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: { _tag: "Success", value: { status: "launched" } },
      });
    }) as typeof fetch;

    const tool = registeredTool("korrid_launch_game");
    await tool.execute("call-1", {
      id: "snes/echo.smc",
      appId: "retroarch",
      confirmLaunch: true,
    });

    expect(JSON.parse(body)).toMatchObject({
      tag: "app.library.launch",
      payload: { id: "snes/echo.smc", appId: "retroarch" },
    });
  });

  it("rejects mutating launch without explicit confirmation", async () => {
    const tool = registeredTool("korrid_launch_game");

    const result = await tool.execute("call-1", { id: "snes/echo.smc" });

    expect(result).toMatchObject({ isError: true });
    expect(JSON.stringify(result)).toContain("explicit confirmation");
  });

  it("sends distinct raw HTTP RPC request ids", async () => {
    const bodies: string[] = [];
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      bodies.push(String(init?.body));
      return Response.json({
        _tag: "Exit",
        requestId: "server-frame",
        exit: { _tag: "Success", value: { ok: true } },
      });
    }) as typeof fetch;

    const tool = registeredTool("korrid_query");
    await tool.execute("call-1", {
      command: "status",
      url: "http://bandai:3001",
    });
    await tool.execute("call-2", {
      command: "status",
      url: "http://bandai:3001",
    });

    const ids = bodies.map((body) => JSON.parse(body).id);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids.every((id) => /^\d+$/.test(id))).toBe(true);
  });

  it("classifies successful Steam launches with Freedreno render nodes", () => {
    const result = classifySteamLaunchTranscript(
      `Game process added : AppID 1029210\nGAME_PID=216880\n/run/pressure-vessel/interpreter-root/var/pressure-vessel/gfx/main/usr/lib/libvulkan_freedreno.so\nlrwx------ 47 -> /dev/dri/renderD128\n`,
      { appId: "1029210", expectedGameExe: "30XX.exe" },
    );

    expect(result).toMatchObject({
      outcome: "running_gpu",
      signals: { gameRunning: true, gpuFreedreno: true, renderNode: true },
    });
  });

  it("classifies Steam launch failure modes from logs", () => {
    expect(
      classifySteamLaunchTranscript(
        `/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap: line 5: /run/current-system/sw/bin/FEX: No such file or directory`,
        { appId: "1029210", expectedGameExe: "30XX.exe" },
      ).outcome,
    ).toBe("failed_fex_missing");

    expect(
      classifySteamLaunchTranscript(
        `Game process added : AppID 1029210\nGame process removed: AppID 1029210`,
        { appId: "1029210", expectedGameExe: "30XX.exe" },
      ).outcome,
    ).toBe("exited");

    expect(
      classifySteamLaunchTranscript(
        `GameAction [AppID 1029210] : LaunchApp waiting for user response to ShowInterstitials`,
        { appId: "1029210", expectedGameExe: "30XX.exe" },
      ).outcome,
    ).toBe("waiting_for_user");
  });

  it("verifies Steam runtime repair transcript invariants", () => {
    const transcript = `
###RUNTIME_PREP_UNIT
Environment="FEX_WRAPPER_BIN=/usr/bin/FEX"
ExecStart=/nix/store/pkg/bin/steam-guest-runtime-prep --apply
PathChanged=/var/lib/korri/steam/steamapps/common/Proton 10.0/proton
PathChanged=/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pressure-vessel-wrap
PathChanged=/var/lib/korri/steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/libexec/steam-runtime-tools-0/pv-adverb
###WRAPPER_PRESSURE_VESSEL_WRAP
#!/bin/sh
exec /usr/bin/FEX "$0.x86_64" "$@"
WRAPPER_PRESSURE_VESSEL_WRAP_BACKUP_EXISTS=yes
###WRAPPER_PV_ADVERB
#!/bin/sh
exec /usr/bin/FEX "$0.x86_64" "$@"
WRAPPER_PV_ADVERB_BACKUP_EXISTS=yes
###FREEDRENO
FREEDRENO_EMACHINE=3e 00
FREEDRENO_MACHINE=x86-64
`;

    const result = classifySteamRuntimeVerifyTranscript(transcript, {
      steamHome: "/var/lib/korri/steam",
      expectedWrapperBin: "/usr/bin/FEX",
    });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });
});

type RegisteredTool = Parameters<
  Parameters<typeof register>[0]["registerTool"]
>[0];

function libraryFetch(games: unknown[]): typeof fetch {
  return (async () =>
    Response.json({
      _tag: "Exit",
      requestId: "server-frame",
      exit: { _tag: "Success", value: { games } },
    })) as typeof fetch;
}

function registeredTool(name: string): RegisteredTool {
  const tools: RegisteredTool[] = [];
  register({ registerTool: (tool) => tools.push(tool) });
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`tool not registered: ${name}`);
  return tool;
}
