// Async process graph utilities.
// A process program is a set of step nodes. Dependencies are explicit through
// `after`; nodes with the same dependency frontier may run concurrently.

export function stepGraphFromLinearSteps(steps, { programId = null } = {}) {
  const sorted = [...steps].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const nodes = sorted.map((step, index) => {
    const order = step.order ?? index;
    const path = step.path ?? semanticStepPath({ ...step, order }, index, programId);
    return {
      id: step.id ?? pathKey(path),
      path,
      event: step.event,
      op: step.op,
      params: step.params ?? {},
      order,
      when: step.when ?? null,
      repeat: step.repeat ?? null,
      after: step.after ? [...step.after] : []
    };
  });

  const byEvent = groupBy(nodes, node => node.event);
  for (const eventNodes of byEvent.values()) {
    const orders = [...new Set(eventNodes.map(n => n.order))].sort((a, b) => a - b);
    const byOrder = groupBy(eventNodes, n => n.order);
    for (let i = 1; i < orders.length; i++) {
      const previous = byOrder.get(orders[i - 1]) ?? [];
      const current = byOrder.get(orders[i]) ?? [];
      for (const node of current) node.after = [...new Set([...node.after, ...previous.map(p => p.id)])];
    }
  }

  return nodes;
}

export function semanticStepPath(step, index = 0, programId = null) {
  const path = [];
  if (programId) path.push({ kind: "program", id: programId });

  const event = parseEvent(step.event ?? "event");
  path.push({ kind: "trigger", id: event.trigger });
  if (event.target) path.push({ kind: event.targetKind, id: event.target });

  path.push({ kind: "step", index: step.order ?? index });
  path.push({ kind: "operation", id: step.op ?? "unknown" });
  return path;
}

export function pathKey(path) {
  return path.map(segment => {
    if ("index" in segment) return `${segment.kind}[${segment.index}]`;
    return `${segment.kind}=${segment.id}`;
  }).join("/");
}

export function pathLabel(path) {
  const last = path[path.length - 1];
  if (!last) return "";
  if ("index" in last) return `step ${last.index}`;
  return String(last.id ?? last.kind);
}

export function pathBreadcrumb(path) {
  return path.slice(0, -1).map(segment => "index" in segment ? `step ${segment.index}` : String(segment.id ?? segment.kind)).join(" › ");
}

function parseEvent(event) {
  const value = String(event || "event");
  const [trigger, target] = value.split(":", 2);
  if (!target) return { trigger: value, target: null, targetKind: "target" };
  const targetKind = trigger === "submit" ? "widget" : trigger === "click" ? "action" : "target";
  return { trigger, target, targetKind };
}

export async function runProcessGraph(nodes, event, execute, state = {}, hooks = {}) {
  const eventNodes = nodes.filter(n => n.event === event);
  const done = new Set();
  const skipped = new Set();
  const failed = new Set();
  const trace = [];

  while (done.size + skipped.size + failed.size < eventNodes.length) {
    const ready = eventNodes.filter(node => {
      if (done.has(node.id) || skipped.has(node.id) || failed.has(node.id)) return false;
      return (node.after ?? []).every(dep => done.has(dep) || skipped.has(dep));
    });

    if (ready.length === 0) {
      const unresolved = eventNodes
        .filter(node => !done.has(node.id) && !skipped.has(node.id) && !failed.has(node.id))
        .map(node => node.id);
      throw new Error(`process graph stalled; unresolved nodes: ${unresolved.join(", ")}`);
    }

    await Promise.all(ready.map(async node => {
      if (!predicatePasses(node.when, state)) {
        skipped.add(node.id);
        trace.push({ node: node.id, status: "skipped" });
        await hooks.onNodeSkipped?.(node, { status: "skipped" });
        return;
      }
      try {
        await hooks.onNodeStart?.(node, { status: "start" });
        const meta = await runNode(node, execute, state);
        done.add(node.id);
        trace.push({ node: node.id, status: "done", ...meta });
        await hooks.onNodeDone?.(node, { status: "done", ...meta });
      } catch (error) {
        failed.add(node.id);
        trace.push({ node: node.id, status: "failed", error: error.message });
        await hooks.onNodeFailed?.(node, error, { status: "failed" });
        throw error;
      }
    }));
  }

  return { state, trace };
}

export async function runNode(node, execute, state) {
  const repeat = node.repeat ?? null;
  if (repeat?.forEach) {
    const items = readPath(state, repeat.forEach.from);
    const list = Array.isArray(items) ? items : [];
    if (repeat.forEach.serial === true) {
      for (const [index, item] of list.entries()) {
        await execute(node, state, { item, index, as: repeat.forEach.as ?? "item" });
      }
    } else {
      await Promise.all(list.map((item, index) => execute(node, state, { item, index, as: repeat.forEach.as ?? "item" })));
    }
    return { mode: "forEach", count: list.length };
  }

  if (repeat?.while) {
    let count = 0;
    const max = repeat.max ?? 100;
    while (predicatePasses(repeat.while, state)) {
      if (count++ >= max) throw new Error(`process graph loop exceeded max iterations at ${node.id}`);
      await execute(node, state, { iteration: count });
    }
    return { mode: "while", count };
  }

  await execute(node, state, {});
  return { mode: null, count: null };
}

export function predicatePasses(predicate, state) {
  if (!predicate) return true;
  const value = readPath(state, predicate.path);
  if ("equals" in predicate) return value === predicate.equals;
  if ("notEquals" in predicate) return value !== predicate.notEquals;
  if (predicate.truthy) return !!value;
  if (predicate.falsy) return !value;
  return true;
}

export function readPath(value, path) {
  return String(path || "").split(".").filter(Boolean).reduce((x, key) => x == null ? undefined : x[key], value);
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}
