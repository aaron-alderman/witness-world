import test from "node:test";
import assert from "node:assert/strict";
import { resolveBootstrapStarterPlanDynamicValues } from "./bootstrap-starter-plan-hosts.js";

test("starter-plan host helper uses the first configured bootstrap hosts", () => {
  assert.deepEqual(resolveBootstrapStarterPlanDynamicValues({
    bootstrapModel: {
      backendHosts: [{ id: "backend-host-a" }, { id: "backend-host-b" }],
      frontendHosts: [{ id: "frontend-host-a" }, { id: "frontend-host-b" }]
    }
  }), {
    backendHost: "backend-host-a",
    frontendHost: "frontend-host-a"
  });
});

test("starter-plan host helper falls back to authored placeholder ids when hosts are absent", () => {
  assert.deepEqual(resolveBootstrapStarterPlanDynamicValues(), {
    backendHost: "backendHost",
    frontendHost: "frontendHost"
  });
});
