import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOperatorWorkbenchCore } from "./workbench/core.js";
import { generateOperatorBrowserSnapshotFixture } from "../../scripts/generate-operator-browser-snapshot.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const workspaceRootDefault = path.resolve(pluginRoot, "..", "..");
const browserRoot = path.resolve(workspaceRootDefault, "examples", "operator", "browser");
const defaultWorkspaceRoot = workspaceRootDefault;
const defaultExampleRoot = path.resolve(workspaceRootDefault, "examples", "operator");

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".rvm", "text/plain; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"]
]);

function resolveRequestedPort(port, fallback) {
  const numeric = Number(port);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback;
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload)}\n`);
}

function listenOnAvailablePort(server, {
  host,
  port,
  allowFallback = true,
  onPortFallback = null
} = {}) {
  let candidate = port;
  return new Promise((resolve, reject) => {
    const tryListen = () => {
      const cleanup = () => {
        server.off("error", onError);
        server.off("listening", onListening);
      };
      const onListening = () => {
        cleanup();
        resolve(candidate);
      };
      const onError = error => {
        cleanup();
        if (allowFallback && error?.code === "EADDRINUSE") {
          onPortFallback?.(candidate, candidate + 1);
          candidate += 1;
          tryListen();
          return;
        }
        reject(error);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, host);
    };
    tryListen();
  });
}

export async function startOperatorBrowserExampleServer({
  host = "127.0.0.1",
  port = 4020,
  explicitPort = false,
  fixtureOnly = false,
  workspaceRoot = defaultWorkspaceRoot,
  exampleRoot = defaultExampleRoot,
  staticRoot = browserRoot,
  core = undefined,
  createCoreImpl = createOperatorWorkbenchCore,
  generateFixtureImpl = generateOperatorBrowserSnapshotFixture,
  fsModule = fs,
  onPortFallback = null
} = {}) {
  const requestedPort = resolveRequestedPort(port, 4020);
  const ownedCore = core ?? (fixtureOnly
    ? null
    : await createCoreImpl({
      args: [exampleRoot, "--runtime-plugin", "plugin.operator-workbench"],
      cwd: workspaceRoot,
      env: process.env
    }));

  const server = http.createServer(async (req, res) => {
    try {
      const method = String(req.method || "GET").toUpperCase();
      const rawUrl = req.url || "/";
      const requestUrl = new URL(rawUrl, `http://${host}`);
      if (requestUrl.pathname === "/api/operator/snapshot" && method === "GET") {
        if (!ownedCore) {
          writeJson(res, 503, { error: "operator bridge unavailable in fixture-only mode" });
          return;
        }
        writeJson(res, 200, await ownedCore.snapshot());
        return;
      }
      if (requestUrl.pathname === "/api/operator/command" && method === "POST") {
        if (!ownedCore) {
          writeJson(res, 503, { error: "operator bridge unavailable in fixture-only mode" });
          return;
        }
        const payload = await readJsonBody(req);
        writeJson(res, 200, await ownedCore.executeCommand(payload?.command ?? ""));
        return;
      }
      if (requestUrl.pathname === "/api/operator/intent" && method === "POST") {
        if (!ownedCore) {
          writeJson(res, 503, { error: "operator bridge unavailable in fixture-only mode" });
          return;
        }
        const payload = await readJsonBody(req);
        writeJson(res, 200, await ownedCore.dispatchIntent(payload ?? {}));
        return;
      }
      if (requestUrl.pathname === "/api/operator/display-settings" && method === "POST") {
        if (!ownedCore) {
          writeJson(res, 503, { error: "operator bridge unavailable in fixture-only mode" });
          return;
        }
        const payload = await readJsonBody(req);
        writeJson(res, 200, await ownedCore.updateDisplaySettings(payload ?? {}));
        return;
      }
      if (requestUrl.pathname === "/api/operator/autocomplete" && method === "GET") {
        if (!ownedCore) {
          writeJson(res, 503, { error: "operator bridge unavailable in fixture-only mode" });
          return;
        }
        writeJson(res, 200, ownedCore.autocomplete(requestUrl.searchParams.get("line") || ""));
        return;
      }
      const rawPath = rawUrl === "/" ? "/index.html" : decodeURIComponent(rawUrl || "/index.html");
      const targetPath = path.resolve(staticRoot, `.${rawPath}`);
      if (!targetPath.startsWith(staticRoot)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      const body = await fsModule.readFile(targetPath);
      res.writeHead(200, { "content-type": mimeByExtension.get(path.extname(targetPath)) || "application/octet-stream" });
      res.end(body);
    } catch (error) {
      const statusCode = error instanceof SyntaxError ? 400 : 500;
      if ((req.url || "").startsWith("/api/")) {
        writeJson(res, statusCode, {
          error: error instanceof Error ? error.message : "request failed"
        });
        return;
      }
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(error instanceof Error ? error.message : "not found");
    }
  });

  await generateFixtureImpl();
  const activePort = await listenOnAvailablePort(server, {
    host,
    port: requestedPort,
    allowFallback: !explicitPort,
    onPortFallback
  });

  return {
    host,
    requestedPort,
    port: activePort,
    url: fixtureOnly ? `http://${host}:${activePort}/?fixture=1` : `http://${host}:${activePort}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(() => resolve()));
      if (core == null) {
        await ownedCore?.close?.();
      }
    }
  };
}
