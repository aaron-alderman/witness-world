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
  assert.deepEqual(handlerCatalog.handlerMetadata["wcss.schema.read"], {
    routeKind: "json",
    responseKind: "json",
    methods: ["GET"]
  });
  assert.deepEqual(handlerCatalog.handlerMetadata["wcss.preview.document.patch"], {
    routeKind: "json",
    responseKind: "json",
    methods: ["PATCH"]
  });
  assert.equal(providers[0]?.id, "wcss.previewSessions");
});

test("wcss authoring plugin reads schema and manages snapshot-scoped structured preview sessions", async () => {
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
        const schema = {
          supportedOperations: ["token.set", "style.field.set"],
          tokens: [{ name: "color.chrome.bg", domain: "color", currentValue: "#112233", canonicalValue: "#112233", previewable: true }],
          styles: [{ name: "chrome.toolbar", fields: [{ field: "layout.height", value: "44px", previewable: true }] }],
          slices: [],
          views: [{ name: "desktop", readOnly: true }]
        };
        return {
          document,
          schema,
          tokenCatalog: {
            tokens: [{ name: "color.chrome.bg", value: "#112233", domain: "color" }]
          },
          applyPatch({ ops }) {
            const next = JSON.parse(JSON.stringify(document));
            for (const op of ops) {
              if (op.kind === "token.set") next.tokens[0].value = op.value;
              if (op.kind === "style.field.set" && op.field !== "layout.height") {
                throw new Error("unknown field");
              }
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

    const schemaRes = createResponse();
    await handlers["wcss.schema.read"]({ res: schemaRes, route, appContext });
    assert.equal(schemaRes.statusCode, 200);
    const schemaBody = JSON.parse(schemaRes.body);
    assert.equal(schemaBody.documentModel, "wcss");
    assert.equal(schemaBody.schema.styles[0].name, "chrome.toolbar");

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
    await handlers["wcss.preview.document.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "style.field.set", style: "chrome.toolbar", field: "layout.height", value: "60px" }]
        }
      },
      res: patchRes,
      route,
      appContext
    });
    const patched = JSON.parse(patchRes.body);
    assert.equal(patched.ok, true);
    assert.equal(patched.version, 1);
    assert.deepEqual(patched.ops, [{ kind: "style.field.set", style: "chrome.toolbar", field: "layout.height", value: "60px" }]);

    const compatibilityPatchRes = createResponse();
    await handlers["wcss.preview.tokens.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "set", token: "color.chrome.bg", value: "#abcdef" }]
        }
      },
      res: compatibilityPatchRes,
      route,
      appContext
    });
    const compatibilityPatched = JSON.parse(compatibilityPatchRes.body);
    assert.equal(compatibilityPatched.ok, true);
    assert.equal(compatibilityPatched.version, 2);
    assert.deepEqual(compatibilityPatched.ops, [
      { kind: "style.field.set", style: "chrome.toolbar", field: "layout.height", value: "60px" },
      { kind: "token.set", token: "color.chrome.bg", value: "#abcdef" }
    ]);

    const resolved = previewRuntime.resolveSession({
      previewSessionId: created.previewSessionId,
      appRoot,
      adapterKey: `${path.join(appRoot, "app/authoring-adapter.js")}\u0000loadAuthoringAdapter`,
      requestSnapshot: { appRevision: 7 }
    });
    assert.equal(resolved.version, 2);

    const mismatchRes = createResponse();
    await handlers["wcss.preview.document.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "style.field.set", style: "chrome.toolbar", field: "layout.height", value: "64px" }]
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

    const invalidRes = createResponse();
    await handlers["wcss.preview.document.patch"]({
      req: {
        body: {
          previewSessionId: created.previewSessionId,
          ops: [{ kind: "style.field.set", style: "chrome.toolbar", field: "paint.missing", value: "red" }]
        }
      },
      res: invalidRes,
      route,
      appContext
    });
    assert.equal(invalidRes.statusCode, 500);
    assert.match(invalidRes.body, /unknown field/i);

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
