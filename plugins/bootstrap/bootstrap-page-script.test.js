import test from "node:test";
import assert from "node:assert/strict";
import { renderBootstrapPageScript } from "./bootstrap-page-script.js";

test("bootstrap page script renders helper-owned factory assembly and startup boot call", () => {
  const script = renderBootstrapPageScript({
    guidance: {
      id: "tutorial.todo",
      note: "keep <tags> escaped"
    }
  });

  assert.match(script, /startBootstrapClientRuntime/);
  assert.match(script, /const createBootstrapClientHttp =/);
  assert.match(script, /const bindBootstrapClientRuntimeAdapters =/);
  assert.match(script, /const createBootstrapClientRuntimeGuidance =/);
  assert.match(script, /const createBootstrapClientRuntimeOrchestration =/);
  assert.match(script, /const createBootstrapClientRuntimeSupport =/);
  assert.match(script, /const bootstrapGuidance = /);
  assert.match(script, /"tutorial\.todo"/);
  assert.match(script, /\\u003ctags\\u003e/);
  assert.match(script, /currentSurfacePage: "bootstrap"/);
  assert.match(script, /fetchFn: \(\.\.\.args\) => fetch\(\.\.\.args\)/);
});
