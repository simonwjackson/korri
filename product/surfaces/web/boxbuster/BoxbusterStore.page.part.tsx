import "./boxbuster.css"

const fixturePoster =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 220'%3E%3Crect width='160' height='220' fill='%2312141d'/%3E%3Crect x='14' y='14' width='132' height='192' fill='%232a2550' stroke='%23f2c100' stroke-width='6'/%3E%3Ctext x='80' y='104' fill='%23f2c100' font-family='monospace' font-size='18' text-anchor='middle'%3EBOX%3C/text%3E%3Ctext x='80' y='128' fill='%23f2c100' font-family='monospace' font-size='18' text-anchor='middle'%3EBUSTER%3C/text%3E%3C/svg%3E"

function StaticStore({ playing }: { readonly playing?: boolean }) {
  return (
    <div className="boxbuster-surface" style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute",
          inset: "10% 12% 22%",
          border: "4px solid #33220d",
          background:
            "linear-gradient(180deg, #3b210c 0 55%, #1b1010 55% 100%)",
          boxShadow: "inset 0 0 0 4px #000, 0 18px 0 #120707",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "18%",
          right: "18%",
          bottom: "18%",
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "1.2rem",
        }}
      >
        {Array.from({ length: 10 }).map((_, index) => (
          <img
            key={index}
            src={fixturePoster}
            alt=""
            style={{ width: "100%", imageRendering: "pixelated" }}
          />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          top: "14%",
          left: "38%",
          width: "24%",
          aspectRatio: "4 / 3",
          border: "8px solid #111",
          background: playing ? "#1b5cff" : "#050505",
          color: "#f2c100",
          fontFamily: "monospace",
          display: "grid",
          placeItems: "center",
          textShadow: "2px 2px #000",
        }}
      >
        {playing ? "NOW PLAYING" : "TV OFF"}
      </div>
      <div
        style={{
          position: "absolute",
          left: 24,
          bottom: 22,
          color: "#f2c100",
          fontFamily: "monospace",
          textShadow: "2px 2px #000",
        }}
      >
        {playing ? "A PLAYING · B EJECT" : "PICK UP A CASE · WALK TO TV"}
      </div>
    </div>
  )
}

export const StoreIdle = {
  name: "Boxbuster Store Idle",
  note: "Fixture-only store scene with TV off",
  presentation: "surface" as const,
  render: () => <StaticStore />,
}

export const StoreNowPlaying = {
  name: "Boxbuster Store Now Playing",
  note: "Fixture-only store scene with TV lit",
  presentation: "surface" as const,
  render: () => <StaticStore playing />,
}
