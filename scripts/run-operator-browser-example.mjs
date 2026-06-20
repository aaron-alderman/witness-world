import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "operator", "browser");
const host = "127.0.0.1";
const port = 4020;
const shouldOpen = process.argv.includes("--open");

const mimeByExtension = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".rvm", "text/plain; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".ts", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"]
]);

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

const server = http.createServer(async (req, res) => {
  try {
    const rawPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url || "/index.html");
    const targetPath = path.resolve(root, `.${rawPath}`);
    if (!targetPath.startsWith(root)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const body = await fs.readFile(targetPath);
    res.writeHead(200, { "content-type": mimeByExtension.get(path.extname(targetPath)) || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "not found");
  }
});

server.listen(port, host, () => {
  const url = `http://${host}:${port}`;
  console.log(`Operator browser example: ${url}`);
  console.log("Press Ctrl+C to stop the server.");
  if (shouldOpen) openUrl(url);
});
