import assert from "node:assert/strict";
import test from "node:test";
import { declareAppProjectHosts, resolveStartupPersistenceCommitMode } from "../src/app-runtime.js";
import { createWorld } from "../src/kernel.js";
import { hostCapabilities } from "../src/host.js";

test("app runtime defaults startup persistence commit mode to post-ready", () => {
  const mode = resolveStartupPersistenceCommitMode({
    targets: {
      server: [
        {
          id: "runner-1",
          default: true,
          values: {}
        }
      ]
    }
  });
  assert.equal(mode, "post-ready");
});

test("app runtime reads startup persistence commit mode from authored server runner config", () => {
  const mode = resolveStartupPersistenceCommitMode({
    targets: {
      server: [
        {
          id: "runner-1",
          default: true,
          values: {
            runtimeConfig: {
              "startup.persistence.commitMode": "pre-ready"
            }
          }
        },
        {
          id: "runner-2",
          values: {
            runtimeConfig: {
              "startup.persistence.commitMode": "post-ready"
            }
          }
        }
      ]
    }
  }, "runner-1");
  assert.equal(mode, "pre-ready");
});

test("app runtime declares authored server target hosts before witness docs apply", () => {
  const world = createWorld();

  declareAppProjectHosts(world, {
    appProject: {
      targets: {
        server: [
          {
            id: "runner-1",
            values: {
              backendHost: "backendHost",
              frontendHost: "frontendHost"
            }
          },
          {
            id: "runner-2",
            values: {
              backendHost: "backendHost",
              frontendHost: "frontendHost"
            }
          }
        ]
      }
    },
    runtimeProfile: "full"
  });

  const witnesses = world.allWitnesses();
  assert.equal(witnesses.some(witness => witness.process === "declareBackendHost" && witness.body?.id === "backendHost"), true);
  assert.equal(witnesses.some(witness => witness.process === "declareFrontendHost" && witness.body?.id === "frontendHost"), true);
  assert.equal(hostCapabilities(world, "backendHost").has("http.serve"), true);
  assert.equal(hostCapabilities(world, "frontendHost").has("dom.render"), true);
});
