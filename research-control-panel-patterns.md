# Research: Dense Control Panel UI Patterns

## Summary

Dense, high-observability control panels prioritize **information density over simplicity**, **persistent visibility over progressive disclosure**, and **spatial consistency over dynamic layout**. The core principle: operators need to see all critical state simultaneously without hunting through tabs or hovering for tooltips. Unlike consumer UIs that hide complexity, control panels make complexity observable, scannable, and spatially stable.

## Core Design Principles

### 1. **Persistent Visibility — No Hidden States**

Consumer UIs hide interim states and reduce cognitive load through progressive disclosure. Observability dashboards do the opposite: **all meaningful state is always visible**.

- **Always-on telemetry strips**: Status indicators, counters, timestamps, and health badges remain visible regardless of focus state. [Dashboard Design Patterns](https://dashboarddesignpatterns.github.io/patterns.html)
- **No hover-to-reveal**: Critical data never hides behind tooltips or popovers. Hover may enrich, but never gate.
- **Persistent log streams**: Logs scroll in a dedicated pane that never collapses or gets replaced by other content.
- **Side-by-side state + logs**: The user watches both state transitions and log evidence simultaneously, not sequentially.

**Rationale**: Operators debug by correlating events across multiple signals. If logs disappear when you switch to the network panel, correlation becomes memory work instead of visual work.

### 2. **Information Density Over Whitespace**

High information density is not clutter—it's **intentional data packing calibrated to expert users**.

- **3:1 primary-to-secondary density ratio**: The critical zone should feel dense; the secondary zone should feel sparse. [Setproduct Dashboard Design](https://www.setproduct.com/blog/effective-dashboard-design-principles)
- **Tight gutters**: 4–8px between related widgets, not 16–24px consumer spacing.
- **Compact type scales**: Body text sits at small-to-medium steps (12–14px equivalent), not the mid-point of a consumer scale.
- **Monospace for data**: Log lines, timestamps, hex values, process IDs, and session identifiers use monospace fonts for scannability and vertical rhythm. Variable-width fonts make columnar scanning harder.
- **Utilitarian color**: Status colors (red/amber/green, blue for info) carry semantic weight. Decorative gradients and brand accent colors are absent or minimal.

**Rationale**: Expert operators can parse denser layouts faster than novices. The skill floor is high; the skill ceiling is higher. [NN/g: Utilize Available Screen Space](https://www.nngroup.com/articles/utilize-available-screen-space/)

### 3. **Spatial Consistency and Grouping**

Dense layouts are readable when **spatial zones are consistent and visually grouped**.

- **Gestalt grouping**: Use dividers, borders, shaded background regions, or consistent whitespace to group related widgets. [Reddit: High Information Density Design](https://www.reddit.com/r/UXDesign/comments/1ci084x/designing_for_interfaces_with_high_information/)
- **Fixed layout zones**: The log pane stays bottom or right; the status strip stays top; the graph grid stays center. Zones do not swap positions between sessions or resize unpredictably.
- **F/Z scan optimization**: Most critical data in the top-left and center. [GammaUX: Dashboard Design](https://www.gammaux.com/en/blog/6-ux-principles-for-effective-dashboard-design/)
- **Primary KPI strip**: 4–6 tile KPIs at the top with 8–12px gutters, not scattered cards. [Setproduct](https://www.setproduct.com/blog/effective-dashboard-design-principles)

**Rationale**: Consistency turns spatial memory into navigation. The operator knows where to look without reading labels.

### 4. **Real-Time, Live-Updating by Default**

Observability dashboards **stream updates**, not poll on demand.

- **Live by default**: Metrics, logs, and trace spans update as events arrive, not when the user clicks Refresh.
- **Visible update cadence**: A small "Last updated: 2s ago" indicator or a subtle pulse/fade animation when data refreshes.
- **Streaming log tails**: New log lines append at the bottom with auto-scroll (with a "scroll lock" escape hatch when the user scrolls up).
- **No loading spinners for updates**: The first load may show a spinner, but subsequent updates appear inline without blanking the view.

**Rationale**: Operators watch state changes over time. A static snapshot is a screenshot, not a control panel.

### 5. **Status Color Semantics Are Universal**

Color is functional, not decorative.

- **Red = critical/error**: Down, failed, exception, out-of-bounds.
- **Amber/yellow = warning/degraded**: High latency, approaching threshold, retrying.
- **Green = healthy/success**: Normal operation, success, within bounds.
- **Blue/cyan = info/neutral**: Non-critical metadata, cold state, identity markers.
- **Gray = disabled/unknown/stale**: Unavailable, not applicable, data missing.

**Avoid**:
- Decorative gradients in status indicators.
- Non-semantic brand colors (e.g., purple for "premium") in operational state.
- Color as the only signal—always pair with text or iconography for accessibility.

**Rationale**: Operators glance at a wall of panels and immediately identify problems by color before reading a single label. [Grafana: Theme and Color](https://www.groundcover.com/learn/observability/grafana-dashboards)

### 6. **Log and State Are Co-Equal**

Control panels treat **logs as first-class telemetry**, not secondary debug output.

- **Dedicated log pane**: A persistent split view (typically bottom 30–40% or right 30–40%) for a live log stream.
- **Syntax highlighting for log levels**: ERROR in red, WARN in amber, INFO in muted blue/gray.
- **Inline log filtering**: A compact filter bar above the log pane (keywords, level, timestamp range) that filters in place without hiding the pane.
- **Correlation markers**: Clicking a state transition or graph spike highlights corresponding log lines via shared session ID, trace ID, or timestamp.

**Rationale**: "Show me the logs" is the first debugging question. If logs are hidden behind a modal or a separate tab, correlation becomes a memory game.

### 7. **Monospace Typography for Data**

Variable-width fonts are for prose; monospace is for data.

- **Timestamps**: `2026-06-14T18:42:13.827Z` stays monospace for vertical alignment.
- **IDs and UUIDs**: Session IDs, trace IDs, hex values, and checksums stay monospace.
- **Log lines**: The entire log stream uses monospace for consistent column alignment.
- **Numeric tables**: Tabular data (latency, throughput, counts) aligns better in monospace.

**Exception**: Labels, headings, and prose explanations stay in a clean sans-serif (e.g., Inter, Roboto, SF Pro).

**Rationale**: Monospace makes columnar scanning effortless. It's why every terminal, IDE, and debugger defaults to it.

---

## Real-World Reference Designs

### Grafana (Observability Standard)

- **What it is**: The de facto standard for metrics dashboards in DevOps and SRE contexts.
- **What to study**:
  - Panel-grid layouts: 12-column responsive grid with snap-to-grid precision.
  - Status bar at the top: time range, refresh rate, variables, and dashboard state always visible.
  - Panel types: time-series graphs, stat panels (big number + trend), tables, logs, traces—all colocated.
  - Dark theme as default: reduces eye strain during long monitoring sessions.
- **Link**: [grafana.com](https://grafana.com/) | [Grafana Play (live demo)](https://play.grafana.org/)
- **Why it matters**: Grafana's design language is the observability industry's shared vocabulary. Any control panel that deviates from Grafana conventions must justify why.

### Chrome DevTools / Firefox Developer Tools

- **What it is**: The browser's built-in developer panel—the most-used control panel in web development.
- **What to study**:
  - Split-pane layouts: Elements/Console/Network/Performance tabs with persistent bottom console.
  - Syntax-highlighted logs with collapsible stack traces.
  - Inline filter bars: Filter console messages by keyword, level, or source without closing the panel.
  - Monospace everywhere: Console, Network headers, JSON responses, and DOM tree.
  - Color-coded log levels: `console.error()` in red, `console.warn()` in amber, `console.log()` in default.
- **Link**: Open Chrome/Firefox DevTools and study the layout.
- **Why it matters**: This is the baseline control panel every developer already knows. If your panel is harder to use than DevTools, you've failed.

### Netdata (Real-Time System Monitoring)

- **What it is**: An open-source, real-time performance monitoring dashboard for servers.
- **What to study**:
  - Live-updating charts: Sub-second refresh with streaming WebSocket updates.
  - Tiled metric grid: Dozens of small charts on one screen, all updating live.
  - Persistent overview bar: System health at a glance (CPU, RAM, disk, network) always pinned at the top.
  - No loading states: Data streams in; the UI never blanks during updates.
- **Link**: [netdata.cloud](https://www.netdata.cloud/) | [Netdata Demo](https://app.netdata.cloud/spaces/netdata-demo)
- **Why it matters**: Netdata proves that live-updating dense dashboards can be fast and readable without sacrificing observability.

### NASA Mission Control (ISS Flight Control Room)

- **What it is**: The physical control room layout for ISS operations, translated to digital screens.
- **What to study**:
  - Wall-of-screens metaphor: Multiple fixed-layout panels, each dedicated to a subsystem (power, thermal, comms, trajectory).
  - Red/amber/green status indicators everywhere: At-a-glance health without reading labels.
  - Persistent telemetry strips: Always-visible countdowns, timestamps, orbital parameters.
  - No dynamic layouts: Operators know where to look by muscle memory, not by reading labels.
- **References**:
  - [NASA ISS Mission Control Interface](https://www.nasa.gov/mission-control/)
  - Search YouTube: "NASA mission control live stream" for real operational footage.
- **Why it matters**: This is the extreme case—life-critical systems where missing a state change kills people. The design principles still apply to non-critical control panels.

### Aircraft Glass Cockpits (Boeing 787, Airbus A350)

- **What it is**: The digital Primary Flight Display (PFD) and Multi-Function Display (MFD) in modern airliners.
- **What to study**:
  - Information hierarchy: Altitude/airspeed/heading dominate the center; secondary data (fuel, engine, system status) stays in fixed peripheral zones.
  - Color-coded alerts: Red = immediate action, amber = caution, green = normal, white = advisory.
  - Fixed spatial layout: The attitude indicator is always center; the altimeter is always right; the airspeed indicator is always left.
  - Monochrome data with strategic color: Most text is white/cyan; only status indicators use red/amber/green.
- **References**:
  - [Boeing 787 Cockpit Overview](https://www.boeing.com/commercial/787)
  - Search YouTube: "cockpit tour 787" or "Airbus A350 cockpit" for real footage.
- **Why it matters**: Glass cockpits are the gold standard for dense, life-critical information hierarchy. If it works at 35,000 feet, it works in a developer dashboard.

### Audio DAW Control Surfaces (Pro Tools, Ableton, Bitwig)

- **What it is**: Digital audio workstation mixer panels—dozens of channels, each with faders, meters, effects, routing.
- **What to study**:
  - Vertical channel strips: Every channel is a fixed-width column with a consistent layout (fader, pan, mute, solo, VU meter, effects slots).
  - Persistent meters: Audio level meters update in real time (60fps+) with peak hold indicators.
  - Color-coded tracks: User-assignable track colors for visual grouping (drums, vocals, synths).
  - Monospace labels for technical data: dB levels, timecodes, sample rates.
- **References**:
  - [Pro Tools Interface](https://www.avid.com/pro-tools)
  - [Ableton Live Interface](https://www.ableton.com/en/live/)
  - [Bitwig Studio](https://www.bitwig.com/)
- **Why it matters**: DAWs prove that dense, real-time control panels can be both information-rich and musically expressive. The channel-strip pattern is directly applicable to session/stream monitoring.

### Prometheus + Grafana Dashboards (Industry Examples)

- **What it is**: Real-world Prometheus metrics fed into Grafana dashboards.
- **What to study**:
  - Row-based grouping: Panels are grouped into collapsible rows (e.g., "HTTP Requests", "Database", "Queues").
  - Time-series graphs with shared X-axis: Multiple metrics stacked vertically, all sharing the same time range for visual correlation.
  - Stat panels for current values: Big number + trend arrow + sparkline.
  - Table panels for enumerated data: Active connections, slow queries, error logs.
- **References**:
  - [Awesome Prometheus Alerts (GitHub)](https://github.com/samber/awesome-prometheus-alerts)
  - [Grafana Dashboard Gallery](https://grafana.com/grafana/dashboards/)
  - Example: [Node Exporter Dashboard](https://grafana.com/grafana/dashboards/1860-node-exporter-full/)
- **Why it matters**: These are production dashboards used by real SRE teams. Study what they prioritize and how they group data.

### Kubernetes Dashboard (Official + Lens IDE)

- **What it is**: The official Kubernetes web UI and the Lens desktop IDE for Kubernetes management.
- **What to study**:
  - Resource list views: Pods, services, deployments in sortable tables with status badges.
  - Live pod logs: Streaming log tail with syntax highlighting, inline filtering, and container selector.
  - YAML diff view: Side-by-side comparison of current vs. desired state.
  - Status pill semantics: Running (green), Pending (blue), Failed (red), CrashLoopBackOff (red, blinking).
- **References**:
  - [Kubernetes Dashboard](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/)
  - [Lens IDE](https://k8slens.dev/)
- **Why it matters**: Kubernetes dashboards are the control panel for distributed systems. Their patterns (status pills, log tails, resource tables) are directly applicable to session/device control.

### OpenObserve / Loki / Elasticsearch Kibana (Log Aggregation UIs)

- **What it is**: Log search and aggregation dashboards.
- **What to study**:
  - Log stream with inline filtering: Keyword search, level filter, timestamp range—all without leaving the log view.
  - Syntax highlighting for structured logs: JSON logs with collapsible fields.
  - Field extraction UI: Click a log field to filter or aggregate by that field.
  - Histogram timelines: A time-series histogram above the log stream showing log volume over time.
- **References**:
  - [OpenObserve](https://openobserve.ai/)
  - [Grafana Loki](https://grafana.com/oss/loki/)
  - [Elastic Kibana](https://www.elastic.co/kibana)
- **Why it matters**: These dashboards are built for log-first debugging. Study how they make logs scannable and correlatable.

### React DevTools / Redux DevTools

- **What it is**: Browser extensions for debugging React and Redux state.
- **What to study**:
  - Component tree with live state: A collapsible tree view showing component hierarchy and current props/state.
  - Time-travel debugging: A timeline of state transitions with jump-to-any-point replay.
  - Side-by-side diff view: Shows what changed between two states.
  - Monospace for object keys: State objects are rendered in monospace for scannability.
- **References**:
  - [React DevTools](https://react.dev/learn/react-developer-tools)
  - [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools)
- **Why it matters**: These are the state-debugging panels every React developer already uses. Replicate their patterns for session-state observability.

### PlotJuggler (Robotics Telemetry Visualization)

- **What it is**: An open-source time-series plotter used in robotics for real-time telemetry visualization.
- **What to study**:
  - Multi-graph layout: Drag-and-drop graph composition with synchronized time cursors.
  - Streaming data: Live-updating plots over WebSocket or ROS topics.
  - Persistent graph layouts: Save and reload graph configurations for recurring debug sessions.
  - Zooming and panning: Operators can zoom into a time window without losing the overall layout.
- **Link**: [PlotJuggler GitHub](https://github.com/facontidavide/PlotJuggler)
- **Why it matters**: PlotJuggler proves that dense, multi-signal telemetry can be interactive and live without sacrificing performance.

---

## Observability-First vs. Product UI Differences

| Aspect | Product UI | Observability Dashboard |
|--------|-----------|------------------------|
| **Primary goal** | Guide novices; hide complexity | Surface complexity; enable experts |
| **Information density** | Low; whitespace and progressive disclosure | High; persistent visibility |
| **State visibility** | Interim states hidden (loading, retrying) | All states always visible |
| **Layout stability** | Dynamic; adapts to content | Static zones; spatial consistency |
| **Log visibility** | Logs hidden or in a separate view | Logs always visible in split pane |
| **Update model** | On-demand (click to refresh) | Live streaming by default |
| **Typography** | Variable-width sans-serif | Monospace for data, sans-serif for labels |
| **Color semantics** | Brand colors, decorative gradients | Functional status colors (red/amber/green) |
| **Target user** | Casual, occasional, novice | Expert, frequent, operator |

---

## Concrete Layout Patterns for a React Developer Theme

### Recommended Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Top Bar: Session status, active game, uptime, health indicators │ 
│ [Session: sonic-mania-4a8c | Uptime: 3m42s | Status: ●Running]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│                     Main Content Area                             │
│                                                                   │
│  ┌──────────────────────┬──────────────────────┐                 │
│  │ Stream Metrics       │ Device State         │                 │
│  │ FPS: 60 | Lat: 12ms  │ Temp: 68°C          │                 │
│  └──────────────────────┴──────────────────────┘                 │
│                                                                   │
│  ┌────────────────────────────────────────────┐                  │
│  │ State Timeline (Grafana-style time-series) │                  │
│  │ [Launch → Init → Running → Ready]          │                  │
│  └────────────────────────────────────────────┘                  │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Bottom Log Pane (30% height, resizable)                          │
│ ┌───────────────────────────────────────────────────────────────┐│
│ │ Filter: [keyword] [level: all ▾] [last 5m ▾]                 ││
│ ├───────────────────────────────────────────────────────────────┤│
│ │ 18:42:13.827 INFO  sessiond started session=sonic-mania-4a8c ││
│ │ 18:42:14.103 DEBUG gamescope resolution=1920x1080             ││
│ │ 18:42:14.251 WARN  steam overlay disabled                     ││
│ │ 18:42:15.602 ERROR failed to bind port 47989 (retrying)       ││
│ └───────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Layout Zones

1. **Top Status Bar** (persistent, 48–64px height):
   - Current session ID, active game/app name.
   - Uptime counter (live-updating).
   - Health indicator: ● Running (green), ● Degraded (amber), ● Failed (red).
   - Optional: FPS, latency, temperature—the "at-a-glance" strip.

2. **Main Content Area** (60–70% height):
   - **Metric Tiles**: 2×2 or 3×2 grid of stat panels (current FPS, latency, GPU temp, CPU %).
   - **State Timeline**: Horizontal timeline showing session lifecycle (Launch → Init → Running → Ready → Stopped).
   - **Optional Graphs**: Time-series charts for FPS, latency, or resource usage over the last 5–10 minutes.

3. **Bottom Log Pane** (30–40% height, resizable):
   - Live log stream with syntax-highlighted log levels.
   - Inline filter bar: keyword search, level dropdown, time range.
   - Auto-scroll with scroll-lock escape hatch.
   - Monospace font for log lines.

### Component Composition Strategy

- **`<DeveloperControlPanelRoot>`**: Owns state and renders the 3-zone layout.
- **`<TopStatusBar>`**: Reads session state and displays status pills, uptime, and key metrics.
- **`<MetricGrid>`**: Renders 2×2 or 3×2 stat tiles (FPS, latency, temp, CPU).
- **`<StateTimeline>`**: Renders the session lifecycle timeline (Launch → Init → Running → Ready).
- **`<LogStreamPane>`**: Renders the live log stream with inline filter bar and syntax highlighting.
- **`<LogLine>`**: A single log line with timestamp, level badge, and message (monospace).

No Storybook pages import live RPC hooks. All components receive fixture data or configured behavior (e.g., `createInMemoryLogStream({ level: "error", count: 100 })`).

---

## Tactical Implementation Principles

### Color Palette (Functional, Not Decorative)

```css
--status-critical: hsl(0 84% 60%);      /* Red */
--status-warning: hsl(38 92% 50%);      /* Amber */
--status-success: hsl(142 76% 36%);     /* Green */
--status-info: hsl(199 89% 48%);        /* Blue */
--status-neutral: hsl(214 10% 50%);     /* Gray */

--log-error: var(--status-critical);
--log-warn: var(--status-warning);
--log-info: var(--status-info);
--log-debug: var(--status-neutral);

--bg-panel: hsl(220 13% 13%);           /* Dark panel background */
--bg-pane: hsl(220 13% 10%);            /* Darker for log pane */
--border-subtle: hsl(214 10% 20%);      /* Panel dividers */
--text-primary: hsl(0 0% 95%);          /* High-contrast white */
--text-secondary: hsl(214 10% 70%);     /* Muted gray */
```

### Typography Stack

```css
--font-sans: "Inter", "SF Pro", "Roboto", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", "SF Mono", "Consolas", monospace;

/* Type scale (tight for control panels) */
--text-xs: clamp(0.6875rem, 0.65rem + 0.25cqi, 0.75rem);      /* 11–12px */
--text-sm: clamp(0.75rem, 0.7rem + 0.25cqi, 0.875rem);        /* 12–14px */
--text-base: clamp(0.875rem, 0.8rem + 0.35cqi, 1rem);         /* 14–16px */
--text-lg: clamp(1rem, 0.95rem + 0.5cqi, 1.125rem);           /* 16–18px */
```

### Spacing Scale (Tighter Than Consumer UIs)

```css
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */

/* Use space-2 (8px) for gutters between metric tiles */
/* Use space-3 (12px) for padding inside panels */
/* Use space-4 (16px) for spacing between major zones */
```

### Live Update Strategy

- Use `@effect/atom-react` for reactive state.
- Stream log lines over WebSocket or SSE into a circular buffer (e.g., last 500 lines).
- Update metric tiles every 500ms–1s (not every frame—wasteful for non-critical metrics).
- Use `requestAnimationFrame` for FPS or latency meters if you need sub-second updates.
- Render log lines virtualized (e.g., `react-window` or `@tanstack/react-virtual`) if you expect thousands of lines.

---

## Sources

### Kept

- **Dashboard Design Patterns** (https://dashboarddesignpatterns.github.io/patterns.html) — Grouped layouts, whitespace, and explicit visual grouping principles for dashboards.
- **Setproduct: Dashboard Design Principles** (https://www.setproduct.com/blog/effective-dashboard-design-principles) — 3:1 density ratio, primary KPI strip conventions, gutter spacing.
- **NN/g: Utilize Available Screen Space** (https://www.nngroup.com/articles/utilize-available-screen-space/) — Higher density = less navigation, higher scannability.
- **GammaUX: Dashboard Design** (https://www.gammaux.com/en/blog/6-ux-principles-for-effective-dashboard-design/) — F/Z scan patterns, top-left/center priority zones.
- **Reddit: High Information Density Design** (https://www.reddit.com/r/UXDesign/comments/1ci084x/designing_for_interfaces_with_high_information/) — Gestalt principles, grouping by proximity and correlation.
- **Envy Labs: Interface Information Density** (https://envylabs.com/insights/interface-information-density-best-practices) — Density must match audience expertise; form follows function.
- **LogRocket: Balancing Information Density** (https://blog.logrocket.com/balancing-information-density-in-web-development/) — Context vs. simplicity; static and interactive content density.
- **Grafana** (https://grafana.com/) — Industry-standard observability dashboard; panel grids, live updates, dark theme defaults.
- **Netdata** (https://www.netdata.cloud/) — Real-time system monitoring with sub-second streaming updates, tiled metric grids, no loading states.
- **Chrome DevTools** — The baseline developer control panel; split panes, syntax highlighting, monospace everywhere, inline filters.
- **Kubernetes Dashboard** (https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/) — Status pills, live pod logs, YAML diffs, resource tables.
- **Lens IDE** (https://k8slens.dev/) — Kubernetes management with persistent log tails, status badges, and resource state views.
- **React DevTools** (https://react.dev/learn/react-developer-tools) — Component tree, live state, time-travel debugging, side-by-side diffs.
- **Redux DevTools** (https://github.com/reduxjs/redux-devtools) — State timeline, jump-to-any-point replay, monospace object rendering.
- **PlotJuggler** (https://github.com/facontidavide/PlotJuggler) — Robotics telemetry with drag-and-drop multi-graph layout, synchronized time cursors, persistent layouts.

### Dropped

- Generic "dashboard best practices" blog posts without concrete observability/control-panel examples.
- Consumer UI design systems (Material, Fluent, Carbon) — their density defaults are too low for control panels.
- Financial dashboards — they prioritize data integrity and compliance over live observability; different problem domain.

---

## Gaps

1. **WebRTC stream overlay patterns**: How do control panels coexist with a live video stream when the stream itself is the main focus? Do you overlay the panel on the stream, split-screen, or picture-in-picture? Need to research game-streaming UIs (Parsec, Moonlight, Steam Remote Play) for spatial coexistence patterns.

2. **Touch-first control panels**: These principles assume keyboard+mouse. How do dense control panels adapt to touch input on tablets or handheld devices? (Probably not the primary target for this project, but worth noting.)

3. **Accessibility for dense UIs**: High information density can hurt screen-reader usability. Need to investigate ARIA live regions, semantic log structure, and keyboard-nav patterns for dense dashboards.

4. **React component libraries for observability UIs**: Are there pre-built React component libraries for Grafana-style panels, log streams, or metric tiles? Or is it all bespoke? Need to search npm for "observability UI components" or "dashboard component library".

---

## Next Steps

1. **Prototype the 3-zone layout** in your existing React stack: top status bar, main content area, bottom log pane. Use placeholder fixture data.
2. **Build a `<LogStreamPane>` component** with syntax-highlighted log levels, monospace font, and inline filter bar. Stream log lines from a circular buffer atom.
3. **Build a `<MetricTile>` component** for FPS/latency/temp display: big number + trend arrow + optional sparkline.
4. **Study Chrome DevTools closely**: Open it, resize the panes, look at the Console filter bar, study the syntax highlighting. Replicate its split-pane behavior.
5. **Search for React component libraries**: Look for "react observability components", "react grafana panel", "react log viewer" on npm. If none exist, you build from primitives (no wheel reinvention needed—it's a vertical integration advantage).
