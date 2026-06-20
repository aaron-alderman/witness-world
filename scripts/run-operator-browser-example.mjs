import { spawn } from "node:child_process";
import { startOperatorBrowserExampleServer } from "../src/operator-browser-example-server.js";

const host = "127.0.0.1";
const shouldOpen = process.argv.includes("--open");
const fixtureOnly = process.argv.includes("--fixture");
const explicitPort = process.argv.includes("--port");
const requestedPort = resolveRequestedPort(process.argv, 4020);

function openUrl(url) {
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }
  if (process.platform === "darwin") {
    const child = spawn("open", [url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return;
  }
  const child = spawn("xdg-open", [url], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function resolveRequestedPort(args, fallback) {
  const portIndex = args.indexOf("--port");
  if (portIndex < 0) return fallback;
  const numeric = Number(args[portIndex + 1]);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

const server = await startOperatorBrowserExampleServer({
  host,
  port: requestedPort,
  explicitPort,
  fixtureOnly,
  onPortFallback(currentPort, nextPort) {
    console.warn(`Port ${currentPort} is already in use; trying ${nextPort}.`);
  }
});

async function shutdown() {
  await server.close();
}

process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

console.log(`Operator browser example: ${server.url}`);
if (fixtureOnly) console.log("Mode: fixture-readonly (offline/testing-only).");
console.log("Press Ctrl+C to stop the server.");
if (shouldOpen) openUrl(server.url);
