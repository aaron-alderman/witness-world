import { createResourceProbeCollector } from "./resource-probes.js";

function roundMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 10) / 10;
}

function clonePhase(phase = {}, totalMs = 0) {
  const startedAtMs = roundMs(phase.startedAtMs);
  const endedAtMs = phase.endedAtMs == null ? null : roundMs(phase.endedAtMs);
  const liveDurationMs = endedAtMs == null
    ? roundMs(Math.max(0, totalMs - startedAtMs))
    : roundMs(Math.max(0, endedAtMs - startedAtMs));
  return {
    id: String(phase.id || ""),
    label: String(phase.label || phase.id || ""),
    blocking: phase.blocking !== false,
    status: String(phase.status || "pending"),
    startedAtMs,
    endedAtMs,
    durationMs: liveDurationMs,
    detail: phase.detail && typeof phase.detail === "object"
      ? structuredClone(phase.detail)
      : null,
    error: phase.error ? { ...phase.error } : null
  };
}

function cloneMarks(marks = {}) {
  return Object.fromEntries(
    Object.entries(marks).map(([key, value]) => [
      key,
      {
        atMs: roundMs(value?.atMs),
        detail: value?.detail && typeof value.detail === "object"
          ? structuredClone(value.detail)
          : null
      }
    ])
  );
}

export function createStartupTelemetry({
  mode = "serve",
  now = () => performance.now(),
  probeCollector = null
} = {}) {
  const startedAt = now();
  const phases = [];
  const marks = Object.create(null);
  const listeners = new Set();
  const resourceProbes = probeCollector ?? createResourceProbeCollector();

  const elapsedMs = () => roundMs(now() - startedAt);
  const notify = event => {
    if (!listeners.size) return;
    const current = snapshot();
    for (const listener of listeners) {
      try {
        listener(current, event);
      } catch {}
    }
  };
  const beginPhase = (id, {
    label = id,
    blocking = true,
    detail = null
  } = {}) => {
    const probe = resourceProbes.beginOperation({
      id,
      kind: "startupPhase",
      title: label,
      detail: {
        startupMode: String(mode || "serve"),
        blocking: blocking !== false,
        ...(detail && typeof detail === "object" ? structuredClone(detail) : {})
      }
    });
    const phase = {
      id,
      label,
      blocking: blocking !== false,
      status: "pending",
      startedAtMs: elapsedMs(),
      endedAtMs: null,
      detail,
      error: null
    };
    phases.push(phase);
    notify({ type: "phase-started", phaseId: phase.id });
    let settled = false;
    return {
      complete(extraDetail = null) {
        if (settled) return phase;
        settled = true;
        phase.status = "completed";
        phase.endedAtMs = elapsedMs();
        if (extraDetail && typeof extraDetail === "object") {
          phase.detail = {
            ...(phase.detail && typeof phase.detail === "object" ? phase.detail : {}),
            ...extraDetail
          };
        }
        const probeRecord = probe?.complete?.(extraDetail);
        if (probeRecord) {
          phase.detail = {
            ...(phase.detail && typeof phase.detail === "object" ? phase.detail : {}),
            probe: probeRecord
          };
        }
        notify({ type: "phase-completed", phaseId: phase.id });
        return phase;
      },
      fail(error, extraDetail = null) {
        if (settled) return phase;
        settled = true;
        phase.status = "failed";
        phase.endedAtMs = elapsedMs();
        phase.error = {
          name: error?.name || "Error",
          message: String(error?.message || error || "startup phase failed")
        };
        if (extraDetail && typeof extraDetail === "object") {
          phase.detail = {
            ...(phase.detail && typeof phase.detail === "object" ? phase.detail : {}),
            ...extraDetail
          };
        }
        const probeRecord = probe?.fail?.(error, extraDetail);
        if (probeRecord) {
          phase.detail = {
            ...(phase.detail && typeof phase.detail === "object" ? phase.detail : {}),
            probe: probeRecord
          };
        }
        notify({ type: "phase-failed", phaseId: phase.id });
        return phase;
      }
    };
  };

  const runPhase = async (id, fn, options = {}) => {
    const phase = beginPhase(id, options);
    try {
      const value = await fn();
      phase.complete();
      return value;
    } catch (error) {
      phase.fail(error);
      throw error;
    }
  };

  const mark = (id, detail = null) => {
    marks[id] = {
      atMs: elapsedMs(),
      detail: detail && typeof detail === "object" ? structuredClone(detail) : null
    };
    notify({ type: "mark", markId: id });
    return marks[id];
  };

  const snapshot = () => {
    const totalMs = elapsedMs();
    const clonedPhases = phases.map(phase => clonePhase(phase, totalMs));
    const blocking = clonedPhases.filter(phase => phase.blocking);
    const background = clonedPhases.filter(phase => !phase.blocking);
    const meaningfulReadyAtMs = marks.meaningfulReady?.atMs
      ?? marks.listenReady?.atMs
      ?? null;
    return {
      mode: String(mode || "serve"),
      totalMs,
      listenReadyAtMs: marks.listenReady?.atMs ?? null,
      meaningfulReadyAtMs,
      phases: clonedPhases,
      marks: cloneMarks(marks),
      resourceProbes: resourceProbes.snapshot(),
      blockingPhaseCount: blocking.length,
      backgroundPhaseCount: background.length,
      backgroundPendingCount: background.filter(phase => phase.status === "pending").length,
      failedPhaseCount: clonedPhases.filter(phase => phase.status === "failed").length
    };
  };
  const subscribe = (listener, { emitCurrent = false } = {}) => {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    if (emitCurrent) {
      try {
        listener(snapshot(), { type: "snapshot" });
      } catch {}
    }
    return () => {
      listeners.delete(listener);
    };
  };

  return Object.freeze({
    beginPhase,
    runPhase,
    mark,
    snapshot,
    subscribe,
    probeCollector: resourceProbes
  });
}
