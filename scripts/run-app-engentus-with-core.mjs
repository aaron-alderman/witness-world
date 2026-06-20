import { spawn } from "node:child_process";

const coreUrl = typeof process.env.WITNESS_CORE_URL === "string" && process.env.WITNESS_CORE_URL.trim()
  ? process.env.WITNESS_CORE_URL.trim()
  : "http://127.0.0.1:8788";
const defaultWorkerPort = typeof process.env.WITNESS_WORKER_PORT === "string" && process.env.WITNESS_WORKER_PORT.trim()
  ? process.env.WITNESS_WORKER_PORT.trim()
  : "4011";
const forwardedArgs = process.argv.slice(2);
const hasExplicitPort = forwardedArgs.some((argument, index) => {
  if (argument === "--port") return true;
  if (argument.startsWith("--port=")) return true;
  if (argument === "-p") return true;
  if (index > 0 && forwardedArgs[index - 1] === "--port") return true;
  if (index > 0 && forwardedArgs[index - 1] === "-p") return true;
  return false;
});

const child = spawn(
  process.execPath,
  [
    "src/cli.js",
    "utility-serve",
    "examples/engentus",
    ...(hasExplicitPort ? [] : ["--port", defaultWorkerPort]),
    "--runtime-profile",
    "full",
    "--startup-telemetry",
    ...forwardedArgs
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
