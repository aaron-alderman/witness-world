import assert from "node:assert/strict";
import test from "node:test";
import {
  createHostOperationRuntime,
  createWitnessCoreShadowInvoker
} from "../src/desire/index.js";

test("host operation runtime returns the JS result while forwarding a canonical shadow payload", async () => {
  const shadowCalls = [];
  const runtime = createHostOperationRuntime({
    shadowInvoker: createWitnessCoreShadowInvoker({
      async shadowInvokeComputeModule(payload) {
        shadowCalls.push(payload);
        return { ok: true, status: "matched" };
      }
    }),
    handlers: {
      "engentus.pipeline.health.classify": request => ({
        status: "success",
        payload: {
          hour_start: request.hour_start,
          n_valid_channels: 5,
          n_bolts_evaluated: 3
        }
      })
    }
  });

  const response = await runtime.invoke({
    host_operation: "engentus.pipeline.health.classify",
    request: {
      mill_id: "B01",
      source_name: "engentus.mill.pipeline",
      hour_start: "2026-01-01T00:00:00Z"
    }
  });

  assert.deepEqual(response, {
    status: "success",
    payload: {
      hour_start: "2026-01-01T00:00:00Z",
      n_valid_channels: 5,
      n_bolts_evaluated: 3
    }
  });
  assert.equal(shadowCalls.length, 1);
  assert.deepEqual(shadowCalls[0], {
    hostOperation: "engentus.pipeline.health.classify",
    inputJson: "{\"hostOperation\":\"engentus.pipeline.health.classify\",\"request\":{\"hour_start\":\"2026-01-01T00:00:00Z\",\"mill_id\":\"B01\",\"source_name\":\"engentus.mill.pipeline\"}}",
    jsResultJson: "{\"payload\":{\"hour_start\":\"2026-01-01T00:00:00Z\",\"n_bolts_evaluated\":3,\"n_valid_channels\":5},\"status\":\"success\"}"
  });
});
