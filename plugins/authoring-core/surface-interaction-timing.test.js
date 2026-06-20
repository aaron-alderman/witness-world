import test from "node:test";
import assert from "node:assert/strict";
import { createWorld } from "../../src/kernel.js";
import { requestSurfaceDefine } from "./authoring-core-processes.js";

test("surface.create rejects invalid or unsupported interaction timing declarations", () => {
  const world = createWorld();

  const invalidShape = requestSurfaceDefine(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "Surface.Search",
      interactions: [{
        target: "field",
        event: "input",
        action: { kind: "deliver", message: "SearchRequested" },
        timing: { mode: "debounce", ms: 0 }
      }]
    }
  });

  assert.equal(invalidShape.ok, false);
  assert.equal(invalidShape.status, 400);
  assert.match(invalidShape.error, /invalid timing/i);

  const invalidActionKind = requestSurfaceDefine(world, {
    actor: "callan",
    backendHost: "backendHost",
    body: {
      id: "Surface.Profile",
      interactions: [{
        target: "self",
        event: "click",
        action: {
          kind: "setState",
          state: "ProfileVisible",
          value: { literal: true }
        },
        timing: { mode: "throttle", ms: 20 }
      }]
    }
  });

  assert.equal(invalidActionKind.ok, false);
  assert.equal(invalidActionKind.status, 400);
  assert.match(invalidActionKind.error, /only supported for deliver actions/i);
});
