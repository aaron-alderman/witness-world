import { monitorEventLoopDelay } from "node:perf_hooks";

function roundNumber(value, digits = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function isoNow() {
  return new Date().toISOString();
}

function currentMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Number(usage.rss || 0),
    heapUsed: Number(usage.heapUsed || 0),
    heapTotal: Number(usage.heapTotal || 0),
    external: Number(usage.external || 0),
    arrayBuffers: Number(usage.arrayBuffers || 0)
  };
}

function cpuDeltaFor(startUsage) {
  const delta = process.cpuUsage(startUsage);
  return {
    userUs: Number(delta.user || 0),
    systemUs: Number(delta.system || 0)
  };
}

function memoryDeltaFor(startMemory, endMemory) {
  return {
    rss: Number(endMemory.rss || 0) - Number(startMemory.rss || 0),
    heapUsed: Number(endMemory.heapUsed || 0) - Number(startMemory.heapUsed || 0),
    heapTotal: Number(endMemory.heapTotal || 0) - Number(startMemory.heapTotal || 0),
    external: Number(endMemory.external || 0) - Number(startMemory.external || 0),
    arrayBuffers: Number(endMemory.arrayBuffers || 0) - Number(startMemory.arrayBuffers || 0)
  };
}

function eventLoopSnapshot(monitor) {
  if (!monitor) return null;
  return {
    minMs: roundNumber((monitor.min || 0) / 1e6),
    maxMs: roundNumber((monitor.max || 0) / 1e6),
    meanMs: roundNumber((monitor.mean || 0) / 1e6),
    stddevMs: roundNumber((monitor.stddev || 0) / 1e6),
    p50Ms: roundNumber((monitor.percentile?.(50) || 0) / 1e6),
    p95Ms: roundNumber((monitor.percentile?.(95) || 0) / 1e6),
    p99Ms: roundNumber((monitor.percentile?.(99) || 0) / 1e6)
  };
}

function cloneRecord(record = {}) {
  return {
    ...record,
    detail: record.detail && typeof record.detail === "object"
      ? structuredClone(record.detail)
      : null,
    memory: record.memory && typeof record.memory === "object"
      ? structuredClone(record.memory)
      : null,
    cpu: record.cpu && typeof record.cpu === "object"
      ? structuredClone(record.cpu)
      : null,
    eventLoop: record.eventLoop && typeof record.eventLoop === "object"
      ? structuredClone(record.eventLoop)
      : null,
    error: record.error && typeof record.error === "object"
      ? { ...record.error }
      : null
  };
}

function summarize(records = []) {
  const byKind = Object.create(null);
  for (const record of records) {
    const kind = String(record?.kind || "unknown");
    const existing = byKind[kind] ?? {
      count: 0,
      completed: 0,
      failed: 0,
      totalDurationMs: 0,
      maxDurationMs: 0
    };
    existing.count += 1;
    if (record.status === "completed") existing.completed += 1;
    if (record.status === "failed") existing.failed += 1;
    const durationMs = Number(record.durationMs || 0);
    existing.totalDurationMs += durationMs;
    existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
    byKind[kind] = existing;
  }
  return Object.fromEntries(
    Object.entries(byKind).map(([kind, value]) => [
      kind,
      {
        ...value,
        averageDurationMs: value.count ? roundNumber(value.totalDurationMs / value.count) : 0
      }
    ])
  );
}

export function createResourceProbeCollector({
  now = () => Date.now(),
  resolutionMs = 20,
  maxRecords = 500
} = {}) {
  const records = [];
  const monitor = typeof monitorEventLoopDelay === "function"
    ? monitorEventLoopDelay({ resolution: Math.max(10, Number(resolutionMs || 20)) })
    : null;
  monitor?.enable?.();

  const pushRecord = record => {
    records.push(record);
    if (records.length > maxRecords) records.splice(0, records.length - maxRecords);
    return record;
  };

  const beginOperation = ({
    id,
    kind,
    title = null,
    detail = null,
    observe = null
  } = {}) => {
    const startedAtMs = Number(now());
    const startedAt = isoNow();
    const startCpu = process.cpuUsage();
    const startMemory = currentMemoryUsage();
    let settled = false;
    const settle = (status, extraDetail = null, error = null) => {
      if (settled) return null;
      settled = true;
      const finishedAtMs = Number(now());
      const finishedAt = isoNow();
      const endMemory = currentMemoryUsage();
      const record = pushRecord({
        id: String(id || `${kind || "probe"}:${records.length + 1}`),
        kind: String(kind || "operation"),
        title: title ? String(title) : null,
        status,
        startedAtMs,
        endedAtMs: finishedAtMs,
        durationMs: roundNumber(Math.max(0, finishedAtMs - startedAtMs)),
        startedAt,
        finishedAt,
        detail: {
          ...(detail && typeof detail === "object" ? structuredClone(detail) : {}),
          ...(extraDetail && typeof extraDetail === "object" ? structuredClone(extraDetail) : {})
        },
        memory: {
          start: startMemory,
          end: endMemory,
          delta: memoryDeltaFor(startMemory, endMemory)
        },
        cpu: cpuDeltaFor(startCpu),
        eventLoop: eventLoopSnapshot(monitor),
        error: error
          ? {
              name: error?.name || "Error",
              message: String(error?.message || error)
            }
          : null
      });
      if (typeof observe === "function") {
        try {
          observe(cloneRecord(record));
        } catch {}
      }
      return record;
    };
    return {
      complete(extraDetail = null) {
        return settle("completed", extraDetail, null);
      },
      fail(error, extraDetail = null) {
        return settle("failed", extraDetail, error);
      }
    };
  };

  const snapshot = () => ({
    records: records.map(cloneRecord),
    summary: summarize(records),
    process: {
      memory: currentMemoryUsage(),
      eventLoop: eventLoopSnapshot(monitor)
    }
  });

  const close = () => {
    monitor?.disable?.();
  };

  return Object.freeze({
    beginOperation,
    snapshot,
    close
  });
}
