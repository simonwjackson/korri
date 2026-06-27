import { afterEach, describe, expect, it } from "bun:test"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  type ComponentProps,
  createElement,
  StrictMode,
  useEffect,
} from "react"
import {
  DualScreenBroadcastSessionRoot,
  type DualScreenChannel,
  type DualScreenChannelFactory,
} from "./DualScreenBroadcastSessionRoot"
import { useDualScreenSession } from "./DualScreenSession.context"
import type { DualScreenEvent } from "./dual-screen-events"

type SessionProps = Omit<
  ComponentProps<typeof DualScreenBroadcastSessionRoot>,
  "role"
>

function PrimarySession(props: SessionProps) {
  return createElement(DualScreenBroadcastSessionRoot, {
    ...props,
    role: "primary",
  })
}

function CompanionSession(props: SessionProps) {
  return createElement(DualScreenBroadcastSessionRoot, {
    ...props,
    role: "companion",
  })
}

afterEach(() => cleanup())

describe("DualScreenBroadcastSessionRoot", () => {
  it("delivers selected game changes between roots on the same channel", async () => {
    const createChannel = createInProcessChannelFactory()

    render(
      <>
        <PrimarySession
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <PublisherProbe />
        </PrimarySession>
        <CompanionSession
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <ReaderProbe />
        </CompanionSession>
      </>,
    )

    expect(screen.getByText("reader: crystalline-drift")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Focus Ember" }))

    await waitFor(() => {
      expect(screen.getByText("reader: ember-circuit")).toBeTruthy()
    })
  })

  it("replays child-published initial focus when the companion requests a snapshot", async () => {
    const createChannel = createInProcessChannelFactory()

    render(
      <>
        <PrimarySession createChannel={createChannel}>
          <InitialFocusProbe gameId="hollow-knight" />
        </PrimarySession>
        <CompanionSession createChannel={createChannel}>
          <ReaderProbe />
        </CompanionSession>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByText("reader: hollow-knight")).toBeTruthy()
    })
  })

  it("replays the primary selection to a companion that joins late", async () => {
    const createChannel = createInProcessChannelFactory()
    const { rerender } = render(
      <PrimarySession
        initialGameId="crystalline-drift"
        createChannel={createChannel}
      >
        <PublisherProbe />
      </PrimarySession>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Focus Ember" }))

    rerender(
      <>
        <PrimarySession
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <PublisherProbe />
        </PrimarySession>
        <CompanionSession createChannel={createChannel}>
          <ReaderProbe />
        </CompanionSession>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByText("reader: ember-circuit")).toBeTruthy()
    })
  })

  it("accepts focus from a remounted primary whose local revision restarted", async () => {
    const createChannel = createInProcessChannelFactory()
    const { rerender } = render(
      <>
        <CompanionSession key="companion" createChannel={createChannel}>
          <ReaderProbe />
        </CompanionSession>
        <PrimarySession key="primary-a" createChannel={createChannel}>
          <InitialFocusProbe gameId="ember-circuit" />
        </PrimarySession>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByText("reader: ember-circuit")).toBeTruthy()
    })

    rerender(
      <>
        <CompanionSession key="companion" createChannel={createChannel}>
          <ReaderProbe />
        </CompanionSession>
        <PrimarySession key="primary-b" createChannel={createChannel}>
          <InitialFocusProbe gameId="hollow-knight" />
        </PrimarySession>
      </>,
    )

    await waitFor(() => {
      expect(screen.getByText("reader: hollow-knight")).toBeTruthy()
    })
  })

  it("accepts legacy focus payloads without revision source ids", async () => {
    const createChannel = createInProcessChannelFactory()
    const legacyChannel = createChannel("legacy-channel")

    render(
      <CompanionSession
        channelName="legacy-channel"
        createChannel={createChannel}
      >
        <ReaderProbe />
      </CompanionSession>,
    )

    act(() => {
      legacyChannel.postMessage({
        _tag: "GameFocused",
        gameId: "hollow-knight",
        source: "primary",
        revision: 1,
      })
    })

    await waitFor(() => {
      expect(screen.getByText("reader: hollow-knight")).toBeTruthy()
    })

    legacyChannel.close()
  })

  it("accepts legacy primary snapshots without revision source ids", async () => {
    const createChannel = createInProcessChannelFactory()
    const legacyChannel = createChannel("legacy-snapshot-channel")

    render(
      <CompanionSession
        channelName="legacy-snapshot-channel"
        createChannel={createChannel}
      >
        <ReaderProbe />
      </CompanionSession>,
    )

    act(() => {
      legacyChannel.postMessage({
        _tag: "SelectionSnapshot",
        selectedGameId: "hollow-knight",
        lastSource: "primary",
        source: "primary",
        revision: 1,
      })
    })

    await waitFor(() => {
      expect(screen.getByText("reader: hollow-knight")).toBeTruthy()
    })

    legacyChannel.close()
  })

  it("does not crash when the channel transport rejects posts", () => {
    const createChannel: DualScreenChannelFactory = () => ({
      postMessage: () => {
        throw new Error("post failed")
      },
      close: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    })

    expect(() =>
      render(
        <CompanionSession createChannel={createChannel}>
          <ReaderProbe />
        </CompanionSession>,
      ),
    ).not.toThrow()
  })

  it("does not crash when the channel factory is unavailable", () => {
    const createChannel: DualScreenChannelFactory = () => {
      throw new Error("unavailable")
    }

    expect(() =>
      render(
        <PrimarySession createChannel={createChannel}>
          <PublisherProbe />
        </PrimarySession>,
      ),
    ).not.toThrow()
  })

  it("recreates the channel after StrictMode effect replay", async () => {
    const createChannel = createInProcessChannelFactory()

    render(
      <StrictMode>
        <PrimarySession
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <PublisherProbe />
        </PrimarySession>
        <CompanionSession
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <ReaderProbe />
        </CompanionSession>
      </StrictMode>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Focus Ember" }))

    await waitFor(() => {
      expect(screen.getByText("reader: ember-circuit")).toBeTruthy()
    })
  })
})

function PublisherProbe() {
  const { focusGame } = useDualScreenSession()
  return (
    <button type="button" onClick={() => focusGame("ember-circuit", "primary")}>
      Focus Ember
    </button>
  )
}

function InitialFocusProbe({ gameId }: { readonly gameId: string }) {
  const { focusGame } = useDualScreenSession()
  useEffect(() => {
    focusGame(gameId, "primary")
  }, [focusGame, gameId])
  return null
}

function ReaderProbe() {
  const { selectedGameId } = useDualScreenSession()
  return <span>reader: {selectedGameId ?? "none"}</span>
}

function createInProcessChannelFactory(): DualScreenChannelFactory {
  const channelsByName = new Map<string, Set<InProcessChannel>>()

  return name => {
    const channel = new InProcessChannel(name, channelsByName)
    const channels = channelsByName.get(name) ?? new Set<InProcessChannel>()
    channels.add(channel)
    channelsByName.set(name, channels)
    return channel
  }
}

class InProcessChannel implements DualScreenChannel {
  private readonly listeners = new Set<
    (event: MessageEvent<DualScreenEvent>) => void
  >()
  private closed = false

  constructor(
    private readonly name: string,
    private readonly channelsByName: Map<string, Set<InProcessChannel>>,
  ) {}

  postMessage(event: DualScreenEvent): void {
    if (this.closed) throw new Error("posted to closed channel")
    const channels = this.channelsByName.get(this.name) ?? new Set()
    for (const channel of channels) {
      if (channel === this || channel.closed) continue
      channel.deliver(event)
    }
  }

  close(): void {
    this.closed = true
    this.channelsByName.get(this.name)?.delete(this)
    this.listeners.clear()
  }

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<DualScreenEvent>) => void,
  ): void {
    if (this.closed) throw new Error("listened to closed channel")
    if (type === "message") this.listeners.add(listener)
  }

  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<DualScreenEvent>) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener)
  }

  deliver(event: DualScreenEvent): void {
    const message = new MessageEvent<DualScreenEvent>("message", {
      data: event,
    })
    for (const listener of this.listeners) listener(message)
  }
}
