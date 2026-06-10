import assert from "node:assert/strict";
import test from "node:test";
import { runProcessGraph, stepGraphFromLinearSteps } from "../src/process-graph.js";

test("linear steps lower to an async dependency graph", async () => {
  const graph = stepGraphFromLinearSteps([
    { event: "load", op: "a", order: 0, params: {} },
    { event: "load", op: "b", order: 1, params: {} },
    { event: "load", op: "c", order: 1, params: {} },
    { event: "load", op: "d", order: 2, params: {} }
  ]);

  assert.deepEqual(graph.find(n => n.op === "b").after, [graph.find(n => n.op === "a").id]);
  assert.deepEqual(graph.find(n => n.op === "c").after, [graph.find(n => n.op === "a").id]);
  assert.deepEqual(new Set(graph.find(n => n.op === "d").after), new Set([graph.find(n => n.op === "b").id, graph.find(n => n.op === "c").id]));

  const order = [];
  await runProcessGraph(graph, "load", async node => {
    order.push(node.op);
  });

  assert.equal(order[0], "a");
  assert.equal(order.at(-1), "d");
});

test("process graph supports branch predicates", async () => {
  const graph = [
    { id: "choose", event: "click", op: "choose", params: {}, after: [] },
    { id: "yes", event: "click", op: "yes", params: {}, after: ["choose"], when: { path: "ok", equals: true } },
    { id: "no", event: "click", op: "no", params: {}, after: ["choose"], when: { path: "ok", equals: false } }
  ];

  const ran = [];
  const result = await runProcessGraph(graph, "click", async (node, state) => {
    ran.push(node.op);
    if (node.op === "choose") state.ok = true;
  });

  assert.deepEqual(ran, ["choose", "yes"]);
  assert.equal(result.trace.find(t => t.node === "no").status, "skipped");
});

test("process graph supports bounded loops", async () => {
  const graph = [
    { id: "tick", event: "run", op: "tick", params: {}, after: [], repeat: { while: { path: "more", truthy: true }, max: 5 } }
  ];

  const state = { more: true, n: 0 };
  await runProcessGraph(graph, "run", async (_node, state) => {
    state.n += 1;
    if (state.n === 3) state.more = false;
  }, state);

  assert.equal(state.n, 3);
});

test("process graph supports parallel foreach coordination", async () => {
  const graph = [
    { id: "each", event: "render", op: "each", params: {}, after: [], repeat: { forEach: { from: "items", as: "item" } } }
  ];

  const seen = [];
  await runProcessGraph(graph, "render", async (_node, _state, scope) => {
    seen.push(scope.item);
  }, { items: ["a", "b", "c"] });

  assert.deepEqual(new Set(seen), new Set(["a", "b", "c"]));
});

test("process graph stalls when unresolved dependencies remain", async () => {
  const graph = [
    { id: "a", event: "click", op: "a", after: ["b"] },
    { id: "b", event: "click", op: "b", after: ["a"] }
  ];

  await assert.rejects(
    runProcessGraph(graph, "click", async () => {}),
    /process graph stalled; unresolved nodes:/i
  );
});

test("process graph marks node failures when node execution throws", async () => {
  const graph = [{ id: "boom", event: "load", op: "boom", after: [] }];
  await assert.rejects(
    runProcessGraph(graph, "load", async () => {
      throw new Error("boom");
    }),
    /boom/
  );
});
