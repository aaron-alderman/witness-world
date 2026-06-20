import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bundleId, createHandlers, routes } from "./runtime.js";
import { providers as authoringProviders } from "../wcss-authoring/runtime.js";

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

test("wcss runtime plugin loads adapter modules through witness-core without local canonical fs reads", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-runtime-bridge-"));
  const appRoot = path.join(tempRoot, "engentus");
  try {
    await writeAdapter(appRoot, "app/adapter.js", `
      import { shellCss, chartCss } from "./lib/helper.js";
      export async function buildStylesheets({ requestSnapshot }) {
        return {
          files: {
            shell: shellCss(requestSnapshot?.appRevision || 0),
            chart: chartCss(requestSnapshot?.appRevision || 0)
          }
        };
      }
    `);
    await writeAdapter(appRoot, "app/lib/helper.js", `
      export function shellCss(revision) {
        return "/* bridged shell rev " + revision + " */";
      }
      export function chartCss(revision) {
        return "/* bridged chart rev " + revision + " */";
      }
    `);
    const sourceById = new Map([
      ["app/adapter.js", await fs.readFile(path.join(appRoot, "app/adapter.js"), "utf8")],
      ["app/lib/helper.js", await fs.readFile(path.join(appRoot, "app/lib/helper.js"), "utf8")]
    ]);
    const bridgeCalls = [];
    const handlers = createHandlers({
      send(res, status, contentType, body, headers = {}) {
        res.writeHead(status, { "content-type": contentType, ...headers });
        res.end(body);
      },
      fsModule: {
        ...fs,
        async readFile(target, encoding) {
          const resolved = path.resolve(String(target || ""));
          if (resolved.startsWith(appRoot)) {
            throw new Error(`canonical adapter read escaped witness-core bridge: ${resolved}`);
          }
          return await fs.readFile(target, encoding);
        },
        async stat(target) {
          const resolved = path.resolve(String(target || ""));
          if (resolved.startsWith(appRoot)) {
            throw new Error(`canonical adapter stat escaped witness-core bridge: ${resolved}`);
          }
          return await fs.stat(target);
        }
      }
    });

    const shellRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: shellRes,
      route: {
        params: {
          asset: "shell",
          adapterModule: "./app/adapter.js",
          adapterExport: "buildStylesheets"
        }
      },
      appContext: {
        appRoot,
        witnessCoreUrl: "http://127.0.0.1:8788",
        witnessCoreBridge: {
          async readSource({ path: sourceId }) {
            bridgeCalls.push({ kind: "read", path: sourceId });
            return { path: sourceId, content: sourceById.get(sourceId) ?? "" };
          },
          async statSource({ path: sourceId }) {
            bridgeCalls.push({ kind: "stat", path: sourceId });
            const content = sourceById.get(sourceId);
            return {
              path: sourceId,
              exists: typeof content === "string",
              isFile: typeof content === "string",
              isDirectory: false,
              size: Buffer.byteLength(String(content ?? ""), "utf8"),
              modifiedAt: "1700000000000"
            };
          }
        },
        requestSnapshot: { appRevision: 9 },
        appSnapshotManager: {
          getActiveSnapshot() {
            return { appRevision: 9 };
          }
        }
      }
    });
    assert.equal(shellRes.statusCode, 200);
    assert.equal(shellRes.body, "/* bridged shell rev 9 */");
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === "app/adapter.js"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === "app/lib/helper.js"), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("wcss runtime plugin fails closed when witness-core authority is declared but unavailable", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-runtime-bridge-required-"));
  const appRoot = path.join(tempRoot, "engentus");
  try {
    await writeAdapter(appRoot, "app/adapter.js", `
      export async function buildStylesheets() {
        return { files: { shell: "/* local */" } };
      }
    `);
    const handlers = createHandlers({
      send(res, status, contentType, body, headers = {}) {
        res.writeHead(status, { "content-type": contentType, ...headers });
        res.end(body);
      },
      fsModule: {
        ...fs,
        async readFile(target, encoding) {
          const resolved = path.resolve(String(target || ""));
          if (resolved.startsWith(appRoot)) {
            throw new Error(`canonical adapter read escaped witness-core bridge: ${resolved}`);
          }
          return await fs.readFile(target, encoding);
        },
        async stat(target) {
          const resolved = path.resolve(String(target || ""));
          if (resolved.startsWith(appRoot)) {
            throw new Error(`canonical adapter stat escaped witness-core bridge: ${resolved}`);
          }
          return await fs.stat(target);
        }
      }
    });

    const res = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res,
      route: {
        params: {
          asset: "shell",
          adapterModule: "./app/adapter.js",
          adapterExport: "buildStylesheets"
        }
      },
      appContext: {
        appRoot,
        witnessCoreUrl: "http://127.0.0.1:8788",
        requestSnapshot: { appRevision: 2 }
      }
    });
    assert.equal(res.statusCode, 500);
    assert.equal(JSON.parse(res.body).code, "WITNESS_CORE_REQUIRED");
  } finally {
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

test("wcss runtime plugin serves preview-scoped CSS when a preview session id is present", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-runtime-preview-"));
  const appRoot = path.join(tempRoot, "engentus");
  try {
    await writeAdapter(appRoot, "app/authoring-adapter.js", `
      export async function loadAuthoringAdapter() {
        globalThis.__wcssPreviewBuildCalls = (globalThis.__wcssPreviewBuildCalls || 0) + 1;
        const document = {
          kind: "wcss-document",
          theme: "engentus",
          tokens: [{ name: "color.chrome.bg", value: "#112233" }]
        };
        return {
          document,
          schema: { supportedOperations: ["token.set"], tokens: [], styles: [], slices: [], views: [] },
          tokenCatalog: { tokens: [{ name: "color.chrome.bg", value: "#112233", domain: "color" }] },
          applyPatch({ ops }) {
            const next = JSON.parse(JSON.stringify(document));
            for (const op of ops) {
              if (op.kind === "token.set") next.tokens[0].value = op.value;
            }
            return next;
          },
          async buildStylesheets({ document: patched }) {
            return {
              files: {
                shell: ":root{--dk:" + patched.tokens[0].value + ";}",
                chart: ":root{--dk:" + patched.tokens[0].value + ";}"
              }
            };
          }
        };
      }
    `);
    const previewRuntime = authoringProviders[0].factory();
    const session = previewRuntime.createSession({
      appRoot,
      adapterKey: `${path.join(appRoot, "app/authoring-adapter.js")}\u0000loadAuthoringAdapter`,
      requestSnapshot: { appRevision: 3 }
    });
    previewRuntime.patchDocument({
      previewSessionId: session.previewSessionId,
      appRoot,
      adapterKey: `${path.join(appRoot, "app/authoring-adapter.js")}\u0000loadAuthoringAdapter`,
      requestSnapshot: { appRevision: 3 },
      ops: [{ kind: "token.set", token: "color.chrome.bg", value: "#445566" }]
    });
    const handlers = createHandlers({
      send(res, status, contentType, body, headers = {}) {
        res.writeHead(status, { "content-type": contentType, ...headers });
        res.end(body);
      }
    });
    const route = {
      params: {
        asset: "shell",
        adapterModule: "./app/authoring-adapter.js",
        adapterExport: "loadAuthoringAdapter"
      }
    };
    const appContext = {
      appRoot,
      requestSnapshot: { appRevision: 3 },
      providerRuntimes: { "wcss.previewSessions": previewRuntime }
    };

    const baseRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: baseRes,
      route,
      appContext,
      requestUrl: new URL("http://example.test/engentus/__generated/engentus-shell.css")
    });
    assert.equal(baseRes.statusCode, 200);
    assert.equal(baseRes.body, ":root{--dk:#112233;}");

    const previewRes = createResponse();
    await handlers["wcss.stylesheet.read"]({
      res: previewRes,
      route,
      appContext,
      requestUrl: new URL(`http://example.test/engentus/__generated/engentus-shell.css?wcssPreview=${encodeURIComponent(session.previewSessionId)}`)
    });
    assert.equal(previewRes.statusCode, 200);
    assert.equal(previewRes.body, ":root{--dk:#445566;}");
  } finally {
    delete globalThis.__wcssPreviewBuildCalls;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
