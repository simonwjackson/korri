import { afterEach, describe, expect, it } from "bun:test"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import {
  DualScreenBroadcastSessionRoot,
  type DualScreenChannel,
  type DualScreenChannelFactory,
} from "./DualScreenBroadcastSessionRoot"
import { useDualScreenSession } from "./DualScreenSession.context"
import type { DualScreenEvent } from "./dual-screen-events"

afterEach(() => cleanup())

describe("DualScreenBroadcastSessionRoot", () => {
  it("delivers selected game changes between roots on the same channel", async () => {
    const createChannel = createInProcessChannelFactory()

    render(
      <>
        <DualScreenBroadcastSessionRoot
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <PublisherProbe />
        </DualScreenBroadcastSessionRoot>
        <DualScreenBroadcastSessionRoot
          initialGameId="crystalline-drift"
          createChannel={createChannel}
        >
          <ReaderProbe />
        </DualScreenBroadcastSessionRoot>
      </>,
    )

    expect(screen.getByText("reader: crystalline-drift")).toBeTruthy()

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

function ReaderProbe() {
  const { selectedGameId } = useDualScreenSession()
  return <span>reader: {selectedGameId}</span>
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

  constructor(
    private readonly name: string,
    private readonly channelsByName: Map<string, Set<InProcessChannel>>,
  ) {}

  postMessage(event: DualScreenEvent): void {
    const channels = this.channelsByName.get(this.name) ?? new Set()
    for (const channel of channels) {
      if (channel === this) continue
      channel.deliver(event)
    }
  }

  close(): void {
    this.channelsByName.get(this.name)?.delete(this)
  }

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<DualScreenEvent>) => void,
  ): void {
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
