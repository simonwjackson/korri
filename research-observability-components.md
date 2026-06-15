# Research: React Observability UI Components for Developer Control Panel

## Summary

Researched React component libraries for observability UI focused on: (1) streaming log viewers with ANSI color support, virtualization, and tailing; (2) state inspectors for process/state-machine visualization; (3) real-time monitoring widgets. Key findings: `@melloware/react-logviewer` is the actively maintained fork of `react-lazylog` with WebSocket/EventSource support; `@textea/json-viewer` and `react-json-tree` are the maintained JSON tree viewers; `xterm.js` via `@xterm/xterm` + `@xterm/addon-fit` provides full terminal emulation; `@tanstack/react-virtual` is the modern successor to `react-window` for virtualization; `@statelyai/inspect` provides XState-specific visualization; and lightweight charting options include `recharts` and `react-sparklines`.

## Findings

### 1. Log Viewers (streaming, virtualized, ANSI-aware)

#### 1.1 `@melloware/react-logviewer`

**Maintained fork of the original Mozilla `react-lazylog`**

- **Repository**: https://github.com/melloware/react-logviewer
- **npm**: https://www.npmjs.com/package/@melloware/react-logviewer
- **License**: MPL-2.0
- **Maintenance**: ✅ **Actively maintained** — last release 4.0.1 (Dec 2024), regular updates through 2024
- **Features**:
  - Full ANSI color/style highlighting (bold, italic, underline)
  - Supports static text, URL fetching, WebSocket, and EventSource streaming
  - Virtualized scrolling via `react-virtualized` (10k+ lines performant)
  - Follow mode (auto-scroll to tail)
  - Line numbers, search/highlight, custom styling
  - Built-in `LazyLog` component and `ScrollFollow` HOC
- **Integration**:
  ```tsx
  import { LazyLog, ScrollFollow } from '@melloware/react-logviewer'
  
  // Static or URL
  <LazyLog url="/stream.log" stream follow />
  
  // WebSocket streaming with follow
  <ScrollFollow
    startFollowing
    render={({ follow, onScroll }) => (
      <LazyLog
        url="ws://localhost:8080/logs"
        websocket
        stream
        follow={follow}
        onScroll={onScroll}
      />
    )}
  />
  ```
- **Tailwind/shadcn integration**: Works out-of-box; accepts `className` and `style`. ANSI styles are CSS-in-JS internally but component shell can be Tailwind-wrapped. Background colors may need CSS variable overrides to match dark theme.
- **When to use**: Best all-in-one for streaming logs with ANSI color. Handles WebSocket/EventSource natively. Good for build logs, process output, SSH session replays.

#### 1.2 Original `react-lazylog` (mozilla-frontend-infra)

- **Repository**: https://github.com/mozilla-frontend-infra/react-lazylog
- **npm**: https://www.npmjs.com/package/react-lazylog
- **License**: MPL-2.0
- **Maintenance**: ⚠️ **INACTIVE** — last release 4.5.3 (2019), marked INACTIVE by maintainers
- **Status**: Superseded by `@melloware/react-logviewer`. Do not use; migrate to the actively maintained fork.

#### 1.3 `xterm.js` (+ `@xterm/xterm`)

**Full terminal emulator in the browser**

- **Repository**: https://github.com/xtermjs/xterm.js
- **npm**: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, `@xterm/addon-search`
- **License**: MIT
- **Maintenance**: ✅ **Highly active** — v5.5.0 (Jan 2025), regular monthly releases, 17k+ stars, used in VSCode, Theia, Jupyter
- **Features**:
  - Full VT100/xterm terminal emulation (ANSI, 256 color, true color)
  - Streaming text via `.write()` or `.writeln()`
  - Addons: fit-to-container, search, web-links (clickable URLs), image rendering
  - Does not virtualize lines (keeps everything in DOM buffer); performs well to ~10k lines before slowdown
  - Can attach to WebSocket or Server-Sent Events for live streaming
- **React wrapper**: No official wrapper; wrap with `useEffect` managing Terminal instance lifecycle
- **Integration**:
  ```tsx
  import { Terminal } from '@xterm/xterm'
  import { FitAddon } from '@xterm/addon-fit'
  import '@xterm/xterm/css/xterm.css'
  
  function LogTerminal({ stream }: { stream: ReadableStream<string> }) {
    const termRef = useRef<HTMLDivElement>(null)
    const termInstance = useRef<Terminal>()
    
    useEffect(() => {
      if (!termRef.current) return
      const term = new Terminal({ /* theme, font */ })
      const fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()
      termInstance.current = term
      return () => term.dispose()
    }, [])
    
    useEffect(() => {
      const reader = stream.getReader()
      ;(async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          termInstance.current?.writeln(value)
        }
      })()
    }, [stream])
    
    return <div ref={termRef} className="h-full w-full" />
  }
  ```
- **Tailwind/shadcn integration**: Container `div` can be Tailwind-styled. Terminal theming is via API options (background, foreground, cursor colors). Wrap in a shadcn Card or dialog; terminal itself has fixed CSS.
- **When to use**: When you need **full terminal fidelity** (escape codes, cursor control, interactive prompts). Overkill for simple log tailing, but ideal for SSH sessions, container `exec`, or REPL output. Does not virtualize, so finite-buffer use case.

#### 1.4 Custom virtualized log viewer with `@tanstack/react-virtual`

**DIY approach using modern virtualization**

- **Library**: https://github.com/TanStack/virtual
- **npm**: `@tanstack/react-virtual`
- **License**: MIT
- **Maintenance**: ✅ **Active** — v3.11.4 (Jan 2025), part of TanStack ecosystem, successor to `react-window`
- **Features**:
  - Virtualizes large lists (rows or columns) with dynamic sizing
  - Horizontal + vertical virtualization
  - Smooth scrolling, sticky headers, resize observer integration
  - Framework-agnostic core; first-class React support
- **Use case**: Build your own log viewer when you need custom rendering (e.g., collapsible stack traces, inline error expansion, grouped log levels, custom ANSI parsing).
- **Integration** (basic example):
  ```tsx
  import { useVirtualizer } from '@tanstack/react-virtual'
  import { parseAnsi } from 'ansi-parse' // hypothetical or use ansi-to-html
  
  function VirtualLogViewer({ lines }: { lines: string[] }) {
    const parentRef = useRef<HTMLDivElement>(null)
    const virtualizer = useVirtualizer({
      count: lines.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 20, // line height
      overscan: 10,
    })
    
    return (
      <div ref={parentRef} className="h-full overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map(item => (
            <div
              key={item.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${item.size}px`,
                transform: `translateY(${item.start}px)`,
              }}
              className="font-mono text-sm"
            >
              {renderAnsiLine(lines[item.index])}
            </div>
          ))}
        </div>
      </div>
    )
  }
  ```
- **ANSI parsing**: You'll need separate ANSI-to-React helper (e.g., `ansi-to-react`, `ansi-parse` + manual `<span>` generation).
- **Tailwind/shadcn integration**: Full control; wraps in Tailwind classes naturally. Monospace font via `font-mono`. Colors can be CSS variables.
- **When to use**: Maximum flexibility for custom log UX (filtering, grouping, rich inline widgets). More setup than `@melloware/react-logviewer`, but better for complex observability dashboards where logs are one tile among many.

#### 1.5 `react-window` (predecessor to TanStack Virtual)

- **Repository**: https://github.com/bvaughn/react-window
- **npm**: `react-window`
- **License**: MIT
- **Maintenance**: ⚠️ **Maintenance mode** — last release 1.8.10 (2023), maintainer Brian Vaughn now focuses on React core; community recommends `@tanstack/react-virtual` for new projects
- **Status**: Still works, widely used (e.g., in many log viewer implementations), but **prefer TanStack Virtual for new code**.

---

### 2. State Inspectors (devtools-style, process/state-machine visualization)

#### 2.1 `@statelyai/inspect`

**First-class XState state machine inspector**

- **Repository**: https://github.com/statelyai/inspect (part of XState monorepo)
- **npm**: `@statelyai/inspect`
- **License**: MIT
- **Maintenance**: ✅ **Active** — regular updates with XState v5 (latest Dec 2024)
- **Features**:
  - Live state machine visualization (directed graph of states/transitions)
  - Event log with timeline
  - Current state highlighting
  - Actor tree (parent/child machines)
  - Inspect multiple running machines simultaneously
  - WebSocket-based inspector server or browser-embedded inspector
- **Integration**:
  ```tsx
  import { createBrowserInspector } from '@statelyai/inspect'
  import { createActor } from 'xstate'
  import { myMachine } from './machine'
  
  const inspector = createBrowserInspector()
  const actor = createActor(myMachine, { inspect: inspector.inspect })
  actor.start()
  
  // Inspector UI auto-opens in iframe overlay
  ```
  Or embed inspector UI directly in your app:
  ```tsx
  import { Inspector } from '@statelyai/inspect/react'
  
  <Inspector actor={actor} />
  ```
- **Tailwind/shadcn integration**: Inspector UI is opinionated (dark theme, graph layout). For embedded `<Inspector>` component, wrap in a shadcn Dialog or Sheet. Graph itself is SVG; limited styling control. Best used as dev overlay or dedicated panel.
- **When to use**: When using XState and need real-time visibility into state machine execution. Essential for debugging complex workflows (e.g., session lifecycle, launch orchestration, multi-step wizards).

#### 2.2 `@textea/json-viewer`

**Modern, actively maintained JSON tree viewer**

- **Repository**: https://github.com/TextEA/json-viewer
- **npm**: `@textea/json-viewer`
- **License**: MIT
- **Maintenance**: ✅ **Active** — v3.5.4 (Dec 2024), monthly releases
- **Features**:
  - Collapsible JSON tree with syntax highlighting
  - Copy-to-clipboard for nodes
  - Editable mode (add/edit/delete keys inline)
  - Custom type renderers (e.g., render dates, URLs as links)
  - Theme support (light/dark, custom colors)
  - Search/filter by key or value
  - Large object/array performance (lazy rendering)
- **Integration**:
  ```tsx
  import { JsonViewer } from '@textea/json-viewer'
  
  <JsonViewer
    value={stateSnapshot}
    theme="dark"
    defaultInspectDepth={2}
    displayDataTypes={false}
    rootName="sessionState"
  />
  ```
- **Tailwind/shadcn integration**: Accepts inline style overrides; theming via props. Wrap in shadcn Card or Accordion. Colors can match Tailwind theme if you define custom theme object matching your CSS variables.
- **When to use**: Inspecting live state snapshots (Effect atoms, RPC payloads, config dumps). Best for hierarchical data where you want expand/collapse and copy-value workflows. Modern replacement for `react-json-view`.

#### 2.3 `react-json-view` (mac-s-g)

- **Repository**: https://github.com/mac-s-g/react-json-view
- **npm**: `react-json-view`
- **License**: MIT
- **Maintenance**: ⚠️ **Low activity** — last release 1.21.3 (2021), sporadic updates, still widely used but consider `@textea/json-viewer` for new projects
- **Features**: Similar to `@textea/json-viewer` (collapsible tree, edit mode, theming), but older API and fewer customization options.
- **Status**: Still functional, but `@textea/json-viewer` is more actively maintained with better TypeScript support and modern React patterns.

#### 2.4 `react-json-tree` (redux-devtools)

- **Repository**: https://github.com/reduxjs/redux-devtools/tree/main/packages/react-json-tree
- **npm**: `react-json-tree`
- **License**: MIT
- **Maintenance**: ⚠️ **Stable, infrequent updates** — last release 0.18.0 (2023), part of Redux DevTools; not abandoned but not actively enhanced
- **Features**:
  - Minimalist JSON tree (no built-in edit, search, or copy)
  - Very lightweight
  - Used internally by Redux DevTools
  - Theme via base16 color schemes
- **Tailwind/shadcn integration**: Minimal styling surface; wrap container. Pairs well with a monospace Tailwind font.
- **When to use**: When you want **read-only** JSON inspection with minimal bundle size. For editable or feature-rich inspector, prefer `@textea/json-viewer`.

#### 2.5 Redux DevTools (for Redux-like state)

- **Repository**: https://github.com/reduxjs/redux-devtools
- **npm**: `@redux-devtools/extension`
- **License**: MIT
- **Maintenance**: ✅ **Active** — ongoing updates, part of Redux ecosystem
- **Features**:
  - Time-travel debugging
  - Action log with diff view
  - State snapshots at each action
  - Browser extension (Chrome, Firefox) or embedded monitor components
- **Integration**: Primarily used with Redux. For Effect-based apps, you'd need to adapt Effect atoms/layers to emit Redux-style actions for DevTools to consume (non-trivial).
- **When to use**: If your state model is Redux-like or you're already using Redux. For Effect-based state (atoms, services, layers), prefer Effect-native inspection or custom JSON viewers.

---

### 3. Real-Time Monitoring (sparklines, gauges, live metrics)

#### 3.1 `recharts`

**Declarative charting library built on React and D3**

- **Repository**: https://github.com/recharts/recharts
- **npm**: `recharts`
- **License**: MIT
- **Maintenance**: ✅ **Active** — v2.15.1 (Jan 2025), 25k+ stars, regular updates
- **Features**:
  - Line, bar, area, pie, scatter, radar charts
  - Responsive by default
  - Composable API (mix chart types)
  - Animations, tooltips, legends
  - No direct "sparkline" component, but `<LineChart>` with hidden axes/grid = sparkline
- **Integration**:
  ```tsx
  import { LineChart, Line, ResponsiveContainer } from 'recharts'
  
  function CPUSparkline({ data }: { data: { time: number; cpu: number }[] }) {
    return (
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="cpu"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    )
  }
  ```
- **Tailwind/shadcn integration**: Wrap in any container. Use Tailwind HSL CSS variables for stroke colors (`hsl(var(--primary))`). Height via Tailwind classes on wrapper or `ResponsiveContainer`.
- **When to use**: General-purpose charts. Good for metric dashboards. Slightly heavier than pure sparkline libs, but very flexible.

#### 3.2 `react-sparklines`

**Lightweight sparkline-specific library**

- **Repository**: https://github.com/borisyankov/react-sparklines
- **npm**: `react-sparklines`
- **License**: MIT
- **Maintenance**: ⚠️ **Inactive** — last release 1.7.0 (2017), no updates in 7+ years
- **Features**:
  - Tiny bundle (~10KB)
  - Line, bar, and area sparklines
  - Simple API: `<Sparklines data={[...]} />`
  - Reference line, spot (highlight value)
- **Status**: Still works but unmaintained. Prefer `recharts` (minimal config) or `visx` (modern composable) for new projects.

#### 3.3 `visx` (Airbnb visualization toolkit)

**Low-level React + D3 visualization primitives**

- **Repository**: https://github.com/airbnb/visx
- **npm**: `@visx/visx` (or individual `@visx/shape`, `@visx/scale`, etc.)
- **License**: MIT
- **Maintenance**: ✅ **Active** — v3.12.0 (Jan 2025), maintained by Airbnb
- **Features**:
  - Composable primitives (scales, axes, shapes, annotations)
  - More control than `recharts`, less boilerplate than raw D3
  - Responsive, TypeScript-first
  - Build custom sparklines, gauges, heatmaps
- **Integration** (sparkline example):
  ```tsx
  import { LinePath } from '@visx/shape'
  import { scaleLinear } from '@visx/scale'
  
  function Sparkline({ data, width = 100, height = 30 }) {
    const xScale = scaleLinear({ domain: [0, data.length - 1], range: [0, width] })
    const yScale = scaleLinear({ domain: [Math.min(...data), Math.max(...data)], range: [height, 0] })
    
    return (
      <svg width={width} height={height}>
        <LinePath
          data={data}
          x={(d, i) => xScale(i)}
          y={d => yScale(d)}
          stroke="hsl(var(--primary))"
          strokeWidth={2}
        />
      </svg>
    )
  }
  ```
- **Tailwind/shadcn integration**: Full control over SVG. Use Tailwind colors via CSS variables in `stroke`/`fill`. Wrap SVG in Tailwind-styled containers.
- **When to use**: Custom visualizations where `recharts` is too opinionated. Ideal for bespoke observability UIs (e.g., flame graphs, latency heatmaps, custom session timelines).

#### 3.4 Numeric displays / gauges (custom components)

For **real-time value readouts** (CPU %, memory, FPS, latency), most projects build simple custom components:

- **Numeric badge**:
  ```tsx
  function MetricBadge({ label, value, unit, status }) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn(
          "text-lg font-semibold tabular-nums",
          status === "warn" && "text-yellow-500",
          status === "error" && "text-destructive"
        )}>
          {value}{unit}
        </span>
      </div>
    )
  }
  ```
  
- **Circular gauge** (CSS-based or SVG):  
  Libraries like `react-gauge-chart` exist but are often overkill. For simple progress arcs, use shadcn `Progress` component styled as radial, or an SVG `<circle>` with `stroke-dasharray`.

- **Live-updating pattern**:
  ```tsx
  function LiveMetric({ atom }) {
    const value = useAtomValue(atom) // Effect atom piping real-time data
    return <MetricBadge label="RSS" value={(value / 1e6).toFixed(1)} unit="MB" />
  }
  ```

**When to use**: For simple numeric/percentage readouts. Combine with sparklines for trend + current-value UX. No heavy library needed; use Tailwind utility classes and CSS variables.

---

## Integration Summary

All reviewed components integrate cleanly with a **Tailwind + shadcn + Effect atoms** stack:

- **Log viewers**: `@melloware/react-logviewer` works out-of-box; pass ANSI logs via `text`, `url`, or `websocket` prop. Wrap in shadcn Card/Dialog. For terminal fidelity, use `xterm.js` directly with manual lifecycle. For custom layouts, build with `@tanstack/react-virtual` + ANSI parser.
  
- **State inspectors**: `@textea/json-viewer` drops in; pass Effect atom snapshots as `value` prop. Wrap in shadcn Accordion or collapsible Card. For XState machines, `@statelyai/inspect` provides graph visualization; embed in dedicated panel or dev overlay.
  
- **Real-time metrics**: `recharts` for sparklines and small charts; use Tailwind HSL variables for theming. For gauges/badges, custom components with Tailwind classes and `tabular-nums` font variant. Wire to Effect atoms for live updates.

**General pattern**:
```tsx
// Log viewer in Card
<Card>
  <CardHeader><CardTitle>Build Log</CardTitle></CardHeader>
  <CardContent className="p-0">
    <ScrollFollow
      startFollowing
      render={({ follow, onScroll }) => (
        <LazyLog
          url="ws://localhost:8080/build-log"
          websocket
          stream
          follow={follow}
          onScroll={onScroll}
          height={400}
        />
      )}
    />
  </CardContent>
</Card>

// State inspector in Sheet
<Sheet>
  <SheetTrigger>Inspect State</SheetTrigger>
  <SheetContent className="w-[600px]">
    <JsonViewer value={sessionSnapshot} theme="dark" rootName="session" />
  </SheetContent>
</Sheet>

// Live metrics grid
<div className="grid grid-cols-3 gap-4">
  {metrics.map(m => (
    <Card key={m.key}>
      <CardContent className="pt-6">
        <LiveMetric atom={m.atom} label={m.label} />
        <ResponsiveContainer width="100%" height={40}>
          <LineChart data={m.history}>
            <Line dataKey="value" stroke="hsl(var(--primary))" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  ))}
</div>
```

---

## Sources

### Kept

- **@melloware/react-logviewer** (https://github.com/melloware/react-logviewer, https://www.npmjs.com/package/@melloware/react-logviewer) — Actively maintained ANSI log viewer with WebSocket/EventSource; MPL-2.0; last release Dec 2024. Primary recommendation for streaming logs.

- **xterm.js** (https://github.com/xtermjs/xterm.js, https://www.npmjs.com/package/@xterm/xterm) — Full terminal emulator, MIT license, highly active (Jan 2025), used in VSCode. Best for terminal-fidelity log/process output.

- **@tanstack/react-virtual** (https://github.com/TanStack/virtual, https://www.npmjs.com/package/@tanstack/react-virtual) — Modern virtualization library, MIT, active (Jan 2025), successor to `react-window`. DIY log viewer foundation.

- **@textea/json-viewer** (https://github.com/TextEA/json-viewer, https://www.npmjs.com/package/@textea/json-viewer) — Modern JSON tree inspector, MIT, active (Dec 2024), editable mode, theming. Recommended for state inspection.

- **@statelyai/inspect** (https://github.com/statelyai/inspect, https://www.npmjs.com/package/@statelyai/inspect) — XState state machine inspector, MIT, active (Dec 2024). Essential for XState-based workflows.

- **recharts** (https://github.com/recharts/recharts, https://www.npmjs.com/package/recharts) — Declarative React charts, MIT, active (Jan 2025), 25k+ stars. General-purpose charting, good for sparklines and dashboards.

- **visx** (https://github.com/airbnb/visx, https://www.npmjs.com/package/@visx/visx) — Low-level D3 + React primitives, MIT, active (Jan 2025), Airbnb-maintained. For custom visualizations.

- **react-json-tree** (https://github.com/reduxjs/redux-devtools/tree/main/packages/react-json-tree, https://www.npmjs.com/package/react-json-tree) — Lightweight read-only JSON tree, MIT, stable (2023), part of Redux DevTools. Minimal alternative to `@textea/json-viewer`.

### Dropped

- **react-lazylog** (mozilla-frontend-infra) — Marked INACTIVE by maintainers, last update 2019. Superseded by `@melloware/react-logviewer`.

- **react-window** — Maintenance mode (last update 2023), community migrating to `@tanstack/react-virtual`. Still works but not recommended for new projects.

- **react-json-view** (mac-s-g) — Low activity since 2021. `@textea/json-viewer` is more actively maintained with better TypeScript and modern React support.

- **react-sparklines** — Unmaintained since 2017. `recharts` or `visx` provide equivalent functionality with active maintenance.

---

## Gaps

1. **ANSI parsing library recommendation**: Research mentions ANSI parsing helpers (`ansi-to-react`, `ansi-parse`, `ansi-to-html`) for custom log viewers but did not evaluate specific maintained packages. If building a custom log viewer with `@tanstack/react-virtual`, recommend researching: `ansi-to-react` (https://github.com/nteract/ansi-to-react), `ansi-to-html` (https://github.com/rburns/ansi-to-html), or `anser` (https://github.com/IonicaBizau/anser).

2. **Gauge/radial progress components**: No specific maintained React gauge libraries were evaluated. For circular gauges showing percentage/capacity, explore: `react-gauge-component` (https://github.com/antonioliz/react-gauge-component, MIT, active 2024) or build custom with shadcn `Progress` component + Tailwind/CSS tricks for radial styling.

3. **Redux DevTools for Effect atoms**: Integration pattern for Effect-based state with Redux DevTools was not detailed. If Redux DevTools is desired for Effect apps, research Effect atom -> Redux action adapters or consider Effect-native dev tooling (e.g., Effect Inspector if/when officially released).

4. **Flame graphs / trace visualizations**: For observability beyond logs/state (e.g., execution traces, span timelines, flame graphs), evaluate: `speedscope` (https://github.com/jlfwong/speedscope, MIT, active), `flamebearer` (https://github.com/mapbox/flamebearer), or build custom with `visx` + trace data model.

5. **WebSocket/EventSource React hooks**: All streaming log examples assume manual WebSocket/EventSource setup. For production, consider: `react-use` WebSocket hooks, `@tanstack/react-query` with streaming adapters, or Effect-native stream integration. Not covered in this research.

---

## Recommended Stack for Korri Observability Theme

**Log viewer**: `@melloware/react-logviewer` for ANSI streaming logs (build logs, Steam wrapper logs, sessiond output). Wrap in shadcn Card or Dialog. For terminal-like fidelity (SSH, REPL), add `xterm.js` in a separate component.

**State inspector**: `@textea/json-viewer` for live state snapshots (Effect atoms, RPC payloads, config dumps). Embed in shadcn Sheet or Accordion. If using XState for session lifecycle, include `@statelyai/inspect` for state machine graph visualization.

**Real-time metrics**: Custom badge components for numeric readouts (CPU, RSS, FPS). `recharts` `<LineChart>` for sparklines. Wire to Effect atoms for live updates. Use Tailwind `tabular-nums` and HSL CSS variables for theming.

**Virtualization**: If building custom log layouts (e.g., collapsible stack traces, grouped log levels), use `@tanstack/react-virtual` + a maintained ANSI parser.

**All integrate cleanly with Tailwind + shadcn**: Wrap components in Cards/Dialogs/Sheets, use Tailwind spacing/colors, and CSS variables (`hsl(var(--primary))`) for theming.
