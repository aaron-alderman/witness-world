import assert from "node:assert/strict";
import test from "node:test";
import {
  createSurfaceInteractionRuntime,
  describeSurfaceRuntimeView
} from "../src/runtime-surface-interaction-runtime.js";

test("describeSurfaceRuntimeView stays generic by default", () => {
  const view = describeSurfaceRuntimeView({
    id: "Surface.Login",
    surfaceKind: "auth-screen",
    props: { domId: "surface-login" }
  });

  assert.equal(view.rootId, "surface-login");
  assert.deepEqual(view.propTargets, {});
  assert.deepEqual(view.interactionTargets, {});
});

test("createSurfaceInteractionRuntime blocks honestly when interactive semantics lack generic target descriptors", () => {
  const logs = [];
  const runtime = createSurfaceInteractionRuntime({
    document: {
      getElementById() {
        return null;
      }
    },
    window: {
      console: {
        error: (...args) => logs.push(args.join(" "))
      }
    },
    manifest: {
      surfaces: [
        {
          id: "Surface.Login",
          runtime: {
            processRef: "RouteProcess",
            projectionRefs: [],
            capabilityRefs: [],
            bindings: [],
            interactions: [
              {
                target: "primary",
                event: "click",
                action: { kind: "navigate", href: "/next" }
              }
            ]
          },
          view: {
            rootId: "surface-login",
            propTargets: {},
            interactionTargets: {}
          }
        }
      ],
      processWitnesses: []
    },
    createProcessRuntimeImpl() {
      throw new Error("process runtime must not be created when descriptors are missing");
    }
  });

  assert.equal(runtime.processRuntime, null);
  assert.equal(runtime.blocked?.limitationType, "platform");
  assert.match(runtime.blocked?.missingPrimitive ?? "", /interaction target descriptors/i);
  assert.equal(logs.some(entry => /missing generic interaction target descriptors/i.test(entry)), true);
});
