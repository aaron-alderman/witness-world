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
  const lookupSession = ({
    previewSessionId,
    appRoot,
    adapterKey
  }) => {
    const session = sessions.get(previewSessionId);
    if (!session) throw new Error(`unknown preview session ${previewSessionId}`);
    if (session.appRoot !== appRoot || session.adapterKey !== adapterKey) {
      throw new Error(`preview session ${previewSessionId} does not match the requested adapter`);
    }
    return session;
  };
  const readSession = ({
    previewSessionId,
    appRoot,
    adapterKey,
    requestSnapshot
  }) => {
    const session = lookupSession({
      previewSessionId,
      appRoot,
      adapterKey
    });
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
      lookupSession({
        previewSessionId,
        appRoot,
        adapterKey
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
    generationBridge: appContext?.witnessCoreBridge ?? null,
    requireGenerationBridgeForCanonicalImports: Boolean(appContext?.witnessCoreUrl),
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

function requestedPreviewSessionId(requestUrl = null) {
  return requestUrl?.searchParams?.get("previewSessionId")?.trim()
    || requestUrl?.searchParams?.get("wcssPreview")?.trim()
    || "";
}

function sessionPreviewForRequest({
  requestUrl,
  appContext,
  identity,
  requestSnapshot
} = {}) {
  const previewSessionId = requestedPreviewSessionId(requestUrl);
  if (!previewSessionId) return null;
  return previewServiceFor(appContext).resolveSession({
    previewSessionId,
    appRoot: identity.appRoot,
    adapterKey: identity.key,
    requestSnapshot
  });
}

function applyPreviewDocumentIfNeeded(adapter, previewSession = null) {
  if (!previewSession) return adapter.document;
  if (typeof adapter?.applyPatch !== "function") {
    throw new Error("wcss preview requires an authoring-capable adapter");
  }
  return adapter.applyPatch({ ops: previewSession.ops });
}

function updatedSchemaForPreview(schema, patchedDocument) {
  if (!schema || typeof schema !== "object" || !patchedDocument || typeof patchedDocument !== "object") {
    return schema;
  }
  const patchedTokens = new Map((patchedDocument.tokens ?? []).map(token => [token.name, token.value]));
  const patchedSchema = structuredClone(schema);
  for (const token of patchedSchema.tokens ?? []) {
    if (!token?.name || !patchedTokens.has(token.name)) continue;
    token.currentValue = patchedTokens.get(token.name);
  }
  const stylesByName = new Map((patchedDocument.styles ?? []).map(style => [style.name, style]));
  for (const style of patchedSchema.styles ?? []) {
    const patchedStyle = stylesByName.get(style?.name) ?? null;
    if (!patchedStyle) continue;
    const patchFieldGroup = (schemaFields = [], patchedFields = []) => {
      const patchedByField = new Map((patchedFields ?? []).map(field => [field.field, field.value]));
      for (const field of schemaFields ?? []) {
        if (!field?.field || !patchedByField.has(field.field)) continue;
        field.value = patchedByField.get(field.field);
      }
    };
    patchFieldGroup(style.fields, patchedStyle.fields);
    const patchedStatesByName = new Map((patchedStyle.states ?? []).map(state => [state.name, state]));
    for (const state of style.states ?? []) {
      const patchedState = patchedStatesByName.get(state?.name) ?? null;
      if (!patchedState) continue;
      patchFieldGroup(state.fields, patchedState.fields);
    }
    const patchedPartsByName = new Map((patchedStyle.parts ?? []).map(part => [part.name, part]));
    for (const part of style.parts ?? []) {
      const patchedPart = patchedPartsByName.get(part?.name) ?? null;
      if (!patchedPart) continue;
      patchFieldGroup(part.fields, patchedPart.fields);
      const patchedPartStatesByName = new Map((patchedPart.states ?? []).map(state => [state.name, state]));
      for (const state of part.states ?? []) {
        const patchedState = patchedPartStatesByName.get(state?.name) ?? null;
        if (!patchedState) continue;
        patchFieldGroup(state.fields, patchedState.fields);
      }
    }
  }
  return patchedSchema;
}

function replayPreviewOpsIntoSchema(schema, ops = []) {
  if (!schema || typeof schema !== "object" || !Array.isArray(ops) || ops.length === 0) return schema;
  const patchedSchema = structuredClone(schema);
  const tokenByName = new Map((patchedSchema.tokens ?? []).map(token => [token.name, token]));
  const styleByName = new Map((patchedSchema.styles ?? []).map(style => [style.name, style]));
  const findContainer = (styleName, partName = null) => {
    const style = styleByName.get(styleName) ?? null;
    if (!style) return null;
    if (!partName) return style;
    return (style.parts ?? []).find(part => part.name === partName) ?? null;
  };
  const findState = (container, stateName) => (container?.states ?? []).find(state => state.name === stateName) ?? null;
  const setField = (fields, fieldName, value) => {
    const field = (fields ?? []).find(entry => entry.field === fieldName) ?? null;
    if (field) field.value = value;
  };
  for (const op of ops) {
    const kind = typeof op?.kind === "string" ? op.kind.trim() : "";
    if (kind === "token.set") {
      const token = tokenByName.get(op.token) ?? null;
      if (token) token.currentValue = op.value;
      continue;
    }
    if (kind === "style.field.set") {
      const container = findContainer(op.style, op.part);
      if (container) setField(container.fields, op.field, op.value);
      continue;
    }
    if (kind === "style.state_field.set") {
      const container = findContainer(op.style, op.part);
      const state = findState(container, op.state);
      if (state) setField(state.fields, op.field, op.value);
    }
  }
  return patchedSchema;
}

function wcssErrorPayload(errorLabel, error) {
  const payload = {
    error: errorLabel,
    message: error instanceof Error ? error.message : String(error)
  };
  if (typeof error?.code === "string" && error.code) payload.code = error.code;
  return payload;
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
    "wcss.document.read": async ({ res, route, appContext, requestUrl }) => {
      try {
        const { adapter, identity, requestSnapshot } = await withAdapter(route, appContext);
        const previewSession = sessionPreviewForRequest({
          requestUrl,
          appContext,
          identity,
          requestSnapshot
        });
        const document = applyPreviewDocumentIfNeeded(adapter, previewSession);
        sendJson(res, 200, {
          document,
          tokenCatalog: adapter.tokenCatalog,
          previewSession: previewSession
            ? {
                previewSessionId: previewSession.previewSessionId,
                version: previewSession.version
              }
            : null
        });
      } catch (error) {
        sendJson(res, 500, wcssErrorPayload("wcss document read failed", error));
      }
    },

    "wcss.schema.read": async ({ res, route, appContext, requestUrl }) => {
      try {
        const { adapter, identity, requestSnapshot } = await withAdapter(route, appContext);
        const previewSession = sessionPreviewForRequest({
          requestUrl,
          appContext,
          identity,
          requestSnapshot
        });
        const document = applyPreviewDocumentIfNeeded(adapter, previewSession);
        const schema = replayPreviewOpsIntoSchema(
          updatedSchemaForPreview(adapter.schema, document),
          previewSession?.ops ?? []
        );
        sendJson(res, 200, {
          documentModel: "wcss",
          schema,
          previewSession: previewSession
            ? {
                previewSessionId: previewSession.previewSessionId,
                version: previewSession.version
              }
            : null
        });
      } catch (error) {
        sendJson(res, 500, wcssErrorPayload("wcss schema read failed", error));
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
        sendJson(res, 500, wcssErrorPayload("wcss preview session create failed", error));
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
        sendJson(res, 500, wcssErrorPayload("wcss preview document patch failed", error));
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
        sendJson(res, 500, wcssErrorPayload("wcss preview token patch failed", error));
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
        sendJson(res, 500, wcssErrorPayload("wcss preview session clear failed", error));
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
