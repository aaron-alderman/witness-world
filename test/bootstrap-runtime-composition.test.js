import assert from "node:assert/strict";
import test from "node:test";
import { startBlankUiServer, startBlankUiServerWithWorldHome } from "./support/harness.js";

test("blank bootstrap UI server uses the explicit bootstrap runtime composition", async () => {
  const { server, close } = await startBlankUiServer();

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    const plugins = await fetch(`${server.url}/api/runtime/plugins`).then(response => response.json());
    const bootstrapPage = await fetch(`${server.url}/`).then(response => response.text());

    assert.equal(diagnostics.requestedProfile, "minimal");
    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual(
      [...diagnostics.plugins.startupPluginIds].sort(),
      ["plugin.authoring", "plugin.starter", "plugin.tutorial"]
    );
    assert.equal(diagnostics.composition.storyId, "startup-runner-driven");
    assert.equal(diagnostics.composition.activeRunnerSource, "startup-default-runner");
    assert.equal(diagnostics.composition.activePluginSource, "startup-defaults");
    assert.deepEqual(
      [...diagnostics.plugins.activePluginIds].sort(),
      [
        "plugin.authoring",
        "plugin.authoring-core",
        "plugin.bootstrap",
        "plugin.capability-authoring",
        "plugin.mcp-authoring",
        "plugin.program-authoring",
        "plugin.proposals",
        "plugin.server-runner-authoring",
        "plugin.starter",
        "plugin.tutorial"
      ]
    );
    assert.equal(plugins.packages.some(row => row.id === "plugin.bootstrap" && row.activation.active === true), true);
    assert.match(bootstrapPage, /Recover And Author The App Boundary/);
  } finally {
    await close();
  }
});

test("world-home bootstrap UI server keeps the explicit bootstrap runtime composition and operator contract", async () => {
  const { server, operatorContract, close } = await startBlankUiServerWithWorldHome();

  try {
    const diagnostics = await fetch(`${server.url}/api/runtime/diagnostics`).then(response => response.json());
    const state = await fetch(`${server.url}/api/bootstrap-state`).then(response => response.json());

    assert.equal(diagnostics.requestedProfile, "minimal");
    assert.equal(diagnostics.activeProfile, "minimal");
    assert.equal(diagnostics.composition.storyId, "startup-runner-driven");
    assert.equal(diagnostics.composition.activePluginSource, "startup-defaults");
    assert.equal(diagnostics.operator.layout, "world-home-v1");
    assert.equal(state.operator.contract.layout, "world-home-v1");
    assert.equal(state.operator.contract.worldHome, operatorContract.worldHome);
  } finally {
    await close();
  }
});
