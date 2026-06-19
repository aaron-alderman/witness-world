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

  const poll = async () => {
    try {
      const [generationsResponse, healthResponse] = await Promise.all([
        fetchImpl(`${normalizedCoreUrl}/generations`, { cache: "no-store" }),
        fetchImpl(`${normalizedCoreUrl}/health`, { cache: "no-store" })
      ]);
      const generations = generationsResponse?.ok ? await generationsResponse.json() : null;
      const health = healthResponse?.ok ? await healthResponse.json() : null;
      if (!generations && !health) return;
      currentStatus = {
        ...(generations ?? currentStatus ?? {}),
        process: health?.process ?? currentStatus?.process ?? null,
        service: health?.service ?? currentStatus?.service ?? "witness-core",
        ok: health?.ok !== false
      };
    } catch (error) {
      logger?.warn?.("witnessCore.status.poll failed", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  void poll();
  timer = setInterval(() => {
    void poll();
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
      await poll();
      return this.getStatus();
    },
    close() {
      if (timer != null) clearInterval(timer);
      timer = null;
    }
  };
}
