import { spawn } from "node:child_process";

const forwardedArgs = process.argv.slice(2);

if (forwardedArgs.length === 0) {
  console.error("usage: node scripts/run-example-app-worker.mjs <app-path> [--default-port <n>] [-- ...runtime args]");
  process.exit(1);
}

const appPath = forwardedArgs.shift();
let defaultPort = null;
if (forwardedArgs[0] === "--default-port") {
  defaultPort = forwardedArgs[1] ?? null;
  forwardedArgs.splice(0, 2);
}

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
    appPath,
    ...(defaultPort && !hasExplicitPort ? ["--port", String(defaultPort)] : []),
    ...forwardedArgs
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env
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
