import { moduleProjectors } from "./modules.js";

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function numberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stableOutputSize(value) {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeMaterializedViewDefinition(row = {}) {
  return {
    id: String(row.id || ""),
    title: optionalText(row.title) || String(row.id || ""),
    kind: optionalText(row.kind) || "generic",
    sliceKey: optionalText(row.sliceKey),
    modelView: optionalText(row.modelView),
    maintenance: optionalText(row.maintenance) || "on-demand",
    storageClass: optionalText(row.storageClass) || "memory",
    resourceBudgetClass: optionalText(row.resourceBudgetClass),
    blocking: row.blocking !== false,
    ttlMs: numberOrNull(row.ttlMs) ?? 0,
    sourceProjectors: Array.isArray(row.sourceProjectors) ? row.sourceProjectors.map(String) : [],
    sourceWitnessProcesses: Array.isArray(row.sourceWitnessProcesses) ? row.sourceWitnessProcesses.map(String) : [],
    invalidation: row.invalidation && typeof row.invalidation === "object"
      ? structuredClone(row.invalidation)
      : null,
    values: row.values && typeof row.values === "object"
      ? structuredClone(row.values)
      : null
  };
}

function defaultCacheKey(world, appContext, definition) {
  const snapshot = appContext?.appSnapshotManager?.getActiveSnapshot?.() ?? null;
  return JSON.stringify({
    id: definition.id,
    kind: definition.kind,
    sliceKey: definition.sliceKey,
    modelView: definition.modelView,
    witnessCount: world?.witnessCount?.() ?? world?.allWitnesses?.().length ?? 0,
    runtimeRevision: Number(snapshot?.appRevision || appContext?.appSnapshotManager?.appRevision || 0),
    serverRunnerId: appContext?.serverRunnerId || null
  });
}

export function createMaterializedViewRegistry({
  world,
  probeCollector = null,
  now = () => Date.now()
} = {}) {
  const builders = new Map();
  const states = new Map();

  const definitions = () => {
    const rows = world?.project?.(moduleProjectors.materializedViews, {
      observations: world?.allObservations?.() ?? []
    }) ?? [];
    return rows.map(normalizeMaterializedViewDefinition).filter(row => row.id);
  };

  const find = predicate => definitions().filter(predicate);
  const findOne = predicate => find(predicate)[0] ?? null;
  const definitionById = id => findOne(row => row.id === String(id || ""));

  const registerBuilder = (kind, builder) => {
    const key = String(kind || "").trim();
    if (!key) throw new Error("materialized view builder kind is required");
    if (typeof builder !== "function") throw new Error("materialized view builder must be a function");
    const existing = builders.get(key);
    if (existing && existing !== builder) throw new Error(`materialized view builder already registered: ${key}`);
    builders.set(key, builder);
  };

  const recordRead = ({
    definition,
    state,
    cacheStatus,
    request = null,
    durationMs = null,
    invalidationCause = null
  }) => {
    if (!world?.observe) return;
    world.observe({
      process: "materializedView.read",
      actor: request?.actor || "runtime.materializedView",
      claims: [],
      body: {
        id: definition.id,
        title: definition.title,
        kind: definition.kind,
        sliceKey: definition.sliceKey,
        modelView: definition.modelView,
        maintenance: definition.maintenance,
        storageClass: definition.storageClass,
        resourceBudgetClass: definition.resourceBudgetClass,
        blocking: definition.blocking !== false,
        ttlMs: definition.ttlMs,
        cacheStatus,
        buildCount: Number(state.buildCount || 0),
        hitCount: Number(state.hitCount || 0),
        missCount: Number(state.missCount || 0),
        lastBuiltAt: state.lastBuiltAt || null,
        durationMs: durationMs == null ? null : Number(durationMs),
        requestId: request?.id ?? null,
        requestPath: request?.path ?? null,
        requestView: request?.view ?? null,
        requestArea: request?.area ?? null,
        requestSection: request?.section ?? null,
        invalidationCause: invalidationCause ?? null,
        outputSizeEstimate: Number(state.outputSizeEstimate || 0),
        inputSize: Number(state.inputSize || 0),
        observedAt: nowIso()
      }
    });
  };

  const read = async (target, {
    request = null,
    appContext = null,
    cacheKey = null,
    buildArgs = null
  } = {}) => {
    const definition = typeof target === "string"
      ? definitionById(target)
      : normalizeMaterializedViewDefinition(target ?? {});
    if (!definition?.id) return null;
    const builder = builders.get(definition.kind);
    if (typeof builder !== "function") return null;
    const state = states.get(definition.id) ?? {
      id: definition.id,
      buildCount: 0,
      hitCount: 0,
      missCount: 0,
      lastBuiltAt: null,
      lastBuiltAtMs: 0,
      outputSizeEstimate: 0,
      inputSize: 0,
      invalidationCause: "cold",
      pending: null,
      pendingCacheKey: null,
      value: null
    };
    const effectiveCacheKey = cacheKey ?? defaultCacheKey(world, appContext, definition);
    const ttlMs = Math.max(0, Number(definition.ttlMs || 0));
    const ageMs = Math.max(0, Number(now()) - Number(state.lastBuiltAtMs || 0));
    const cacheKeyChanged = state.cacheKey != null && state.cacheKey !== effectiveCacheKey;
    const ttlExpired = ttlMs > 0 && state.lastBuiltAtMs > 0 && ageMs > ttlMs;
    if (state.value != null && !cacheKeyChanged && !ttlExpired) {
      state.hitCount += 1;
      states.set(definition.id, state);
      recordRead({
        definition,
        state,
        cacheStatus: "hit",
        request,
        durationMs: 0,
        invalidationCause: null
      });
      return state.value;
    }
    if (state.pending && state.pendingCacheKey === effectiveCacheKey) {
      return state.pending;
    }
    state.missCount += 1;
    state.invalidationCause = cacheKeyChanged ? "input-changed" : (ttlExpired ? "ttl-expired" : "cold");
    const probe = probeCollector?.beginOperation({
      id: `${definition.id}:${request?.id || state.buildCount + 1}:${Number(now())}`,
      kind: "materializedView",
      title: definition.title,
      detail: {
        materializedViewId: definition.id,
        materializedViewKind: definition.kind,
        sliceKey: definition.sliceKey,
        modelView: definition.modelView,
        requestId: request?.id ?? null,
        requestPath: request?.path ?? null,
        requestView: request?.view ?? null,
        blocking: definition.blocking !== false
      },
      observe: record => {
        if (!world?.observe) return;
        world.observe({
          process: "runtime.resourceProbe.operation",
          actor: request?.actor || "runtime.materializedView",
          claims: [],
          body: {
            ...record,
            materializedViewId: definition.id,
            materializedViewKind: definition.kind
          }
        });
      }
    });
    const startedAtMs = Number(now());
    state.pendingCacheKey = effectiveCacheKey;
    state.pending = Promise.resolve(builder({
      definition,
      appContext,
      world,
      request,
      cacheKey: effectiveCacheKey,
      buildArgs
    }))
      .then(result => {
        const value = result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "value")
          ? result.value
          : result;
        const detail = result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "value")
          ? result
          : {};
        state.value = value;
        state.cacheKey = effectiveCacheKey;
        state.buildCount += 1;
        state.lastBuiltAtMs = Number(now());
        state.lastBuiltAt = nowIso();
        state.outputSizeEstimate = Number(detail.outputSizeEstimate ?? stableOutputSize(value));
        state.inputSize = Number(detail.inputSize || 0);
        states.set(definition.id, state);
        const durationMs = Number(now()) - startedAtMs;
        recordRead({
          definition,
          state,
          cacheStatus: "miss",
          request,
          durationMs,
          invalidationCause: state.invalidationCause
        });
        probe?.complete?.({
          cacheStatus: "miss",
          inputSize: state.inputSize,
          outputSizeEstimate: state.outputSizeEstimate,
          invalidationCause: state.invalidationCause
        });
        return value;
      })
      .catch(error => {
        probe?.fail?.(error, {
          invalidationCause: state.invalidationCause
        });
        throw error;
      })
      .finally(() => {
        state.pending = null;
        state.pendingCacheKey = null;
      });
    states.set(definition.id, state);
    return state.pending;
  };

  const snapshot = () => definitions().map(definition => {
    const state = states.get(definition.id) ?? null;
    return {
      ...definition,
      status: state?.value == null ? "cold" : "warm",
      buildCount: Number(state?.buildCount || 0),
      hitCount: Number(state?.hitCount || 0),
      missCount: Number(state?.missCount || 0),
      lastBuiltAt: state?.lastBuiltAt ?? null,
      outputSizeEstimate: Number(state?.outputSizeEstimate || 0),
      inputSize: Number(state?.inputSize || 0),
      invalidationCause: state?.invalidationCause ?? "cold"
    };
  });

  return Object.freeze({
    definitions,
    find,
    findOne,
    read,
    registerBuilder,
    snapshot
  });
}
