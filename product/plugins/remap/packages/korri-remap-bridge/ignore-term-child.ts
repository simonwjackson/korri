console.log("child-ready")
process.on("SIGTERM", () => {
  console.log("child-ignored-term")
})
setInterval(() => undefined, 1000)
