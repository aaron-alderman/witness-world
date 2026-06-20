import process from "node:process";
import { runtimeConfigLookup } from "./runtime-config-utils.js";

const DEFAULT_RESOURCE_FAMILY_MAX = Object.freeze({
  Timeout: 5000,
  FSWatcher: 256
});

export const DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY = Object.freeze({
  sampleMs: 1000,
  rssMaxMb: 1536,
  heapUsedMaxMb: 768,
  eventLoopP95MaxMs: 250,
  activeRequestsMax: 250,
  sseClientsMax: 250,
  previewSessionsMax: 200,
  snapshotWatchersMax: 128,
  degradedToUnhealthyAfterSamples: 15,
  resourceFamilyMax: DEFAULT_RESOURCE_FAMILY_MAX
});

const HARD_LIMIT_MULTIPLIER = Object.freeze({
  default: 2,
  eventLoop: 2
});

function round(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function clonePlain(value) {
  return value && typeof value === "object" ? structuredClone(value) : value;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function finiteInteger(value, fallback, { minimum = 0 } = {}) {
  const numeric = Math.trunc(Number(value));
  return Number.isFinite(numeric) && numeric >= minimum ? numeric : fallback;
}

function runtimeConfigNumber(runtimeConfig, key, fallback, { minimum = 0 } = {}) {
  const candidate = runtimeConfigLookup(runtimeConfig, key);
  const numeric = Number(candidate);
  return Number.isFinite(numeric) && numeric >= minimum ? numeric : fallback;
}

function normalizeCountMap(source = null) {
  if (!source || typeof source !== "object") return {};
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [String(key), finiteInteger(value, 0)])
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function normalizeMemory(value = null) {
  const source = value && typeof value === "object" ? value : {};
  return {
    rss: finiteInteger(source.rss, 0),
    heapUsed: finiteInteger(source.heapUsed, 0),
    heapTotal: finiteInteger(source.heapTotal, 0),
    external: finiteInteger(source.external, 0),
    arrayBuffers: finiteInteger(source.arrayBuffers, 0)
  };
}

function normalizeEventLoop(value = null) {
  const source = value && typeof value === "object" ? value : {};
  return {
    p50Ms: round(source.p50Ms, 3),
    p95Ms: round(source.p95Ms, 3),
    p99Ms: round(source.p99Ms, 3),
    maxMs: round(source.maxMs, 3)
  };
}

export function collectActiveResourceFamilies(processRef = process) {
  const rows = typeof processRef?.getActiveResourcesInfo === "function"
    ? processRef.getActiveResourcesInfo()
    : [];
  const counts = Object.create(null);
  for (const row of rows ?? []) {
    const key = String(row || "").trim();
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return normalizeCountMap(counts);
}

export function resolveRuntimeProcessHealthPolicy(runtimeConfig = {}) {
  const resourceFamilyMax = { ...DEFAULT_RESOURCE_FAMILY_MAX };
  for (const family of Object.keys(DEFAULT_RESOURCE_FAMILY_MAX)) {
    resourceFamilyMax[family] = runtimeConfigNumber(
      runtimeConfig,
      `runtime.health.resourceFamilyMax.${family}`,
      DEFAULT_RESOURCE_FAMILY_MAX[family],
      { minimum: 0 }
    );
  }
  return Object.freeze({
    sampleMs: runtimeConfigNumber(runtimeConfig, "runtime.health.sampleMs", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.sampleMs, { minimum: 100 }),
    rssMaxMb: runtimeConfigNumber(runtimeConfig, "runtime.health.rssMaxMb", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.rssMaxMb, { minimum: 1 }),
    heapUsedMaxMb: runtimeConfigNumber(runtimeConfig, "runtime.health.heapUsedMaxMb", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.heapUsedMaxMb, { minimum: 1 }),
    eventLoopP95MaxMs: runtimeConfigNumber(runtimeConfig, "runtime.health.eventLoopP95MaxMs", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.eventLoopP95MaxMs, { minimum: 1 }),
    activeRequestsMax: runtimeConfigNumber(runtimeConfig, "runtime.health.activeRequestsMax", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.activeRequestsMax, { minimum: 0 }),
    sseClientsMax: runtimeConfigNumber(runtimeConfig, "runtime.health.sseClientsMax", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.sseClientsMax, { minimum: 0 }),
    previewSessionsMax: runtimeConfigNumber(runtimeConfig, "runtime.health.previewSessionsMax", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.previewSessionsMax, { minimum: 0 }),
    snapshotWatchersMax: runtimeConfigNumber(runtimeConfig, "runtime.health.snapshotWatchersMax", DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.snapshotWatchersMax, { minimum: 0 }),
    degradedToUnhealthyAfterSamples: runtimeConfigNumber(
      runtimeConfig,
      "runtime.health.degradedToUnhealthyAfterSamples",
      DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.degradedToUnhealthyAfterSamples,
      { minimum: 1 }
    ),
    resourceFamilyMax: Object.freeze(resourceFamilyMax)
  });
}

function severityForBudget(value, max, multiplier = HARD_LIMIT_MULTIPLIER.default) {
  if (!Number.isFinite(max) || max < 0) return "healthy";
  if (Number(value) > Number(max) * multiplier || Number(value) === Number(max) * multiplier) return "unhealthy";
  if (Number(value) > Number(max)) return "degraded";
  return "healthy";
}

function pushReason(reasons, reasonCode, severity) {
  reasons.push({ reasonCode, severity });
}

function evaluateBudgets({
  memory,
  eventLoop,
  runtimeCounts,
  resourceFamilies,
  policy,
  ready
}) {
  const reasons = [];
  const rssMb = memory.rss / (1024 * 1024);
  const heapUsedMb = memory.heapUsed / (1024 * 1024);
  const runtimeMetrics = [
    { value: rssMb, max: policy.rssMaxMb, reasonCode: "rss_over_budget" },
    { value: heapUsedMb, max: policy.heapUsedMaxMb, reasonCode: "heap_used_over_budget" },
    { value: runtimeCounts.activeRequests, max: policy.activeRequestsMax, reasonCode: "active_requests_over_budget" },
    { value: runtimeCounts.sseClients, max: policy.sseClientsMax, reasonCode: "sse_clients_over_budget" },
    { value: runtimeCounts.previewSessions, max: policy.previewSessionsMax, reasonCode: "preview_sessions_over_budget" },
    { value: runtimeCounts.snapshotWatchers, max: policy.snapshotWatchersMax, reasonCode: "snapshot_watchers_over_budget" }
  ];
  for (const metric of runtimeMetrics) {
    const severity = severityForBudget(metric.value, metric.max);
    if (severity !== "healthy") pushReason(reasons, metric.reasonCode, severity);
  }
  const eventLoopSeverity = severityForBudget(eventLoop.p95Ms, policy.eventLoopP95MaxMs, HARD_LIMIT_MULTIPLIER.eventLoop);
  if (eventLoopSeverity !== "healthy") {
    pushReason(reasons, "event_loop_p95_over_budget", eventLoopSeverity);
  }
  for (const [family, max] of Object.entries(policy.resourceFamilyMax ?? {})) {
    const count = finiteInteger(resourceFamilies[family], 0);
    const severity = severityForBudget(count, max);
    if (severity !== "healthy") {
      pushReason(reasons, `${family.toLowerCase()}_resources_over_budget`, severity);
    }
  }
  if (ready !== true) {
    pushReason(reasons, "runtime_not_ready", "degraded");
  }
  return reasons;
}

export function buildRuntimeProcessHealthSample({
  sampledAt = new Date().toISOString(),
  uptimeMs = Math.round(Number(process.uptime?.() || 0) * 1000),
  policy = DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY,
  processSnapshot = null,
  runtimeCounts = {},
  resourceFamilies = {},
  lastGood = null,
  ready = false,
  previous = null
} = {}) {
  const normalizedMemory = normalizeMemory(processSnapshot?.memory);
  const normalizedEventLoop = normalizeEventLoop(processSnapshot?.eventLoop);
  const normalizedRuntimeCounts = normalizeCountMap(runtimeCounts);
  const normalizedResourceFamilies = normalizeCountMap(resourceFamilies);
  const reasons = evaluateBudgets({
    memory: normalizedMemory,
    eventLoop: normalizedEventLoop,
    runtimeCounts: normalizedRuntimeCounts,
    resourceFamilies: normalizedResourceFamilies,
    policy,
    ready
  });
  const immediateUnhealthy = reasons.some(reason => reason.severity === "unhealthy");
  const previousStatus = typeof previous?.status === "string" ? previous.status : "healthy";
  const nextDegradedStreak = reasons.length > 0 && !immediateUnhealthy
    ? (previousStatus === "degraded" ? finiteInteger(previous?.degradedStreak, 0) + 1 : 1)
    : 0;
  let status = reasons.length === 0 ? "healthy" : (immediateUnhealthy ? "unhealthy" : "degraded");
  if (status === "degraded" && nextDegradedStreak >= finiteInteger(policy.degradedToUnhealthyAfterSamples, 15, { minimum: 1 })) {
    status = "unhealthy";
    reasons.push({ reasonCode: "degraded_streak_exceeded", severity: "unhealthy" });
  }
  const nextUnhealthyStreak = status === "unhealthy"
    ? (previousStatus === "unhealthy" ? finiteInteger(previous?.unhealthyStreak, 0) + 1 : 1)
    : 0;
  return {
    ok: status !== "unhealthy",
    ready: ready === true,
    status,
    sampledAt,
    uptimeMs: finiteInteger(uptimeMs, 0),
    reasonCodes: [...new Set(reasons.map(reason => reason.reasonCode))],
    memory: normalizedMemory,
    eventLoop: normalizedEventLoop,
    runtimeCounts: normalizedRuntimeCounts,
    resourceFamilies: normalizedResourceFamilies,
    lastGood: clonePlain(lastGood),
    degradedStreak: status === "healthy" ? 0 : nextDegradedStreak,
    unhealthyStreak: nextUnhealthyStreak
  };
}

function currentProcessSnapshot(probeCollector) {
  if (probeCollector && typeof probeCollector.snapshot === "function") {
    const snapshot = probeCollector.snapshot();
    return snapshot?.process ?? null;
  }
  return {
    memory: normalizeMemory(process.memoryUsage?.()),
    eventLoop: normalizeEventLoop(null)
  };
}

export function createRuntimeProcessHealthMonitor({
  runtimeConfig = {},
  probeCollector = null,
  getRuntimeCounts = () => ({}),
  getServingState = () => null,
  getReadyState = () => false,
  processRef = process,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval
} = {}) {
  const policy = resolveRuntimeProcessHealthPolicy(runtimeConfig);
  let lastSample = null;

  const sample = () => {
    lastSample = buildRuntimeProcessHealthSample({
      sampledAt: new Date(now()).toISOString(),
      uptimeMs: Math.round(Number(processRef?.uptime?.() || 0) * 1000),
      policy,
      processSnapshot: currentProcessSnapshot(probeCollector),
      runtimeCounts: getRuntimeCounts(),
      resourceFamilies: collectActiveResourceFamilies(processRef),
      lastGood: getServingState(),
      ready: getReadyState(),
      previous: lastSample
    });
    return clonePlain(lastSample);
  };

  sample();
  const timer = typeof setIntervalFn === "function"
    ? setIntervalFn(() => {
        try {
          sample();
        } catch {}
      }, Math.max(100, finiteInteger(policy.sampleMs, DEFAULT_RUNTIME_PROCESS_HEALTH_POLICY.sampleMs, { minimum: 100 })))
    : null;
  timer?.unref?.();

  return Object.freeze({
    policy,
    sample,
    snapshot() {
      return clonePlain(lastSample) ?? sample();
    },
    close() {
      if (timer != null && typeof clearIntervalFn === "function") clearIntervalFn(timer);
    }
  });
}
