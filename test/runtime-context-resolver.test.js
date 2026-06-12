import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeContextResolver } from "../src/runtime-context-resolver.js";

test("non-bootstrap runners stay pinned to their initial runtime context", async () => {
  const bootstrapRunner = { id: "bootstrap", bootstrapOnly: false };
  const bootstrapContext = { ok: true, label: "bootstrap" };
  let resolved = 0;

  const runtime = createRuntimeContextResolver({
    bootstrapRunner,
    bootstrapContext,
    resolveLiveRunner: () => {
      resolved += 1;
      return { ok: true, runner: { id: "live" } };
    },
    createContextForRunner: async () => ({ ok: true, label: "live" }),
    createUnavailableContext: reason => ({ ok: false, reason })
  });

  const active = await runtime.resolveActiveRuntime();
  assert.equal(active.runner, bootstrapRunner);
  assert.equal(active.context, bootstrapContext);
  assert.equal(resolved, 0);
});

test("bootstrap-only runners switch to the live runner and reuse created contexts", async () => {
  const bootstrapRunner = { id: "bootstrap", bootstrapOnly: true };
  const bootstrapContext = { ok: true, label: "bootstrap" };
  let created = 0;

  const runtime = createRuntimeContextResolver({
    bootstrapRunner,
    bootstrapContext,
    resolveLiveRunner: () => ({ ok: true, runner: { id: "live", bootstrapOnly: false } }),
    createContextForRunner: async runner => {
      created += 1;
      return { ok: true, label: runner.id };
    },
    createUnavailableContext: reason => ({ ok: false, reason })
  });

  const first = await runtime.resolveActiveRuntime();
  const second = await runtime.resolveActiveRuntime();

  assert.equal(first.runner.id, "live");
  assert.equal(first.context.label, "live");
  assert.equal(second.context, first.context);
  assert.equal(created, 1);
});

test("bootstrap-only runners surface unavailable live contexts without caching the failure", async () => {
  const bootstrapRunner = { id: "bootstrap", bootstrapOnly: true };
  const bootstrapContext = { ok: true, label: "bootstrap" };

  const runtime = createRuntimeContextResolver({
    bootstrapRunner,
    bootstrapContext,
    resolveLiveRunner: () => ({ ok: true, runner: { id: "live", bootstrapOnly: false } }),
    createContextForRunner: async () => ({ ok: false, reason: "broken live context" }),
    createUnavailableContext: reason => ({ ok: false, reason, handlers: {} })
  });

  const active = await runtime.resolveActiveRuntime();
  assert.equal(active.runner.id, "live");
  assert.deepEqual(active.context, { ok: false, reason: "broken live context", handlers: {} });
  assert.equal(runtime.runtimeContexts.has("live"), false);
});
