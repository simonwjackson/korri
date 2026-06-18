/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 * Gallery group: SYSTEM — boot, onboarding, power, OS-update, battery, panic,
 * toast, developer-ISO badge. The system chrome a console shows outside any
 * single game. Composed from screens/kit.tsx; screen-specific layout in
 * screens/system.css (namespace pcSys-).
 */
import {
  Badge,
  Btn,
  Card,
  Hero,
  List,
  PicoIcon,
  Progress,
  Row,
  Screen,
  Spinner,
  Title,
} from "./kit"

export function BootSplashScreen() {
  return (
    <Screen className="center pad-0">
      <div className="pcSys-boot">
        <div className="pcSys-logo">KORRI</div>
        <div className="pcSys-boot-sub">PICO EDITION</div>
        <Spinner />
        <div className="pcSys-boot-ver">v2.4.1 · dusting off carts…</div>
      </div>
    </Screen>
  )
}

export function OnboardingScreen() {
  return (
    <Screen
      title="WELCOME"
      hints={[
        { key: "a", label: "NEXT" },
        { key: "b", label: "SKIP" },
      ]}
      className="center"
    >
      <div className="pcSys-logo pcSys-logo-sm">KORRI</div>
      <Title size={1}>LET'S SET UP</Title>
      <p className="pc-hero-msg">
        Three quick steps and you're playing. We never auto-launch — every game
        starts when you say so.
      </p>
      <div className="pcSys-steps">
        <span className="pcSys-step on">1 · LANGUAGE</span>
        <span className="pcSys-step on">2 · NETWORK</span>
        <span className="pcSys-step">3 · CONTROLLER</span>
      </div>
    </Screen>
  )
}

export function PowerMenuScreen() {
  return (
    <Screen title="PICO ▸ POWER" hints={[{ key: "b", label: "CANCEL" }]}>
      <div className="pcSys-power">
        <List>
          <Row
            icon={<PicoIcon name="moon" />}
            label="SLEEP"
            meta="Suspend to RAM, resume instantly"
            sel
          />
          <Row
            icon={<PicoIcon name="restart" />}
            label="RESTART"
            meta="Reboot the device"
          />
          <Row
            icon={<PicoIcon name="power" />}
            label="SHUT DOWN"
            meta="Power off completely"
          />
          <Row
            icon={<PicoIcon name="exit" />}
            label="RETURN TO DESKTOP"
            meta="Exit to host shell"
          />
        </List>
      </div>
    </Screen>
  )
}

export function SystemUpdateScreen() {
  return (
    <Screen
      title="PICO ▸ UPDATE"
      hints={[
        { key: "a", label: "INSTALL" },
        { key: "b", label: "LATER" },
      ]}
      className="center"
    >
      <Hero
        glyph={<PicoIcon name="download" />}
        glyphTone="info"
        title="UPDATE READY"
        message="System update v2.5.0 is ready to install. 248 MB · ~3 min. The device will restart once."
      >
        <Btn kind="primary">
          <PicoIcon name="play" /> INSTALL NOW
        </Btn>
        <Btn>RELEASE NOTES</Btn>
      </Hero>
      <div className="pcSys-upd-bar">
        <Progress pct={62} />
        <div className="pc-dim">DOWNLOADING · 154 / 248 MB</div>
      </div>
    </Screen>
  )
}

export function BatteryLowScreen() {
  return (
    <Screen
      tone="alert"
      hints={[{ key: "a", label: "DISMISS" }]}
      className="center"
    >
      <Hero
        glyph="▮"
        glyphTone="bad"
        title="BATTERY LOW"
        message="8% remaining. Plug in soon — your current session will auto-save before shutdown."
      >
        <Badge tone="bad">8%</Badge>
        <Btn>ENABLE BATTERY SAVER</Btn>
      </Hero>
    </Screen>
  )
}

export function PanicScreen() {
  return (
    <Screen
      tone="alert"
      hints={[{ key: "a", label: "RESTART" }]}
      className="center"
    >
      <Hero
        glyph={<PicoIcon name="close" />}
        glyphTone="bad"
        title="SOMETHING BROKE"
        message="The session manager hit a fatal error and had to stop. Your saves are safe."
      >
        <Card title="DIAGNOSTIC" className="pcSys-panic-card">
          <code className="pcSys-code">
            sessiond: teardown failed (stage=teardown)
            <br />
            code 0x5F · korri-portal 2.4.1
          </code>
        </Card>
        <Btn kind="primary">
          <PicoIcon name="restart" /> RESTART KORRI
        </Btn>
        <Btn>COPY REPORT</Btn>
      </Hero>
    </Screen>
  )
}

export function NotificationToastScreen() {
  return (
    <Screen
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "VIEW" },
        { key: "b", label: "DISMISS" },
      ]}
    >
      <div className="pcSys-stub pc-fill">
        <div className="pc-dim">…home surface behind…</div>
      </div>
      <div className="pcSys-toast">
        <span className="pcSys-toast-ico">
          <PicoIcon name="download" />
        </span>
        <span className="pcSys-toast-text">
          <b>DOWNLOAD COMPLETE</b>
          Sonic Robo Blast 2 is ready to play
        </span>
        <Badge tone="good">DONE</Badge>
      </div>
    </Screen>
  )
}

export function DeveloperBadgeScreen() {
  return (
    <Screen
      title="PICO ▸ HOME"
      hints={[
        { key: "a", label: "PLAY" },
        { key: "y", label: "OPTIONS" },
      ]}
    >
      <div className="pcSys-stub pc-fill">
        <div className="pc-dim">…home surface behind…</div>
      </div>
      <div className="pcSys-devbadge">DEVELOPER ISO · BROAD PERSISTENCE</div>
    </Screen>
  )
}
