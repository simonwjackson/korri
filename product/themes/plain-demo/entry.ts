import type { KorriThemeEntrypoint } from "@platform/theme/bridge"

export const plainDemoTheme: KorriThemeEntrypoint = {
  id: "plain-demo",
  mount(host, { bridge }) {
    host.innerHTML = `
      <main data-plain-demo-theme style="min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #101827; color: #f8fafc;">
        <section style="display: grid; gap: 0.75rem; text-align: center;">
          <p style="letter-spacing: 0.16em; text-transform: uppercase; color: #93c5fd;">Korri platform bridge</p>
          <h1 style="font-size: clamp(2rem, 8vw, 4rem); margin: 0;">Plain demo theme</h1>
          <p>Library items: <strong data-demo-library-count>loading</strong></p>
          <p>Last semantic input: <strong data-demo-last-input>none</strong></p>
        </section>
      </main>
    `

    const countElement = host.querySelector("[data-demo-library-count]")
    const inputElement = host.querySelector("[data-demo-last-input]")

    void bridge.library
      .list()
      .then(items => {
        if (countElement) countElement.textContent = String(items.length)
      })
      .catch(error => {
        if (countElement) countElement.textContent = `error: ${String(error)}`
      })

    const unsubscribe = bridge.input.subscribe(action => {
      if (inputElement) inputElement.textContent = action.type
    })

    return () => {
      unsubscribe()
      host.replaceChildren()
    }
  },
}

export default plainDemoTheme
