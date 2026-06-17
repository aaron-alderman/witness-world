export function createExecutionRunner(options = {}) {
  const listeners = new Set();
  const settleWaiters = new Set();
  const historyLimit = Number(options.historyLimit ?? 200);
  const activeTasks = new Map();
  const completedTasks = [];
  const taskStack = [];
  let sequence = 0;

  const clone = value => {
    if (value == null) return value;
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  };

  const trim = value => {
    if (typeof value !== "string") return null;
    const next = value.trim();
    return next || null;
  };

  const summarize = (filter = null) => {
    const active = [...activeTasks.values()]
      .filter(task => (typeof filter === "function" ? filter(task) : true))
      .map(task => clone(task));
    const pendingByKind = {};
    for (const task of active) {
      pendingByKind[task.kind] = (pendingByKind[task.kind] ?? 0) + 1;
    }
    return {
      settled: active.length === 0,
      activeTaskCount: active.length,
      pendingByKind,
      activeTasks: active,
      recentTasks: completedTasks.slice(-20).map(task => clone(task))
    };
  };

  const notify = () => {
    const snapshot = summarize();
    for (const listener of listeners) listener(snapshot);
    for (const waiter of [...settleWaiters]) {
      const filtered = summarize(waiter.filter);
      if (filtered.activeTaskCount !== 0) continue;
      settleWaiters.delete(waiter);
      waiter.resolve(filtered);
    }
  };

  const completeTask = (task, status, result = null, error = null) => {
    activeTasks.delete(task.id);
    const finishedAt = Date.now();
    const completed = {
      ...task,
      status,
      finishedAt,
      durationMs: Math.max(0, finishedAt - task.startedAt),
      result: result == null ? null : clone(result),
      error: error == null
        ? null
        : {
            name: error?.name || "Error",
            message: String(error?.message || error),
            stack: trim(String(error?.stack || "")) || null
          }
    };
    completedTasks.push(completed);
    while (completedTasks.length > historyLimit) completedTasks.shift();
    notify();
  };

  const runner = {
    track(kind, work, meta = {}) {
      const nextKind = trim(kind) || "task";
      const activeParent = taskStack.length ? taskStack[taskStack.length - 1] : null;
      const task = {
        id: trim(meta.id) || `task:${nextKind}:${++sequence}`,
        kind: nextKind,
        label: trim(meta.label),
        route: trim(meta.route),
        surfaceId: trim(meta.surfaceId),
        processRef: trim(meta.processRef),
        phase: trim(meta.phase),
        correlationId: trim(meta.correlationId),
        parentTaskId: trim(meta.parentTaskId) || activeParent?.id || null,
        status: "active",
        startedAt: Date.now(),
        details: meta.details == null ? null : clone(meta.details)
      };
      activeTasks.set(task.id, task);
      notify();
      const invoke = typeof work === "function" ? work : () => work;
      taskStack.push(task);
      return Promise.resolve()
        .then(() => invoke(task))
        .then(result => {
          completeTask(task, "resolved", result, null);
          return result;
        })
        .catch(error => {
          completeTask(task, "rejected", null, error);
          throw error;
        })
        .finally(() => {
          const index = taskStack.lastIndexOf(task);
          if (index >= 0) taskStack.splice(index, 1);
        });
    },
    whenSettled(filter = null) {
      const snapshot = summarize(filter);
      if (snapshot.activeTaskCount === 0) return Promise.resolve(snapshot);
      return new Promise(resolve => settleWaiters.add({ resolve, filter }));
    },
    settledSnapshot(filter = null) {
      return summarize(filter);
    },
    activeTasks() {
      return [...activeTasks.values()].map(task => clone(task));
    },
    recentTasks() {
      return completedTasks.map(task => clone(task));
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(summarize());
      return () => listeners.delete(listener);
    },
    get inFlightCount() {
      return activeTasks.size;
    }
  };

  return runner;
}
