import assert from "node:assert/strict";
import test from "node:test";
import { createGenericRouteHandlers } from "../src/runtime-host-route-factory.js";

test("runtime host route factory wires shared route-handler deps outside host.js", () => {
  const world = {
    project() {
      return [];
    }
  };

  const handlers = createGenericRouteHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    sessionStore: new Map(),
    logger: { info() {}, error() {} }
  });

  assert.equal(typeof handlers, "object");
  assert.equal(typeof handlers["session.read"], "function");
});
