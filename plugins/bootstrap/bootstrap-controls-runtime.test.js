import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapControlsRuntimeFromBootstrap,
  renderBootstrapControlsRuntimeFactory
} from "./bootstrap-controls-runtime.js";

class FakeOption {
  constructor(label, value) {
    this.label = label;
    this.text = label;
    this.value = value;
  }
}

function createSelectNode(initialValue, optionValues = []) {
  let currentValue = initialValue;
  return {
    options: optionValues.map(value => ({ value, label: value })),
    get value() {
      return currentValue;
    },
    set value(nextValue) {
      currentValue = nextValue;
    },
    append(option) {
      this.options.push(option);
    },
    set innerHTML(_value) {
      this.options = [];
      currentValue = "";
    }
  };
}

function withDomGlobals(callback) {
  const previousCss = globalThis.CSS;
  const previousOption = globalThis.Option;
  globalThis.CSS = { escape: value => String(value) };
  globalThis.Option = FakeOption;
  try {
    callback();
  } finally {
    globalThis.CSS = previousCss;
    globalThis.Option = previousOption;
  }
}

test("bootstrap shared controls runtime owns state-to-live-runtime wiring for backend, proposal, scoped, direct runtime integration, and capability seams", () => {
  withDomGlobals(() => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    const listeners = new Map();
    const proposalRunner = createSelectNode("runner.current", ["runner.current", "runner.next"]);
    const proposalApproveId = createSelectNode("proposal.one", ["proposal.one", "proposal.two"]);
    const proposalRejectId = createSelectNode("proposal.two", ["proposal.one", "proposal.two"]);
    const backendActivateSoul = createSelectNode("program.alpha", ["program.alpha", "program.beta"]);
    const backendActivateVersion = createSelectNode("v2", ["v1", "v2"]);
    const backendRollbackSoul = createSelectNode("program.alpha", ["program.alpha", "program.beta"]);
    const scopedTarget = createSelectNode("widget.current", ["widget.current", "widget.next"]);
    const directRunner = createSelectNode("runner.current", ["runner.current", "runner.next"]);
    const capabilityTarget = createSelectNode("route.home", ["route.home", "route.admin"]);
    const proposalButton = { disabled: false };
    const scopedButton = { disabled: false };
    const directButton = { disabled: false };
    const capabilityButton = { disabled: false };
    const proposalStatus = { textContent: "" };
    const scopedStatus = { textContent: "" };
    const directStatus = { textContent: "" };
    const capabilityStatus = { textContent: "" };
    const proposalForm = {
      elements: {
        namedItem(name) {
          return proposalForm.fields[name] || null;
        }
      },
      fields: {
        serviceIdentity: { value: "identity.demo" }
      },
      querySelector(selector) {
        if (selector === '[name="serviceIdentity"]') return this.fields.serviceIdentity;
        if (selector === 'button[type="submit"]') return proposalButton;
        return null;
      }
    };
    const directForm = {
      elements: {
        namedItem(name) {
          return directForm.fields[name] || null;
        }
      },
      fields: {
        serviceIdentity: { value: "identity.demo" },
        transportsJson: { value: "[\"stdio\"]" }
      },
      querySelector(selector) {
        if (selector === '[name="serviceIdentity"]') return this.fields.serviceIdentity;
        if (selector === '[name="transportsJson"]') return this.fields.transportsJson;
        if (selector === 'button[type="submit"]') return directButton;
        return null;
      }
    };
    const nodes = new Map([
      ["runtime-plugin-install-proposal-runner", proposalRunner],
      ["proposal-approve-id", proposalApproveId],
      ["proposal-reject-id", proposalRejectId],
      ["proposal-form", {
        elements: {
          namedItem(name) {
            const fields = {
              targetProcess: { value: "backendProgramVersion.activate" },
              targetKind: { value: "backendProgram" },
              targetId: { value: "program.beta" },
              bodyJson: { value: '{"soul":"program.beta","version":"v2"}' }
            };
            return fields[name] || null;
          }
        },
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return proposalButton;
          return null;
        }
      }],
      ["backend-program-activate-soul", backendActivateSoul],
      ["backend-program-activate-version", backendActivateVersion],
      ["backend-program-rollback-soul", backendRollbackSoul],
      ["runtime-plugin-install-proposal-plugin", createSelectNode("plugin.demo", ["plugin.demo"])],
      ["runtime-plugin-install-proposal-help", proposalStatus],
      ["runtime-plugin-install-proposal-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return proposalButton;
          return null;
        }
      }],
      ["mcp-server-proposal-form", proposalForm],
      ["context-binding-context", createSelectNode("ctx.current", ["ctx.current", "ctx.next"])],
      ["context-binding-target", scopedTarget],
      ["context-binding-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return scopedButton;
          return null;
        }
      }],
      ["runtime-plugin-install-runner", directRunner],
      ["runtime-plugin-install-plugin", createSelectNode("plugin.demo", ["plugin.demo"])],
      ["runtime-plugin-install-help", directStatus],
      ["runtime-plugin-install-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return directButton;
          return null;
        }
      }],
      ["mcp-server-runner", createSelectNode("runner.current", ["runner.current"])],
      ["mcp-server-context", createSelectNode("", ["ctx.next"])],
      ["mcp-server-help", { textContent: "" }],
      ["mcp-server-form", directForm],
      ["capability-context", createSelectNode("ctx.next", ["ctx.next"])],
      ["capability-install-capability", createSelectNode("notes.sidebar", ["notes.sidebar"])],
      ["capability-remove-capability", createSelectNode("notes.sidebar", ["notes.sidebar"])],
      ["capability-install-kind", createSelectNode("routePage", ["routePage"])],
      ["capability-remove-kind", createSelectNode("routePage", ["routePage"])],
      ["capability-install-target", capabilityTarget],
      ["capability-remove-target", createSelectNode("route.home", ["route.home", "route.admin"])],
      ["capability-install-help", capabilityStatus],
      ["capability-remove-help", { textContent: "" }],
      ["capability-install-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return capabilityButton;
          return null;
        }
      }],
      ["capability-remove-form", {
        querySelector(selector) {
          if (selector === 'button[type="submit"]') return { disabled: false };
          return null;
        }
      }]
    ]);
    const target = {
      addEventListener(name, handler) {
        listeners.set(name, handler);
      }
    };
    const document = {
      getElementById(id) {
        return nodes.get(id) || null;
      }
    };
    const state = {
      bootstrapState: {
        identities: [],
        contexts: [{ id: "ctx.current" }],
        proposals: [{ id: "proposal.one", status: "open" }],
        backendPrograms: [{ soul: "program.alpha", context: "ctx.current" }],
        backendProgramVersions: [{ soul: "program.alpha", version: "v1", active: true }],
        backendProgramTransitions: [],
        backendProgramActivationHistory: [],
        serverRunners: [{ id: "runner.current" }],
        runtimePluginAvailability: [{ serverRunner: "runner.current", plugin: "plugin.demo", installable: false, installed: false }],
        capabilityCatalog: [],
        capabilityInstalls: []
      },
      session: { authenticated: false },
      model: {
        runtimeProfile: "minimal",
        proposalTargetProcesses: ["backendProgramVersion.activate"],
        supportedMcpActingModes: ["delegated"],
        contextBindableTargets: [{ id: "widget.current", context: "ctx.current" }],
        stewardshipTargetKinds: ["context"],
        capabilityTargetKinds: ["routePage"],
        capabilityTargets: {
          routePages: [{ id: "route.home", path: "/home" }]
        }
      }
    };

    globalThis.window = target;
    globalThis.document = document;

    try {
      const runtime = createBootstrapControlsRuntimeFromBootstrap({ state });

      state.bootstrapState = {
        identities: [{ id: "identity.aaron" }],
        contexts: [{ id: "ctx.next" }],
        proposals: [{
          id: "proposal.one",
          status: "open",
          proposer: "operator.demo",
          targetProcess: "backendProgramVersion.activate",
          targetKind: "backendProgram",
          targetId: "program.beta",
          body: { soul: "program.beta", version: "v2" }
        }],
        backendPrograms: [{ soul: "program.beta", context: "ctx.next" }],
        backendProgramVersions: [
          { soul: "program.beta", version: "v1", active: true, index: 1 },
          { soul: "program.beta", version: "v2", active: false, index: 2 }
        ],
        backendProgramTransitions: [{ soul: "program.beta", from: "v1", to: "v2", strategy: "migrate" }],
        backendProgramActivationHistory: [
          { soul: "program.beta", version: "v1" },
          { soul: "program.beta", version: "v2" }
        ],
        authority: { mutationContexts: ["ctx.next"] },
        serverRunners: [{ id: "runner.next" }],
        runtimePluginAvailability: [{ serverRunner: "runner.next", plugin: "plugin.alt", installable: true, installed: false }],
        capabilityCatalog: [{
          id: "notes.sidebar",
          placement: ["routePage"],
          capabilitySourceState: "both"
        }],
        capabilityInstalls: []
      };
      state.session = { authenticated: true };
      state.model = {
        runtimeProfile: "full",
        proposalTargetProcesses: ["backendProgramVersion.activate", "backendProgramVersion.rollback"],
        supportedMcpActingModes: ["delegated", "service"],
        contextBindableTargets: [{ id: "widget.next", context: "ctx.next" }],
        stewardshipTargetKinds: ["context", "perspective"],
        capabilityTargetKinds: ["routePage"],
        capabilityTargets: {
          routePages: [{ id: "route.admin", path: "/admin" }]
        }
      };

      assert.deepEqual(runtime.liveState.authored(), state.bootstrapState);
      assert.deepEqual(runtime.liveState.session(), state.session);
      assert.deepEqual(runtime.liveState.model(), state.model);
      assert.equal(runtime.dom.readSelectValue("runtime-plugin-install-proposal-runner"), "runner.current");

      const backendDeps = runtime.buildBackendControlsSyncDeps();
      assert.deepEqual(backendDeps.authored, state.bootstrapState);
      assert.deepEqual(backendDeps.session, state.session);
      assert.deepEqual(backendDeps.authorityContexts, ["ctx.next"]);
      assert.equal(backendDeps.readSelectValue("backend-program-activate-soul"), "program.alpha");

      const proposalControlsDeps = runtime.buildProposalControlsSyncDeps();
      assert.deepEqual(proposalControlsDeps.authored, state.bootstrapState);
      assert.deepEqual(proposalControlsDeps.session, state.session);
      assert.deepEqual(proposalControlsDeps.proposalTargetProcesses, [
        "backendProgramVersion.activate",
        "backendProgramVersion.rollback"
      ]);
      assert.equal(proposalControlsDeps.readSelectValue("proposal-approve-id"), "proposal.one");
      assert.equal(proposalControlsDeps.readFieldValue("proposal-form", "targetId"), "program.beta");

      const proposalDeps = runtime.buildProposalAdjacentSyncDeps();
      assert.deepEqual(proposalDeps.authored, state.bootstrapState);
      assert.deepEqual(proposalDeps.session, state.session);
      assert.equal(proposalDeps.runtimeProfile, "full");

      const scopedDeps = runtime.buildScopedControlsSyncDeps();
      assert.deepEqual(scopedDeps.authored, state.bootstrapState);
      assert.deepEqual(scopedDeps.session, state.session);
      assert.deepEqual(scopedDeps.contextBindableTargets("ctx.next"), [{ id: "widget.next", context: "ctx.next" }]);

      const directDeps = runtime.buildRuntimeIntegrationDirectControlsSyncDeps();
      assert.deepEqual(directDeps.authored, state.bootstrapState);
      assert.equal(directDeps.runtimeProfile, "full");
      assert.equal(directDeps.readFieldValue("mcp-server-form", "serviceIdentity"), "identity.demo");

      runtime.capabilityControls.bind();
      const renderResult = runtime.capabilityControls.render();
      assert.equal(renderResult.handled, true);
      assert.equal(listeners.has("witness:bootstrap-capability-controls-sync"), true);
      assert.equal(capabilityStatus.textContent.includes("supports placements: routePage"), true);
      assert.equal(capabilityTarget.value, "route.admin");
      assert.equal(capabilityButton.disabled, false);
    } finally {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
    }
  });
});

test("bootstrap shared controls runtime factory exposes the browser seam", () => {
  const factory = renderBootstrapControlsRuntimeFactory();

  assert.equal(factory.includes("const createBootstrapControlsRuntimeFromBootstrap ="), true);
});
