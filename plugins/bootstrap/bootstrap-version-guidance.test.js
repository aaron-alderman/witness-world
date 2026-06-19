import test from "node:test";
import assert from "node:assert/strict";
import {
  authoritySummary,
  buildVersionActivationGuidance,
  buildVersionRollbackGuidance,
  previousVersionFromHistory,
  proposalBodyIssues,
  renderBootstrapVersionGuidanceFactory,
  summarizeGovernedProposalTarget,
  summarizeGovernedProposalTargetFromBootstrap,
  summarizeVersionedProposalTarget,
  transitionRowFor,
  uniqueVersionSequence
} from "./bootstrap-version-guidance.js";

test("bootstrap version guidance derives stable version history helpers", () => {
  assert.deepEqual(uniqueVersionSequence([
    { version: "v1" },
    { version: "v1" },
    { version: "v2" },
    { version: "" },
    {}
  ]), ["v1", "v2"]);
  assert.equal(previousVersionFromHistory([{ version: "v1" }, { version: "v2" }], "v2"), "v1");
  assert.equal(previousVersionFromHistory([{ version: "v1" }, { version: "v2" }], ""), "v1");
  assert.deepEqual(transitionRowFor([{ from: "v1", to: "v2", strategy: "compatible" }], "v1", "v2"), {
    from: "v1",
    to: "v2",
    strategy: "compatible"
  });
});

test("bootstrap version guidance reports authority and activation/rollback status", () => {
  assert.equal(authoritySummary("backend", ["backend"]), "Current actor can mutate context backend directly.");
  assert.equal(
    authoritySummary("backend", []),
    "Current actor is outside mutation context backend; direct actions may require a stewarded path."
  );
  assert.equal(
    buildVersionActivationGuidance({
      soul: "todo.todos.list",
      currentVersion: "todo.todos.list.v1",
      targetVersion: "todo.todos.list.v2",
      targetIndex: 1,
      transitionStrategy: "compatible",
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).helpText.includes("Transition strategy: compatible."),
    true
  );
  assert.equal(
    buildVersionActivationGuidance({
      soul: "todo.todos.list",
      currentVersion: "todo.todos.list.v1",
      targetVersion: "todo.todos.list.v1",
      targetIndex: 0,
      transitionStrategy: null,
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).submitDisabled,
    true
  );
  assert.equal(
    buildVersionRollbackGuidance({
      soul: "todo.todos.list",
      currentVersion: "todo.todos.list.v2",
      previousVersion: "todo.todos.list.v1",
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).helpText.includes("Rollback target from activation history: todo.todos.list.v1."),
    true
  );
});

test("bootstrap version guidance summarizes governed proposal targets and body issues", () => {
  assert.deepEqual(
    proposalBodyIssues({ targetProcess: "backendProgramVersion.rollback", targetId: "todo.todos.list", body: {} }),
    ["Body JSON must include soul."]
  );
  assert.deepEqual(
    proposalBodyIssues({
      targetProcess: "packagePatch.define",
      targetId: "packageRevision.plugin.inspect.v1",
      body: {}
    }),
    [
      "Body JSON must include package or packageRef.",
      "Body JSON must include path.",
      "Body JSON must include operation.",
      "Body JSON must include sourceLanguage."
    ]
  );
  const backendRollback = summarizeVersionedProposalTarget({
    domain: "backend",
    change: "rollback",
    targetId: "todo.todos.list",
    body: { soul: "todo.todos.list" },
    currentVersion: "todo.todos.list.v2",
    previousVersion: "todo.todos.list.v1",
    authoritySummaryText: authoritySummary("backend", ["backend"])
  });
  assert.equal(backendRollback.includes("Backend program rollback proposal for soul todo.todos.list."), true);
  assert.equal(backendRollback.includes("Expected rollback target: todo.todos.list.v1."), true);
  assert.equal(backendRollback.includes("Current actor can mutate context backend directly."), true);

  const widgetActivate = summarizeVersionedProposalTarget({
    domain: "widget",
    change: "activate",
    targetId: "todo.root",
    body: { soul: "todo.root", version: "todo.root.v2" },
    currentVersion: "todo.root.v1",
    transitionStrategy: "compatible"
  });
  assert.equal(widgetActivate.includes("Widget version activation proposal for soul todo.root."), true);
  assert.equal(widgetActivate.includes("Requested version: todo.root.v2."), true);
  assert.equal(widgetActivate.includes("Approval requires authority on the governed widget target."), true);

  const packageDefine = summarizeGovernedProposalTarget({
    targetProcess: "package.define",
    targetKind: "context",
    targetId: "ctx.packages",
    body: { id: "package.plugin.inspect", packageKind: "plugin" },
    authoritySummaryText: authoritySummary("ctx.packages", [])
  });
  assert.equal(packageDefine.includes("Package definition proposal for context ctx.packages."), true);
  assert.equal(packageDefine.includes("Package id: package.plugin.inspect."), true);
  assert.equal(packageDefine.includes("Package kind: plugin."), true);
  assert.equal(packageDefine.includes("Current actor is outside mutation context ctx.packages; direct actions may require a stewarded path."), true);
});

test("bootstrap version guidance summarizes governed proposal targets from supplied state rows", () => {
  const backendActivate = summarizeGovernedProposalTarget({
    targetProcess: "backendProgramVersion.activate",
    targetId: "todo.todos.list",
    body: { soul: "todo.todos.list", version: "todo.todos.list.v2" },
    backendVersionRows: [
      { soul: "todo.todos.list", version: "todo.todos.list.v1", active: true },
      { soul: "todo.todos.list", version: "todo.todos.list.v2", active: false }
    ],
    backendTransitionRows: [
      { from: "todo.todos.list.v1", to: "todo.todos.list.v2", strategy: "compatible" }
    ],
    authoritySummaryText: authoritySummary("backend", ["backend"])
  });
  assert.equal(backendActivate.includes("Requested version: todo.todos.list.v2."), true);
  assert.equal(backendActivate.includes("Transition strategy: compatible."), true);
  assert.equal(backendActivate.includes("Current actor can mutate context backend directly."), true);

  const widgetRollback = summarizeGovernedProposalTarget({
    targetProcess: "widgetVersion.rollback",
    targetId: "todo.root",
    body: { soul: "todo.root" },
    widgetActivationHistoryRows: [
      { version: "todo.root.v1" },
      { version: "todo.root.v2" }
    ]
  });
  assert.equal(widgetRollback.includes("Expected rollback target: todo.root.v1."), true);
  assert.equal(widgetRollback.includes("Approval requires stewarded authority on the governed widget target."), true);

  assert.equal(
    summarizeGovernedProposalTarget({
      targetProcess: "perspective.define",
      targetKind: "context",
      targetId: "ctx.docs"
    }),
    "Proposal targets perspective.define on context ctx.docs. Approval will run later through the open proposal queue."
  );

  const packagePublish = summarizeGovernedProposalTarget({
    targetProcess: "packageRevision.publish",
    targetKind: "packageRevision",
    targetId: "packageRevision.plugin.inspect.v1",
    body: {},
    packageRows: [{ id: "package.plugin.inspect", context: "ctx.packages" }],
    packageRevisionRows: [{ id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", status: "draft" }],
    authoritySummaryText: authoritySummary("ctx.packages", ["ctx.packages"])
  });
  assert.equal(packagePublish.includes("Package revision publish proposal for packageRevision.plugin.inspect.v1."), true);
  assert.equal(packagePublish.includes("Current status: draft."), true);
  assert.equal(packagePublish.includes("Package: package.plugin.inspect."), true);
  assert.equal(packagePublish.includes("Current actor can mutate context ctx.packages directly."), true);
});

test("bootstrap version guidance summarizes governed proposal targets directly from bootstrap authored state", () => {
  const summary = summarizeGovernedProposalTargetFromBootstrap({
    targetProcess: "backendProgramVersion.activate",
    targetId: "todo.todos.list",
    body: { soul: "todo.todos.list", version: "todo.todos.list.v2" },
    authored: {
      backendPrograms: [{ soul: "todo.todos.list", context: "backend" }],
      backendProgramVersions: [
        { soul: "todo.todos.list", version: "todo.todos.list.v1", active: true },
        { soul: "todo.todos.list", version: "todo.todos.list.v2", active: false }
      ],
      backendProgramTransitions: [
        { soul: "todo.todos.list", from: "todo.todos.list.v1", to: "todo.todos.list.v2", strategy: "compatible" }
      ],
      backendProgramActivationHistory: [
        { soul: "todo.todos.list", version: "todo.todos.list.v1" },
        { soul: "todo.todos.list", version: "todo.todos.list.v2" }
      ],
      authority: { mutationContexts: ["backend"] }
    }
  });

  assert.equal(summary.includes("Requested version: todo.todos.list.v2."), true);
  assert.equal(summary.includes("Transition strategy: compatible."), true);
  assert.equal(summary.includes("Current actor can mutate context backend directly."), true);

  const packageSummary = summarizeGovernedProposalTargetFromBootstrap({
    targetProcess: "packagePatch.define",
    targetId: "packageRevision.plugin.inspect.v1",
    body: {
      package: "package.plugin.inspect",
      path: "plugins/inspect/runtime.js",
      operation: "replace",
      sourceLanguage: "js"
    },
    authored: {
      packages: [{ id: "package.plugin.inspect", context: "ctx.packages" }],
      packageRevisions: [{ id: "packageRevision.plugin.inspect.v1", package: "package.plugin.inspect", status: "draft" }],
      authority: { mutationContexts: ["ctx.packages"] }
    }
  });
  assert.equal(packageSummary.includes("Package patch proposal for revision packageRevision.plugin.inspect.v1."), true);
  assert.equal(packageSummary.includes("Path: plugins/inspect/runtime.js."), true);
  assert.equal(packageSummary.includes("Package: package.plugin.inspect."), true);
  assert.equal(packageSummary.includes("Current actor can mutate context ctx.packages directly."), true);
});

test("bootstrap version guidance factory exposes the helper seam to embedded browser runtimes", () => {
  const runtime = Function(`
    ${renderBootstrapVersionGuidanceFactory()}
    return {
      buildVersionActivationGuidance,
      buildVersionRollbackGuidance,
      proposalBodyIssues,
      summarizeGovernedProposalTarget,
      summarizeGovernedProposalTargetFromBootstrap,
      summarizeVersionedProposalTarget
    };
  `)();
  assert.equal(
    runtime.buildVersionActivationGuidance({
      soul: "todo.todos.list",
      currentVersion: "todo.todos.list.v1",
      targetVersion: "todo.todos.list.v2",
      targetIndex: 1,
      transitionStrategy: "compatible",
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).helpText.includes("Transition strategy: compatible."),
    true
  );
  assert.deepEqual(
    runtime.proposalBodyIssues({ targetProcess: "backendProgramVersion.rollback", targetId: "todo.todos.list", body: {} }),
    ["Body JSON must include soul."]
  );
  assert.equal(
    runtime.summarizeVersionedProposalTarget({
      domain: "backend",
      change: "rollback",
      targetId: "todo.todos.list",
      body: { soul: "todo.todos.list" },
      currentVersion: "todo.todos.list.v2",
      previousVersion: "todo.todos.list.v1",
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).includes("Expected rollback target: todo.todos.list.v1."),
    true
  );
  assert.equal(
    runtime.summarizeGovernedProposalTarget({
      targetProcess: "backendProgramVersion.activate",
      targetId: "todo.todos.list",
      body: { soul: "todo.todos.list", version: "todo.todos.list.v2" },
      backendVersionRows: [
        { soul: "todo.todos.list", version: "todo.todos.list.v1", active: true },
        { soul: "todo.todos.list", version: "todo.todos.list.v2", active: false }
      ],
      backendTransitionRows: [
        { from: "todo.todos.list.v1", to: "todo.todos.list.v2", strategy: "compatible" }
      ],
      authoritySummaryText: authoritySummary("backend", ["backend"])
    }).includes("Transition strategy: compatible."),
    true
  );
  assert.equal(
    runtime.summarizeGovernedProposalTargetFromBootstrap({
      targetProcess: "backendProgramVersion.activate",
      targetId: "todo.todos.list",
      body: { soul: "todo.todos.list", version: "todo.todos.list.v2" },
      authored: {
        backendPrograms: [{ soul: "todo.todos.list", context: "backend" }],
        backendProgramVersions: [
          { soul: "todo.todos.list", version: "todo.todos.list.v1", active: true },
          { soul: "todo.todos.list", version: "todo.todos.list.v2", active: false }
        ],
        backendProgramTransitions: [
          { soul: "todo.todos.list", from: "todo.todos.list.v1", to: "todo.todos.list.v2", strategy: "compatible" }
        ],
        authority: { mutationContexts: ["backend"] }
      }
    }).includes("Current actor can mutate context backend directly."),
    true
  );
});
