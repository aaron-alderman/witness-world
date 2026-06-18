import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bundleId, createHandlers, handlerCatalog, providers } from "./runtime.js";

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

test("wcss authoring plugin exposes the standalone JSON handler contract", () => {
  assert.equal(bundleId, "bundle-wcss-authoring");
  assert.deepEqual(handlerCatalog.handlerMetadata["wcss.document.read"], {
    routeKind: "json",
    responseKind: "json",
    methods: ["GET"]
  });
  assert.equal(providers[0]?.id, "wcss.previewSessions");
});

test("wcss authoring plugin reads a document and manages snapshot-scoped preview sessions", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "wcss-authoring-plugin-"));
  const appRoot = path.join(tempRoot, "sample");
  try {
    await writeAdapter(appRoot, "app/authoring-adapter.js", `
      export async function loadAuthoringAdapter() {
        const document = {
          kind: "wcss-document",
          theme: "sample",
          tokens: [{ name: "color.chrome.bg", value: "#112233" }]
        };
        return {
          document,
          tokenCatalog: {
            tokens: [{ name: "color.chrome.bg", value: "#112233", domain: "color" }]
          },
          applyTokenPatch({ ops }) {
            const next = JSON.parse(JSON.stringify(document));
            for (const op of ops) {
              if (op.kind === "set") next.tokens[0].value = op.value;
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
    const previewRuntime = providers[0].factory();
    const handlers = createHandlers({
      sendJson(res, status, body, headers = {}) {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
        res.end(JSON.stringify(body));
      },
      readJson(req) {
        return Promise.resolve(req.body ?? {});
      }
    });
    const route = {
      params: {
        adapterModule: "./app/authoring-adapter.js",
        adapterExport: "loadAuthoringAdapter"
      }
    };
    const appContext = {
      appRoot,
      requestSnapshot: { appRevision: 7 },
      providerRuntimes: { "wcss.previewSessions": previewRuntime }
    };

    const readRes = createResponse();
    await handlers["wcss.document.read"]({ res: readRes, route, appContext });
    assert.equal(readRes.statusCode, 200);
    const readBody = JSON.parse(readRes.body);
    assert.equal(readBody.document.theme, "sample");
    assert.equal(readBody.tokenCatalog.tokens[0].name, "color.chrome.bg");

    const createRes = createResponse();
    await handlers["wcss.preview.session.create"]({
      res: createRes,
      route,
      appContext
    });
    const created = JSON.parse(createRes.body);
    assert.equal(typeof created.previewSessionId, "string");
    assert.equal(created.version, 0);

    const patchRes = createResponse();
    await handlers["wcss.preview.tokens.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "set", token: "color.chrome.bg", value: "#abcdef" }]
        }
      },
      res: patchRes,
      route,
      appContext
    });
    const patched = JSON.parse(patchRes.body);
    assert.equal(patched.ok, true);
    assert.equal(patched.version, 1);
    assert.deepEqual(patched.ops, [{ kind: "set", token: "color.chrome.bg", value: "#abcdef" }]);

    const resolved = previewRuntime.resolveSession({
      previewSessionId: created.previewSessionId,
      appRoot,
      adapterKey: `${path.join(appRoot, "app/authoring-adapter.js")}\u0000loadAuthoringAdapter`,
      requestSnapshot: { appRevision: 7 }
    });
    assert.equal(resolved.version, 1);

    const mismatchRes = createResponse();
    await handlers["wcss.preview.tokens.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "set", token: "color.chrome.bg", value: "#123456" }]
        }
      },
      res: mismatchRes,
      route,
      appContext: {
        ...appContext,
        requestSnapshot: { appRevision: 8 }
      }
    });
    assert.equal(mismatchRes.statusCode, 500);
    assert.match(mismatchRes.body, /no longer matches the active app snapshot/i);

    const clearRes = createResponse();
    await handlers["wcss.preview.session.clear"]({
      req: { body: { previewSessionId: created.previewSessionId } },
      res: clearRes,
      route,
      appContext
    });
    assert.equal(JSON.parse(clearRes.body).ok, true);
    assert.throws(
      () => previewRuntime.resolveSession({
        previewSessionId: created.previewSessionId,
        appRoot,
        adapterKey: `${path.join(appRoot, "app/authoring-adapter.js")}\u0000loadAuthoringAdapter`,
        requestSnapshot: { appRevision: 7 }
      }),
      /unknown preview session/i
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
