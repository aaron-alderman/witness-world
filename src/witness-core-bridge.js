import { createHash } from "node:crypto";
import { createWitnessCoreIpcTransport, normalizeWitnessCoreTransportPipe } from "./witness-core-ipc-transport.js";
import { createWitnessCoreHttpTransport } from "./witness-core-http-transport.js";
import {
  WITNESS_CORE_TRANSPORT_METHODS,
  WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS,
  createWitnessCoreTransportCall,
  createWitnessCoreTransportSubscribe
} from "./witness-core-transport-contract.js";

export {
  createWitnessCoreRequestError,
  normalizeWitnessCoreUrl
} from "./witness-core-http-transport.js";
export { normalizeWitnessCoreTransportPipe } from "./witness-core-ipc-transport.js";

export function latestWitnessCoreGeneration(status = null) {
  const generations = Array.isArray(status?.generations) ? status.generations : [];
  return generations[generations.length - 1] ?? null;
}

export function latestWitnessCoreState(status = null) {
  return typeof latestWitnessCoreGeneration(status)?.state === "string"
    ? latestWitnessCoreGeneration(status).state
    : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .reduce((result, key) => {
        result[key] = stableValue(value[key]);
        return result;
      }, {});
  }
  return value ?? null;
}

export function previewGenerationContentHash({
  sessionId = null,
  baseAppRevision = 0,
  previewRevision = 0,
  overlaySources = null,
  candidates = []
} = {}) {
  const overlayEntries = [...new Map(overlaySources ?? [])]
    .map(([filePath, content]) => [String(filePath || ""), String(content ?? "")])
    .sort((left, right) => left[0].localeCompare(right[0]));
  const payload = stableValue({
    sessionId: sessionId ? String(sessionId) : null,
    baseAppRevision: Number(baseAppRevision || 0),
    previewRevision: Number(previewRevision || 0),
    overlaySources: overlayEntries,
    candidates: Array.isArray(candidates) ? candidates : []
  });
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function normalizeSourcePaths(sourcePaths = []) {
  return [...new Set((Array.isArray(sourcePaths) ? sourcePaths : [])
    .map(entry => String(entry ?? "").trim())
    .filter(Boolean))];
}

function cloneSessionPayload(session = null) {
  return session && typeof session === "object" ? structuredClone(session) : null;
}

function createTransport({
  coreUrl = null,
  pipePath = null,
  fetchImpl = null,
  logger = null,
  transport = null
} = {}) {
  if (transport) return transport;
  const normalizedPipePath = normalizeWitnessCoreTransportPipe(
    pipePath
    ?? process.env.WITNESS_CORE_TRANSPORT_PIPE
    ?? null
  );
  if (normalizedPipePath) {
    const ipcTransport = createWitnessCoreIpcTransport({
      pipePath: normalizedPipePath,
      logger
    });
    if (ipcTransport) return ipcTransport;
  }
  return createWitnessCoreHttpTransport({
    coreUrl,
    fetchImpl: fetchImpl ?? globalThis.fetch,
    logger
  });
}

function createCallInvoker(transport) {
  if (!transport || typeof transport.call !== "function") return null;
  return async (method, args = null, requestId = null) => {
    return await transport.call(createWitnessCoreTransportCall({
      method,
      requestId,
      args
    }));
  };
}

function createSubscribeInvoker(transport) {
  if (!transport || typeof transport.subscribe !== "function") return null;
  return async (channel, args = null, requestId = null, options = null) => {
    const subscription = createWitnessCoreTransportSubscribe({
      channel,
      requestId,
      args
    });
    if (options && typeof options === "object") {
      if (Object.prototype.hasOwnProperty.call(options, "signal")) {
        subscription.signal = options.signal;
      }
    }
    return await transport.subscribe(subscription);
  };
}

export function createWitnessCoreBridge({
  coreUrl = null,
  pipePath = null,
  fetchImpl = null,
  logger = null,
  transport = null
} = {}) {
  const effectiveTransport = createTransport({
    coreUrl,
    pipePath,
    fetchImpl,
    logger,
    transport
  });
  if (!effectiveTransport) return null;
  const call = createCallInvoker(effectiveTransport);
  if (!call) return null;

  return {
    coreUrl: effectiveTransport.coreUrl,
    async publishGeneration({
      id = null,
      state = "candidate",
      contentHash,
      parentId = null,
      sourcePaths = [],
      correlation = null,
      promotionDecision = null,
      eventKind = null,
      message = null
    } = {}) {
      const hash = String(contentHash ?? "").trim();
      if (!hash) throw new Error("contentHash is required");
      const form = new URLSearchParams();
      if (id) form.set("id", String(id));
      form.set("state", String(state || "candidate"));
      form.set("contentHash", hash);
      if (parentId) form.set("parentId", String(parentId));
      form.set("sourcePaths", JSON.stringify(normalizeSourcePaths(sourcePaths)));
      if (correlation?.sessionId) form.set("sessionId", String(correlation.sessionId));
      if (correlation?.surfaceId) form.set("surfaceId", String(correlation.surfaceId));
      if (correlation?.actor) form.set("actor", String(correlation.actor));
      if (promotionDecision) form.set("promotionDecision", String(promotionDecision));
      if (eventKind) form.set("eventKind", String(eventKind));
      if (message) form.set("message", String(message));
      try {
        return await call(WITNESS_CORE_TRANSPORT_METHODS.generationPublish, {
          form: form.toString()
        });
      } catch (error) {
        logger?.warn?.("witnessCore.publishGeneration failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    },
    async readSource({
      path = "",
      encoding = null,
      correlation = null
    } = {}) {
      const sourcePath = String(path || "").trim();
      if (!sourcePath) throw new Error("source path is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sourceRead, {
        query: {
          path: sourcePath,
          ...(typeof encoding === "string" && encoding.trim() ? { encoding: encoding.trim() } : {}),
          ...(correlation?.sessionId ? { sessionId: String(correlation.sessionId) } : {}),
          ...(correlation?.surfaceId ? { surfaceId: String(correlation.surfaceId) } : {}),
          ...(correlation?.actor ? { actor: String(correlation.actor) } : {})
        }
      });
    },
    async statSource({
      path = "",
      correlation = null
    } = {}) {
      const sourcePath = String(path || "").trim();
      if (!sourcePath) throw new Error("source path is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sourceStat, {
        query: {
          path: sourcePath,
          ...(correlation?.sessionId ? { sessionId: String(correlation.sessionId) } : {}),
          ...(correlation?.surfaceId ? { surfaceId: String(correlation.surfaceId) } : {}),
          ...(correlation?.actor ? { actor: String(correlation.actor) } : {})
        }
      });
    },
    async listSourceDirectory({
      path = "",
      correlation = null
    } = {}) {
      const sourcePath = String(path || "").trim();
      if (!sourcePath) throw new Error("source path is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sourceList, {
        query: {
          path: sourcePath,
          ...(correlation?.sessionId ? { sessionId: String(correlation.sessionId) } : {}),
          ...(correlation?.surfaceId ? { surfaceId: String(correlation.surfaceId) } : {}),
          ...(correlation?.actor ? { actor: String(correlation.actor) } : {})
        }
      });
    },
    async writeSource({
      path = "",
      content = null,
      expectedHash = null,
      reason = null,
      previewOnly = false,
      correlation = null
    } = {}) {
      const sourcePath = String(path || "").trim();
      if (!sourcePath) throw new Error("source path is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sourceWrite, {
        body: {
          path: sourcePath,
          content: String(content ?? ""),
          expectedHash: typeof expectedHash === "string" && expectedHash.trim() ? expectedHash.trim() : null,
          reason: reason ? String(reason) : null,
          previewOnly: previewOnly === true,
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async patchSource({
      path = "",
      content = null,
      expectedHash = null,
      reason = null,
      previewOnly = false,
      correlation = null
    } = {}) {
      const sourcePath = String(path || "").trim();
      if (!sourcePath) throw new Error("source path is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sourcePatch, {
        body: {
          path: sourcePath,
          content: String(content ?? ""),
          expectedHash: typeof expectedHash === "string" && expectedHash.trim() ? expectedHash.trim() : null,
          reason: reason ? String(reason) : null,
          previewOnly: previewOnly === true,
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async verificationPersistenceRequest(body = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.verificationPersistenceRequest, {
        body: body && typeof body === "object" ? body : {}
      });
    },
    async executeHttpOutbound({
      url,
      method = "GET",
      headers = {},
      bodyText = null,
      timeoutMs = null,
      correlation = null
    } = {}) {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) throw new Error("url is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.httpOutboundExecute, {
        body: {
          url: normalizedUrl,
          method: String(method || "GET").trim() || "GET",
          headers: headers && typeof headers === "object" ? headers : {},
          bodyText: bodyText == null ? null : String(bodyText),
          timeoutMs: Number.isFinite(timeoutMs) ? Number(timeoutMs) : null,
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async sqliteTestConnection({
      path,
      migrationTable = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqliteTestConnection, {
        body: {
          operation: "testConnection",
          path: String(path || ""),
          migrationTable: migrationTable ? String(migrationTable) : null
        }
      });
    },
    async sqliteMigrate({
      path,
      migrationTable,
      migrations = []
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqliteMigrate, {
        body: {
          operation: "migrate",
          path: String(path || ""),
          migrationTable: migrationTable ? String(migrationTable) : null,
          migrations: Array.isArray(migrations) ? migrations : []
        }
      });
    },
    async sqliteQuery({
      path,
      sql,
      params = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqliteQuery, {
        body: {
          operation: "query",
          path: String(path || ""),
          sql: String(sql || ""),
          params
        }
      });
    },
    async sqliteCommand({
      path,
      sql,
      params = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqliteCommand, {
        body: {
          operation: "command",
          path: String(path || ""),
          sql: String(sql || ""),
          params
        }
      });
    },
    async sqliteTransaction({
      path,
      steps = []
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqliteTransaction, {
        body: {
          operation: "transaction",
          path: String(path || ""),
          steps: Array.isArray(steps) ? steps : []
        }
      });
    },
    async sqlTestConnection({
      provider,
      connection = {},
      correlation = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqlTestConnection, {
        body: {
          operation: "testConnection",
          provider: String(provider || ""),
          connection: connection && typeof connection === "object" ? connection : {},
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async sqlReadOrderedBatch({
      provider,
      connection = {},
      schema = "",
      table = "",
      columns = [],
      progressField = "",
      lowerBound = null,
      rowLimit = 500,
      correlation = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqlReadOrderedBatch, {
        body: {
          operation: "readOrderedBatch",
          provider: String(provider || ""),
          connection: connection && typeof connection === "object" ? connection : {},
          schema: String(schema ?? ""),
          table: String(table ?? ""),
          columns: Array.isArray(columns) ? columns : [],
          progressField: String(progressField ?? ""),
          lowerBound,
          rowLimit: Number(rowLimit ?? 500),
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async sqlWriteRows({
      provider,
      connection = {},
      schema = "",
      table = "",
      rows = [],
      writeMode = "",
      keyFields = [],
      correlation = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.sqlWriteRows, {
        body: {
          operation: "writeRows",
          provider: String(provider || ""),
          connection: connection && typeof connection === "object" ? connection : {},
          schema: String(schema ?? ""),
          table: String(table ?? ""),
          rows: Array.isArray(rows) ? rows : [],
          writeMode: String(writeMode ?? ""),
          keyFields: Array.isArray(keyFields) ? keyFields : [],
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async publishedAuthoringTransaction({
      manifestPath,
      runtimeProfile = "authoring",
      edits = [],
      correlation = null
    } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.publishedAuthoringTransaction, {
        body: {
          manifestPath: String(manifestPath || ""),
          runtimeProfile: String(runtimeProfile || "authoring"),
          edits: Array.isArray(edits) ? edits : [],
          sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
          surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
          actor: correlation?.actor ? String(correlation.actor) : null
        }
      });
    },
    async createPreviewSession({ session } = {}) {
      const payload = cloneSessionPayload(session);
      if (!payload?.id) throw new Error("preview session id is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.previewSessionCreate, {
        body: payload
      });
    },
    async readPreviewSession({ id } = {}) {
      const previewSessionId = String(id || "").trim();
      if (!previewSessionId) throw new Error("preview session id is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.previewSessionRead, {
        id: previewSessionId
      });
    },
    async writePreviewSession({ id, session } = {}) {
      const previewSessionId = String(id || session?.id || "").trim();
      const payload = cloneSessionPayload(session);
      if (!previewSessionId) throw new Error("preview session id is required");
      if (!payload?.id) throw new Error("preview session payload id is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.previewSessionWrite, {
        id: previewSessionId,
        body: payload
      });
    },
    async deletePreviewSession({ id } = {}) {
      const previewSessionId = String(id || "").trim();
      if (!previewSessionId) throw new Error("preview session id is required");
      const payload = await call(WITNESS_CORE_TRANSPORT_METHODS.previewSessionDelete, {
        id: previewSessionId
      });
      if (payload === false) return false;
      return payload?.ok !== false;
    },
    async promoteGeneration({ id } = {}) {
      const generationId = String(id || "").trim();
      if (!generationId) throw new Error("generation id is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.generationPromote, {
        id: generationId
      });
    },
    async rollbackGeneration({ id } = {}) {
      const generationId = String(id || "").trim();
      if (!generationId) throw new Error("generation id is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.generationRollback, {
        id: generationId
      });
    },
    async shadowInvokeComputeModule({
      hostOperation,
      inputJson,
      jsResultJson
    } = {}) {
      const normalizedHostOperation = String(hostOperation || "").trim();
      const normalizedInputJson = String(inputJson || "").trim();
      const normalizedJsResultJson = String(jsResultJson || "").trim();
      if (!normalizedHostOperation) throw new Error("hostOperation is required");
      if (!normalizedInputJson) throw new Error("inputJson is required");
      if (!normalizedJsResultJson) throw new Error("jsResultJson is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.computeModuleShadowInvoke, {
        body: {
          hostOperation: normalizedHostOperation,
          inputJson: normalizedInputJson,
          jsResultJson: normalizedJsResultJson
        }
      });
    },
    async readServing() {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.servingRead);
    },
    async requestServeLive() {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.servingRequestLive);
    },
    async requestServeStable() {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.servingRequestStable);
    },
    async readSoak() {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakRead);
    },
    async startSoakSession({ id = null, scenario = "soak" } = {}) {
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakStart, {
        body: {
          ...(id ? { id: String(id) } : {}),
          scenario: String(scenario || "soak")
        }
      });
    },
    async markSoakSession({ sessionId, phase, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      if (!phase) throw new Error("phase is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakMark, {
        body: {
          sessionId: String(sessionId),
          phase: String(phase),
          ...(message ? { message: String(message) } : {})
        }
      });
    },
    async recordSoakSample({ sessionId, sample = {} } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakSample, {
        body: {
          sessionId: String(sessionId),
          ...(sample && typeof sample === "object" ? sample : {})
        }
      });
    },
    async completeSoakSession({ sessionId, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakComplete, {
        body: {
          sessionId: String(sessionId),
          ...(message ? { message: String(message) } : {})
        }
      });
    },
    async failSoakSession({ sessionId, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await call(WITNESS_CORE_TRANSPORT_METHODS.soakFail, {
        body: {
          sessionId: String(sessionId),
          ...(message ? { message: String(message) } : {})
        }
      });
    }
  };
}

export function createWitnessCoreStatusStore({
  coreUrl = null,
  pipePath = null,
  fetchImpl = null,
  pollMs = 2500,
  logger = null,
  transport = null
} = {}) {
  const effectiveTransport = createTransport({
    coreUrl,
    pipePath,
    fetchImpl,
    logger,
    transport
  });
  if (!effectiveTransport) return null;
  const call = createCallInvoker(effectiveTransport);
  const subscribe = createSubscribeInvoker(effectiveTransport);
  if (!call || !subscribe) return null;

  let currentStatus = null;
  let timer = null;
  let listeners = new Set();
  let pollPromise = null;
  let closed = false;
  let eventsAbortController = null;

  const emit = event => {
    const payload = event && typeof event === "object" ? structuredClone(event) : null;
    for (const listener of listeners) {
      try {
        listener(payload);
      } catch (error) {
        logger?.warn?.("witnessCore.status.listener failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };

  const mergeGeneration = generation => {
    if (!generation || typeof generation !== "object" || !String(generation.id || "").trim()) return;
    const existing = Array.isArray(currentStatus?.generations) ? [...currentStatus.generations] : [];
    const generationId = String(generation.id);
    const nextGeneration = structuredClone(generation);
    const index = existing.findIndex(candidate => String(candidate?.id || "") === generationId);
    if (index >= 0) existing[index] = nextGeneration;
    else existing.push(nextGeneration);
    const aliases = { ...(currentStatus?.aliases ?? {}) };
    if (nextGeneration.state === "green_local") aliases.current_green_local = generationId;
    if (nextGeneration.state === "stable") {
      aliases.current_stable = generationId;
      aliases.last_good = generationId;
    }
    currentStatus = {
      ...(currentStatus ?? {}),
      service: currentStatus?.service ?? "witness-core",
      ok: currentStatus?.ok !== false,
      generations: existing,
      aliases
    };
  };

  const poll = async () => {
    try {
      const [generations, health, serving] = await Promise.all([
        call(WITNESS_CORE_TRANSPORT_METHODS.statusReadGenerations).catch(() => null),
        call(WITNESS_CORE_TRANSPORT_METHODS.statusReadHealth).catch(() => null),
        call(WITNESS_CORE_TRANSPORT_METHODS.statusReadServing).catch(() => null)
      ]);
      if (!generations && !health && !serving) return;
      currentStatus = {
        ...(generations ?? currentStatus ?? {}),
        serving: serving ?? currentStatus?.serving ?? generations?.serving ?? null,
        process: health?.process ?? currentStatus?.process ?? null,
        soak: health?.soak ?? currentStatus?.soak ?? generations?.soak ?? null,
        service: health?.service ?? currentStatus?.service ?? "witness-core",
        ok: health?.ok !== false
      };
    } catch (error) {
      logger?.warn?.("witnessCore.status.poll failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const refreshNow = async () => {
    if (pollPromise) {
      await pollPromise;
      return;
    }
    pollPromise = poll().finally(() => {
      pollPromise = null;
    });
    await pollPromise;
  };

  const handleCoreEvent = async (eventType, payload) => {
    const kind = String(eventType || payload?.kind || "message");
    if (payload?.generation) mergeGeneration(payload.generation);
    if (kind === "core.connected") {
      currentStatus = {
        ...(currentStatus ?? {}),
        service: currentStatus?.service ?? "witness-core",
        ok: true
      };
    }
    emit({
      kind,
      payload
    });
    if (
      kind.startsWith("generation.")
      || kind.startsWith("proof.")
      || kind.startsWith("serving.")
      || kind.startsWith("process.")
    ) {
      await refreshNow();
    }
  };

  const connectEvents = async () => {
    const abortController = typeof AbortController === "function" ? new AbortController() : null;
    eventsAbortController = abortController;
    try {
      const response = await subscribe(WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents, {
      }, null, {
        signal: abortController?.signal ?? null
      });
      if (!response?.ok || !response.body?.getReader) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!closed) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replaceAll("\r\n", "\n");
        while (true) {
          const boundary = buffer.indexOf("\n\n");
          if (boundary < 0) break;
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split("\n");
          let eventType = "message";
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim() || "message";
            if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          const data = dataLines.join("\n").trim();
          if (!data) continue;
          try {
            await handleCoreEvent(eventType, JSON.parse(data));
          } catch (error) {
            logger?.warn?.("witnessCore.status.event failed", {
              eventType,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }
    } catch (error) {
      if (!closed) {
        logger?.warn?.("witnessCore.status.events failed", {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };

  void refreshNow();
  void connectEvents();
  timer = setInterval(() => {
    void refreshNow();
  }, Math.max(250, Number(pollMs || 2500)));
  timer?.unref?.();

  return {
    coreUrl: effectiveTransport.coreUrl,
    getStatus() {
      return currentStatus ? structuredClone(currentStatus) : null;
    },
    getLatestState() {
      return latestWitnessCoreState(currentStatus);
    },
    getProcessState() {
      return currentStatus?.process ? structuredClone(currentStatus.process) : null;
    },
    async refresh() {
      await refreshNow();
      return this.getStatus();
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      if (timer != null) clearInterval(timer);
      timer = null;
      listeners.clear();
      try {
        eventsAbortController?.abort?.();
      } catch {}
      eventsAbortController = null;
    }
  };
}
