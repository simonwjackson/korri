const exitCode = Number(process.argv[2] ?? "0")
console.log("child-ran")
process.exit(exitCode)
