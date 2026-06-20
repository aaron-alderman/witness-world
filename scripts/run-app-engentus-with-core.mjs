import { spawn } from "node:child_process";

const coreUrl = typeof process.env.WITNESS_CORE_URL === "string" && process.env.WITNESS_CORE_URL.trim()
  ? process.env.WITNESS_CORE_URL.trim()
  : "http://127.0.0.1:8788";

const child = spawn(
  process.execPath,
  [
    "src/cli.js",
    "serve",
    "examples/engentus",
    "--runtime-profile",
    "full",
    "--startup-telemetry",
    ...process.argv.slice(2)
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      WITNESS_CORE_URL: coreUrl
    }
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
