import assert from "node:assert/strict";
import test from "node:test";
import { resolveStartupPersistenceCommitMode } from "../src/app-runtime.js";

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
