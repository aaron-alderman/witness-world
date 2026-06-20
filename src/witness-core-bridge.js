import { createHash } from "node:crypto";

export function normalizeWitnessCoreUrl(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\/$/, "") : "";
}

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

function createWitnessCoreRequestError(message, {
  status = 500,
  code = null,
  details = null
} = {}) {
  const error = new Error(message);
  error.status = Number(status || 500);
  if (code) error.code = String(code);
  if (details && typeof details === "object") Object.assign(error, details);
  return error;
}

export function createWitnessCoreBridge({
  coreUrl = null,
  fetchImpl = globalThis.fetch,
  logger = null
} = {}) {
  const normalizedCoreUrl = normalizeWitnessCoreUrl(coreUrl);
  if (!normalizedCoreUrl || typeof fetchImpl !== "function") return null;

  const publishGeneration = async ({
    id = null,
    state = "candidate",
    contentHash,
    parentId = null,
    sourcePaths = [],
    correlation = null,
    promotionDecision = null,
    eventKind = null,
    message = null
  } = {}) => {
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
    const response = await fetchImpl(`${normalizedCoreUrl}/generations`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=utf-8"
      },
      body: form.toString()
    });
    if (!response?.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`witness core generation publish failed (${response?.status || "unknown"}): ${details || "request rejected"}`);
    }
    return response.json();
  };

  const postJson = async (endpoint, {
    method = "POST",
    body = null
  } = {}) => {
    const options = { method };
    if (body != null) {
      options.headers = { "content-type": "application/json; charset=utf-8" };
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(`${normalizedCoreUrl}${endpoint}`, options);
    } catch (error) {
      throw createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      });
    }
    if (!response?.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const details = payload && typeof payload === "object" ? payload : null;
      const message = typeof details?.error === "string" && details.error
        ? details.error
        : "request rejected";
      throw createWitnessCoreRequestError(
        `witness core request failed (${response?.status || "unknown"}): ${message}`,
        {
          status: response?.status || 500,
          code: typeof details?.code === "string" && details.code
            ? details.code
            : (response?.status === 409 ? "WITNESS_CORE_SOURCE_CONFLICT" : null),
          details
        }
      );
    }
    return await response.json();
  };

  const sourceCapabilityRequest = async (method, endpoint, {
    path = "",
    encoding = null,
    content = null,
    expectedHash = null,
    reason = null,
    previewOnly = false,
    correlation = null
  } = {}) => {
    const sourcePath = String(path || "").trim();
    if (!sourcePath) throw new Error("source path is required");
    const url = new URL(`${normalizedCoreUrl}${endpoint}`);
    const options = { method };
    if (method === "GET") {
      url.searchParams.set("path", sourcePath);
      if (typeof encoding === "string" && encoding.trim()) {
        url.searchParams.set("encoding", encoding.trim());
      }
      if (correlation?.sessionId) url.searchParams.set("sessionId", String(correlation.sessionId));
      if (correlation?.surfaceId) url.searchParams.set("surfaceId", String(correlation.surfaceId));
      if (correlation?.actor) url.searchParams.set("actor", String(correlation.actor));
    } else {
      options.headers = { "content-type": "application/json; charset=utf-8" };
      options.body = JSON.stringify({
        path: sourcePath,
        content: String(content ?? ""),
        expectedHash: typeof expectedHash === "string" && expectedHash.trim() ? expectedHash.trim() : null,
        reason: reason ? String(reason) : null,
        previewOnly: previewOnly === true,
        sessionId: correlation?.sessionId ? String(correlation.sessionId) : null,
        surfaceId: correlation?.surfaceId ? String(correlation.surfaceId) : null,
        actor: correlation?.actor ? String(correlation.actor) : null
      });
    }
    let response;
    try {
      response = await fetchImpl(String(url), options);
    } catch (error) {
      throw createWitnessCoreRequestError("witness core unavailable", {
        status: 503,
        code: "WITNESS_CORE_UNAVAILABLE",
        details: {
          cause: error instanceof Error ? error.message : String(error)
        }
      });
    }
    if (!response?.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      const details = payload && typeof payload === "object" ? payload : null;
      const message = typeof details?.error === "string" && details.error
        ? details.error
        : "request rejected";
      throw createWitnessCoreRequestError(
        `witness core source capability failed (${response?.status || "unknown"}): ${message}`,
        {
          status: response?.status || 500,
          code: typeof details?.code === "string" && details.code
            ? details.code
            : (response?.status === 409 ? "WITNESS_CORE_SOURCE_CONFLICT" : null),
          details
        }
      );
    }
    return await response.json();
  };

  return {
    coreUrl: normalizedCoreUrl,
    async publishGeneration(input = {}) {
      try {
        return await publishGeneration(input);
      } catch (error) {
        logger?.warn?.("witnessCore.publishGeneration failed", {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    },
    async readSource(input = {}) {
      return await sourceCapabilityRequest("GET", "/capabilities/fs/read", input);
    },
    async statSource(input = {}) {
      return await sourceCapabilityRequest("GET", "/capabilities/fs/stat", input);
    },
    async listSourceDirectory(input = {}) {
      return await sourceCapabilityRequest("GET", "/capabilities/fs/list", input);
    },
    async writeSource(input = {}) {
      return await sourceCapabilityRequest("PUT", "/capabilities/fs/write", input);
    },
    async patchSource(input = {}) {
      return await sourceCapabilityRequest("POST", "/capabilities/fs/patch", input);
    },
    async verificationPersistenceRequest(body = {}) {
      return await postJson("/verification-persistence", {
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
      return await postJson("/capabilities/network/http-outbound", {
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
      return await postJson("/capabilities/db/sqlite", {
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
      return await postJson("/capabilities/db/sqlite", {
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
      return await postJson("/capabilities/db/sqlite", {
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
      return await postJson("/capabilities/db/sqlite", {
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
      return await postJson("/capabilities/db/sqlite", {
        body: {
          operation: "transaction",
          path: String(path || ""),
          steps: Array.isArray(steps) ? steps : []
        }
      });
    },
    async publishedAuthoringTransaction({
      manifestPath,
      runtimeProfile = "authoring",
      edits = [],
      correlation = null
    } = {}) {
      return await postJson("/transactions/published-authoring", {
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
      return await postJson("/preview-sessions", {
        method: "POST",
        body: payload
      });
    },
    async readPreviewSession({ id } = {}) {
      const previewSessionId = String(id || "").trim();
      if (!previewSessionId) throw new Error("preview session id is required");
      const response = await fetchImpl(`${normalizedCoreUrl}/preview-sessions/${encodeURIComponent(previewSessionId)}`, {
        cache: "no-store"
      });
      if (response?.status === 404) return null;
      if (!response?.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`witness core preview session read failed (${response?.status || "unknown"}): ${details || "request rejected"}`);
      }
      return await response.json();
    },
    async writePreviewSession({ id, session } = {}) {
      const previewSessionId = String(id || session?.id || "").trim();
      const payload = cloneSessionPayload(session);
      if (!previewSessionId) throw new Error("preview session id is required");
      if (!payload?.id) throw new Error("preview session payload id is required");
      return await postJson(`/preview-sessions/${encodeURIComponent(previewSessionId)}`, {
        method: "PUT",
        body: payload
      });
    },
    async deletePreviewSession({ id } = {}) {
      const previewSessionId = String(id || "").trim();
      if (!previewSessionId) throw new Error("preview session id is required");
      const response = await fetchImpl(`${normalizedCoreUrl}/preview-sessions/${encodeURIComponent(previewSessionId)}`, {
        method: "DELETE"
      });
      if (response?.status === 404) return false;
      if (!response?.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`witness core preview session delete failed (${response?.status || "unknown"}): ${details || "request rejected"}`);
      }
      const payload = await response.json().catch(() => ({ ok: true }));
      return payload?.ok !== false;
    },
    async promoteGeneration({ id } = {}) {
      const generationId = String(id || "").trim();
      if (!generationId) throw new Error("generation id is required");
      return await postJson(`/generations/${encodeURIComponent(generationId)}/promote`);
    },
    async rollbackGeneration({ id } = {}) {
      const generationId = String(id || "").trim();
      if (!generationId) throw new Error("generation id is required");
      return await postJson(`/generations/${encodeURIComponent(generationId)}/rollback`);
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
      return await postJson("/compute-modules/shadow-invoke", {
        body: {
          hostOperation: normalizedHostOperation,
          inputJson: normalizedInputJson,
          jsResultJson: normalizedJsResultJson
        }
      });
    },
    async readServing() {
      const response = await fetchImpl(`${normalizedCoreUrl}/serving`, { cache: "no-store" });
      if (!response?.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`witness core serving read failed (${response?.status || "unknown"}): ${details || "request rejected"}`);
      }
      return await response.json();
    },
    async requestServeLive() {
      return await postJson("/serving/live");
    },
    async requestServeStable() {
      return await postJson("/serving/stable");
    },
    async readSoak() {
      const response = await fetchImpl(`${normalizedCoreUrl}/soak`, { cache: "no-store" });
      if (!response?.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`witness core soak read failed (${response?.status || "unknown"}): ${details || "request rejected"}`);
      }
      return await response.json();
    },
    async startSoakSession({ id = null, scenario = "soak" } = {}) {
      return await postJson("/soak/start", {
        body: {
          ...(id ? { id: String(id) } : {}),
          scenario: String(scenario || "soak")
        }
      });
    },
    async markSoakSession({ sessionId, phase, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      if (!phase) throw new Error("phase is required");
      return await postJson("/soak/mark", {
        body: {
          sessionId: String(sessionId),
          phase: String(phase),
          ...(message ? { message: String(message) } : {})
        }
      });
    },
    async recordSoakSample({ sessionId, sample = {} } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await postJson("/soak/sample", {
        body: {
          sessionId: String(sessionId),
          ...(sample && typeof sample === "object" ? sample : {})
        }
      });
    },
    async completeSoakSession({ sessionId, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await postJson("/soak/complete", {
        body: {
          sessionId: String(sessionId),
          ...(message ? { message: String(message) } : {})
        }
      });
    },
    async failSoakSession({ sessionId, message = null } = {}) {
      if (!sessionId) throw new Error("sessionId is required");
      return await postJson("/soak/fail", {
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
  fetchImpl = globalThis.fetch,
  pollMs = 2500,
  logger = null
} = {}) {
  const normalizedCoreUrl = normalizeWitnessCoreUrl(coreUrl);
  if (!normalizedCoreUrl || typeof fetchImpl !== "function") return null;
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
      const [generationsResponse, healthResponse, servingResponse] = await Promise.all([
        fetchImpl(`${normalizedCoreUrl}/generations`, { cache: "no-store" }),
        fetchImpl(`${normalizedCoreUrl}/health`, { cache: "no-store" }),
        fetchImpl(`${normalizedCoreUrl}/serving`, { cache: "no-store" })
      ]);
      const generations = generationsResponse?.ok ? await generationsResponse.json() : null;
      const health = healthResponse?.ok ? await healthResponse.json() : null;
      const serving = servingResponse?.ok ? await servingResponse.json() : null;
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
      const response = await fetchImpl(`${normalizedCoreUrl}/events`, {
        cache: "no-store",
        headers: { accept: "text/event-stream" },
        signal: abortController?.signal
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
    coreUrl: normalizedCoreUrl,
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
