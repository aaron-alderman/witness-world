import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bundleId, createHandlers, routes } from "./runtime.js";

function createResponse() {
  return {
    statusCode: 0,
    headers: null,
    body: "",
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(chunk = "") {
      this.body += String(chunk || "");
    }
  };
}

async function writeAdapter(appRoot, relativePath, source) {
  const fullPath = path.join(appRoot, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, source, "utf8");
  return fullPath;
}

test("wcss runtime plugin exposes the standalone generic bundle contract", () => {
  assert.equal(bundleId, "bundle-wcss-runtime");
  assert.deepEqual(routes, []);
});

test("wcss runtime plugin serves a requested stylesheet asset from an app adapter and caches per snapshot", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-runtime-plugin-"));
  const appRoot = path.join(tempRoot, "engentus");
  try {
    await writeAdapter(appRoot, "app/adapter.js", `
      export async function buildStylesheets({ requestSnapshot }) {
        globalThis.__wcssAdapterCalls = (globalThis.__wcssAdapterCalls || 0) + 1;
        return {
          files: {
            "shell": "/* shell rev " + (requestSnapshot?.appRevision || 0) + " */",
            "chart": "/* chart rev " + (requestSnapshot?.appRevision || 0) + " */"
          }
        };
      }
    `);
    const handlers = createHandlers({
      send(res, status, contentType, body, headers = {}) {
        res.writeHead(status, { "content-type": contentType, ...headers });
        res.end(body);
      }
    });

    const snapshotOne = { appRevision: 1 };
    const appContextOne = {
      appRoot,
      requestSnapshot: snapshotOne,
      appSnapshotManager: {
        getActiveSnapshot() {
          return snapshotOne;
        }
      }
    };
    const baseParams = {
      adapterModule: "./app/adapter.js",
      adapterExport: "buildStylesheets"
    };

    const shellRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: shellRes,
      route: { params: { ...baseParams, asset: "shell" } },
      appContext: appContextOne
    });
    assert.equal(shellRes.statusCode, 200);
    assert.equal(shellRes.body, "/* shell rev 1 */");

    const chartRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: chartRes,
      route: { params: { ...baseParams, asset: "chart" } },
      appContext: appContextOne
    });
    assert.equal(chartRes.statusCode, 200);
    assert.equal(chartRes.body, "/* chart rev 1 */");
    assert.equal(globalThis.__wcssAdapterCalls, 1);

    const snapshotTwo = { appRevision: 2 };
    const appContextTwo = {
      appRoot,
      requestSnapshot: snapshotTwo,
      appSnapshotManager: {
        getActiveSnapshot() {
          return snapshotTwo;
        }
      }
    };
    const nextShellRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: nextShellRes,
      route: { params: { ...baseParams, asset: "shell" } },
      appContext: appContextTwo
    });
    assert.equal(nextShellRes.statusCode, 200);
    assert.equal(nextShellRes.body, "/* shell rev 2 */");
    assert.equal(globalThis.__wcssAdapterCalls, 2);
  } finally {
    delete globalThis.__wcssAdapterCalls;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("wcss runtime plugin rejects adapter modules outside the app root and shared _lib boundary", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-runtime-boundary-"));
  const appRoot = path.join(tempRoot, "apps", "sample");
  try {
    const handlers = createHandlers({
      send(res, status, contentType, body, headers = {}) {
        res.writeHead(status, { "content-type": contentType, ...headers });
        res.end(body);
      }
    });
    const res = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res,
      route: {
        params: {
          asset: "shell",
          adapterModule: "../../outside.js",
          adapterExport: "buildStylesheets"
        }
      },
      appContext: {
        appRoot,
        requestSnapshot: { appRevision: 1 }
      }
    });
    assert.equal(res.statusCode, 500);
    assert.match(res.body, /outside allowed roots/i);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
