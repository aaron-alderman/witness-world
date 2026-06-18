import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import {
  loadWcssAdapterExport,
  normalizeWcssAuthoringAdapter,
  requireWcssRouteParam
} from "../../src/runtime-wcss-adapter.js";

export const bundleId = "bundle-wcss-authoring";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
    "wcss.document.read",
    "wcss.schema.read",
    "wcss.preview.session.create",
    "wcss.preview.document.patch",
    "wcss.preview.tokens.patch",
    "wcss.preview.session.clear"
  ]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "wcss.document.read",
    "wcss.schema.read",
    "wcss.preview.session.create",
    "wcss.preview.document.patch",
    "wcss.preview.tokens.patch",
    "wcss.preview.session.clear"
  ]),
  handlerMetadata: Object.freeze({
    "wcss.document.read": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["GET"])
    }),
    "wcss.schema.read": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["GET"])
    }),
    "wcss.preview.session.create": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["POST"])
    }),
    "wcss.preview.document.patch": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["PATCH"])
    }),
    "wcss.preview.tokens.patch": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["PATCH"])
    }),
    "wcss.preview.session.clear": Object.freeze({
      routeKind: "json",
      responseKind: "json",
      methods: Object.freeze(["DELETE"])
    })
  })
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze([]);

function snapshotRevision(requestSnapshot) {
  return Number(requestSnapshot?.appRevision || 0);
}

function normalizeTokenPatchOps(ops) {
  if (!Array.isArray(ops)) throw new Error("token patch ops must be an array");
  return ops.map((op, index) => {
    const kind = typeof op?.kind === "string" ? op.kind.trim() : "";
    const token = typeof op?.token === "string" ? op.token.trim() : "";
    if (!token) throw new Error(`token patch op ${index} is missing token`);
    if (kind === "set") {
      const value = typeof op?.value === "string" ? op.value.trim() : "";
      if (!value) throw new Error(`token patch op ${index} must set a non-empty value`);
      return { kind, token, value };
    }
    if (kind === "reset") {
      return { kind, token };
    }
    throw new Error(`unsupported token patch op ${kind || "<empty>"}`);
  });
}

function normalizeDocumentPatchOps(ops) {
  if (!Array.isArray(ops)) throw new Error("document patch ops must be an array");
  return ops.map((op, index) => {
    if (!op || typeof op !== "object" || Array.isArray(op)) {
      throw new Error(`document patch op ${index} must be an object`);
    }
    const kind = typeof op.kind === "string" ? op.kind.trim() : "";
    if (!kind) throw new Error(`document patch op ${index} is missing kind`);
    return structuredClone(op);
  });
}

function tokenOpsToDocumentPatchOps(ops) {
  return normalizeTokenPatchOps(ops).map(op => op.kind === "set"
    ? {
      kind: "token.set",
      token: op.token,
      value: op.value
    }
    : {
      kind: "token.reset",
      token: op.token
    });
}

function buildPreviewSessionRuntime() {
  const sessions = new Map();
  const readSession = ({
    previewSessionId,
    appRoot,
    adapterKey,
    requestSnapshot
  }) => {
    const session = sessions.get(previewSessionId);
    if (!session) throw new Error(`unknown preview session ${previewSessionId}`);
    if (session.appRoot !== appRoot || session.adapterKey !== adapterKey) {
      throw new Error(`preview session ${previewSessionId} does not match the requested adapter`);
    }
    if (session.snapshotRevision !== snapshotRevision(requestSnapshot)) {
      throw new Error(`preview session ${previewSessionId} no longer matches the active app snapshot`);
    }
    return session;
  };
  return {
    createSession({
      appRoot,
      adapterKey,
      requestSnapshot
    }) {
      const previewSessionId = randomUUID();
      const session = {
        previewSessionId,
        appRoot,
        adapterKey,
        snapshotRevision: snapshotRevision(requestSnapshot),
        version: 0,
        ops: []
      };
      sessions.set(previewSessionId, session);
      return {
        previewSessionId,
        version: session.version
      };
    },
    patchDocument({
      previewSessionId,
      appRoot,
      adapterKey,
      requestSnapshot,
      ops
    }) {
      const session = readSession({
        previewSessionId,
        appRoot,
        adapterKey,
        requestSnapshot
      });
      session.ops = [...session.ops, ...normalizeDocumentPatchOps(ops)];
      session.version += 1;
      return {
        previewSessionId: session.previewSessionId,
        version: session.version,
        ops: structuredClone(session.ops)
      };
    },
    patchTokens(args) {
      return this.patchDocument({
        ...args,
        ops: tokenOpsToDocumentPatchOps(args.ops)
      });
    },
    clearSession({
      previewSessionId,
      appRoot,
      adapterKey,
      requestSnapshot
    }) {
      readSession({
        previewSessionId,
        appRoot,
        adapterKey,
        requestSnapshot
      });
      sessions.delete(previewSessionId);
      return { ok: true, previewSessionId };
    },
    resolveSession({
      previewSessionId,
      appRoot,
      adapterKey,
      requestSnapshot
    }) {
      const session = readSession({
        previewSessionId,
        appRoot,
        adapterKey,
        requestSnapshot
      });
      return {
        previewSessionId: session.previewSessionId,
        version: session.version,
        ops: structuredClone(session.ops)
      };
    },
    close() {
      sessions.clear();
    }
  };
}

export const providers = Object.freeze([
  {
    kind: "providerRuntimeFactory",
    id: "wcss.previewSessions",
    factory: () => buildPreviewSessionRuntime()
  }
]);

async function loadAuthoringAdapter({
  route,
  appContext,
  importModule,
  fsModule
}) {
  const appRoot = appContext?.appRoot ?? null;
  const requestSnapshot = appContext?.requestSnapshot
    ?? appContext?.appSnapshotManager?.getActiveSnapshot?.()
    ?? null;
  const adapterModule = requireWcssRouteParam(route, "adapterModule", "wcss.document.read");
  const adapterExport = requireWcssRouteParam(route, "adapterExport", "wcss.document.read");
  const loaded = await loadWcssAdapterExport({
    appRoot,
    adapterModule,
    adapterExport,
    requestSnapshot,
    importModule,
    fsModule,
    handlerName: "wcss.document.read"
  });
  const adapterResult = await loaded.exported({
    appRoot,
    appContext,
    requestSnapshot
  });
  const adapter = normalizeWcssAuthoringAdapter(adapterResult);
  if (adapter.kind !== "authoring") {
    throw new Error("WCSS authoring routes require an authoring-capable adapter");
  }
  return {
    requestSnapshot,
    identity: loaded.identity,
    adapter
  };
}

function previewServiceFor(appContext) {
  const service = appContext?.providerRuntimes?.["wcss.previewSessions"] ?? null;
  if (!service) throw new Error("WCSS preview session service unavailable");
  return service;
}

export function createHandlers(deps = {}) {
  const {
    sendJson,
    readJson,
    importModule,
    fsModule = fs
  } = deps;

  async function readBody(req) {
    if (typeof readJson !== "function") return {};
    return readJson(req);
  }

  async function withAdapter(route, appContext) {
    return loadAuthoringAdapter({
      route,
      appContext,
      importModule,
      fsModule
    });
  }

  return {
    "wcss.document.read": async ({ res, route, appContext }) => {
      try {
        const { adapter } = await withAdapter(route, appContext);
        sendJson(res, 200, {
          document: adapter.document,
          tokenCatalog: adapter.tokenCatalog
        });
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss document read failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "wcss.schema.read": async ({ res, route, appContext }) => {
      try {
        const { adapter } = await withAdapter(route, appContext);
        sendJson(res, 200, {
          documentModel: "wcss",
          schema: adapter.schema
        });
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss schema read failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "wcss.preview.session.create": async ({ res, route, appContext }) => {
      try {
        const { identity, requestSnapshot } = await withAdapter(route, appContext);
        const created = previewServiceFor(appContext).createSession({
          appRoot: identity.appRoot,
          adapterKey: identity.key,
          requestSnapshot
        });
        sendJson(res, 200, created);
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss preview session create failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "wcss.preview.document.patch": async ({ req, res, route, appContext }) => {
      try {
        const body = await readBody(req);
        const previewSessionId = typeof body?.previewSessionId === "string" ? body.previewSessionId.trim() : "";
        if (!previewSessionId) throw new Error("previewSessionId is required");
        const { identity, requestSnapshot, adapter } = await withAdapter(route, appContext);
        const patched = previewServiceFor(appContext).patchDocument({
          previewSessionId,
          appRoot: identity.appRoot,
          adapterKey: identity.key,
          requestSnapshot,
          ops: body?.ops
        });
        adapter.applyPatch({ ops: patched.ops });
        sendJson(res, 200, {
          ok: true,
          previewSessionId: patched.previewSessionId,
          version: patched.version,
          ops: patched.ops
        });
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss preview document patch failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "wcss.preview.tokens.patch": async ({ req, res, route, appContext }) => {
      try {
        const body = await readBody(req);
        const previewSessionId = typeof body?.previewSessionId === "string" ? body.previewSessionId.trim() : "";
        if (!previewSessionId) throw new Error("previewSessionId is required");
        const { identity, requestSnapshot, adapter } = await withAdapter(route, appContext);
        const patched = previewServiceFor(appContext).patchTokens({
          previewSessionId,
          appRoot: identity.appRoot,
          adapterKey: identity.key,
          requestSnapshot,
          ops: body?.ops
        });
        adapter.applyPatch({ ops: patched.ops });
        sendJson(res, 200, {
          ok: true,
          previewSessionId: patched.previewSessionId,
          version: patched.version,
          ops: patched.ops
        });
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss preview token patch failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    },

    "wcss.preview.session.clear": async ({ req, res, route, appContext }) => {
      try {
        const body = await readBody(req);
        const previewSessionId = typeof body?.previewSessionId === "string" ? body.previewSessionId.trim() : "";
        if (!previewSessionId) throw new Error("previewSessionId is required");
        const { identity, requestSnapshot } = await withAdapter(route, appContext);
        const cleared = previewServiceFor(appContext).clearSession({
          previewSessionId,
          appRoot: identity.appRoot,
          adapterKey: identity.key,
          requestSnapshot
        });
        sendJson(res, 200, cleared);
      } catch (error) {
        sendJson(res, 500, {
          error: "wcss preview session clear failed",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  capabilities,
  providers,
  createHandlers
};
