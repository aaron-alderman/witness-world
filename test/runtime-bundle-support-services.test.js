import assert from "node:assert/strict";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import { createRuntimeProjectionServices, createMcpBundleSupportServices } from "../src/runtime-bundle-support-services.js";

test("runtime projection services derive visible process inputs and process selection", () => {
  const world = {
    allWitnesses: () => [{ id: "w1" }, { id: "w2" }],
    allObservations: () => [
      {
        process: "backend.request.finish",
        body: {
          emittedWitnessIds: ["w1", "w3"],
          failureWitnessIds: ["w2", "w4"]
        }
      },
      {
        process: "other.process",
        body: {
          emittedWitnessIds: ["w1"],
          failureWitnessIds: ["w2"]
        }
      }
    ]
  };

  const services = createRuntimeProjectionServices({ world });
  const requestUrl = new URL("http://127.0.0.1/process?program=p1&event=e1&runId=r1&node=n1&replay=latest");
  const selected = services.processSelection(requestUrl);
  const inputs = services.processViewInputs("aaron", {
    visibleWitnesses: () => [{ id: "w1" }]
  });

  assert.deepEqual(selected, {
    program: "p1",
    event: "e1",
    runId: "r1",
    nodeId: "n1",
    replay: "latest"
  });
  assert.deepEqual(inputs.witnesses, [{ id: "w1" }]);
  assert.deepEqual(inputs.observations, [
    {
      process: "backend.request.finish",
      body: {
        emittedWitnessIds: ["w1"],
        failureWitnessIds: []
      }
    }
  ]);
  assert.deepEqual(services.requestActors({ actors: [{ id: "aaron" }] }), [{ id: "aaron" }]);
});

test("mcp bundle support services provide origin, principal, scope, and capability helpers", () => {
  const world = {
    project(projector) {
      if (projector === moduleProjectors.mcpServerIndex) return { byId: { "mcp.demo": { id: "mcp.demo" } } };
      if (projector === moduleProjectors.mcpToolInstalls) return [{ id: "install-1" }];
      if (projector === moduleProjectors.modules) return new Map([["ctx.demo", "context"], ["widget.demo", "widget"]]);
      if (projector === moduleProjectors.objectContexts) return new Map([["widget.demo", "ctx.demo"]]);
      return null;
    }
  };
  const services = createMcpBundleSupportServices({
    world,
    backendHost: "backendHost",
    mcpInternalToken: "internal-secret",
    runtimeConfigLookup: (runtimeConfig, key) => runtimeConfig?.[key],
    resolveMcpToolScope: () => ({ contextIds: [], targetIds: ["widget.demo"] }),
    hostCapabilities: () => new Set(["fs.blob", "jobs.queue", "notify.email"]),
    headerValue: value => Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")
  });

  assert.equal(services.currentMcpServerIndex().byId["mcp.demo"].id, "mcp.demo");
  assert.deepEqual(services.currentMcpToolInstalls(), [{ id: "install-1" }]);
  assert.equal(services.mcpToolAvailable("storage.blob"), true);
  assert.equal(services.mcpToolAvailable("notifications"), true);
  assert.deepEqual(
    services.validateMcpOrigin({ headers: { origin: "http://localhost:3000", host: "127.0.0.1:8787" } }),
    { ok: true }
  );
  assert.deepEqual(
    services.resolveMcpPrincipal({
      req: {
        headers: {
          "x-witness-mcp-transport": "stdio",
          "x-witness-mcp-actor": "aaron",
          "x-witness-mcp-internal-token": "internal-secret"
        }
      },
      requestActor: null,
      mcpServer: { id: "mcp.demo", serviceIdentity: "service.actor" },
      appContext: { runtimeConfig: {} }
    }),
    { ok: true, actingMode: "delegated", actor: "aaron", transport: "stdio" }
  );
  assert.deepEqual(
    services.mcpScopeAllows(
      { scopeContexts: ["ctx.demo"], scopeTargets: [] },
      {},
      {}
    ),
    { ok: true, reason: null }
  );
});
