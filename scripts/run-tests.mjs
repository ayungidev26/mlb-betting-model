import { spawn } from "node:child_process"

const rawArgs = process.argv.slice(2)
const sanitizedArgs = rawArgs[0] === "--run" ? rawArgs.slice(1) : rawArgs
const testArgs = sanitizedArgs.length > 0 ? sanitizedArgs : ["tests/*.test.mjs"]

const child = spawn(process.execPath, ["--test", ...testArgs], {
  stdio: "inherit",
  env: process.env
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 1)
})
