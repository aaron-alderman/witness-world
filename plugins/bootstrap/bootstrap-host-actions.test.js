import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  bootstrapHostActionContractsByAction,
  loadBootstrapHostActionContracts
} from "./bootstrap-host-action-contracts.js";
import {
  bindBootstrapHostActions,
  renderBootstrapHostActionFactory,
  runBootstrapHostAction
} from "./bootstrap-host-actions.js";

test("bootstrap host action contracts load from authored WTOML", async () => {
  const source = await readFile(new URL("./bootstrap-host-action-contracts.wtoml", import.meta.url), "utf8");
  const contracts = loadBootstrapHostActionContracts();

  assert.equal(source.includes('action = "open-app"'), true);
  assert.equal(source.includes('desktopMethod = "revealWorldHome"'), true);
  assert.equal(contracts["desktop-open-world"].successStatus, "Switching to the selected world home.");
  assert.equal(contracts["desktop-reveal-world"].failureFallbackStatus, "Unable to reveal world home.");
});

test("runBootstrapHostAction delegates open-app to the provided opener with tutorial-aware advance", async () => {
  const calls = [];
  const result = await runBootstrapHostAction({
    action: "open-app",
    tutorialStep: () => ({ id: "open-app" }),
    contractsByAction: bootstrapHostActionContractsByAction,
    openAppHome: async options => {
      calls.push(options);
      return { opened: true, from: "test" };
    }
  });

  assert.deepEqual(calls, [{ advance: true }]);
  assert.deepEqual(result, { opened: true, from: "test" });
});

test("runBootstrapHostAction updates desktop status for desktop action outcomes", async () => {
  const statuses = [];
  const calls = [];
  const desktop = {
    async openWorldHome() {
      calls.push("open");
      return { ok: true };
    },
    async createWorldHome() {
      calls.push("create");
      return { canceled: true };
    },
    async revealWorldHome() {
      calls.push("reveal");
      return { ok: false, reason: "No world home to reveal." };
    }
  };

  const openResult = await runBootstrapHostAction({
    action: "desktop-open-world",
    contractsByAction: bootstrapHostActionContractsByAction,
    desktopApi: () => desktop,
    setDesktopStatus: message => statuses.push(message)
  });
  const createResult = await runBootstrapHostAction({
    action: "desktop-create-world",
    contractsByAction: bootstrapHostActionContractsByAction,
    desktopApi: () => desktop,
    setDesktopStatus: message => statuses.push(message)
  });
  const revealResult = await runBootstrapHostAction({
    action: "desktop-reveal-world",
    contractsByAction: bootstrapHostActionContractsByAction,
    desktopApi: () => desktop,
    setDesktopStatus: message => statuses.push(message)
  });

  assert.deepEqual(calls, ["open", "create", "reveal"]);
  assert.deepEqual(statuses, [
    "Switching to the selected world home.",
    "Create world canceled.",
    "No world home to reveal."
  ]);
  assert.equal(openResult.handled, true);
  assert.equal(createResult.handled, true);
  assert.equal(revealResult.handled, true);
});

test("runBootstrapHostAction reports unknown actions explicitly", async () => {
  const bootstrapStatuses = [];
  const result = await runBootstrapHostAction({
    action: "mystery",
    contractsByAction: bootstrapHostActionContractsByAction,
    setBootstrapStatus: message => bootstrapStatuses.push(message)
  });

  assert.deepEqual(bootstrapStatuses, ["Unknown bootstrap host action: mystery"]);
  assert.deepEqual(result, { handled: false, reason: "unknown-action", action: "mystery" });
});

test("bindBootstrapHostActions registers the shared host bridge and routes matching events", async () => {
  const listeners = new Map();
  const desktopStatuses = [];
  const target = {
    addEventListener(name, handler) {
      listeners.set(name, handler);
    }
  };

  bindBootstrapHostActions({
    target,
    tutorialStep: () => ({ id: "other" }),
    openAppHome: async () => ({ opened: true }),
    contractsByAction: bootstrapHostActionContractsByAction,
    desktopApi: () => ({
      async openWorldHome() {
        return { ok: true };
      }
    }),
    setDesktopStatus: message => desktopStatuses.push(message)
  });

  assert.equal(typeof listeners.get("witness:bootstrap-host-action"), "function");
  await listeners.get("witness:bootstrap-host-action")({ detail: { source: "bootstrap-top-cards", action: "desktop-open-world" } });

  assert.deepEqual(desktopStatuses, ["Switching to the selected world home."]);
});

test("renderBootstrapHostActionFactory exposes the shared browser seam", () => {
  const factory = renderBootstrapHostActionFactory();

  assert.equal(factory.includes("const bindBootstrapHostActions ="), true);
  assert.equal(factory.includes("const runBootstrapHostAction ="), true);
  assert.equal(factory.includes("const bootstrapHostActionContractsByAction ="), true);
  assert.equal(factory.includes("const contractForAction ="), true);
  assert.equal(factory.includes("desktop-open-world"), true);
});
