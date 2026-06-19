import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { AppPreviewSessionManager, AppSnapshotManager } from "../src/app-snapshot-manager.js";
import { activateWidgetVersion, defineWidget, defineWidgetVersion, defineWidgetVersionTransition, widgetDefinitions } from "../src/widgets.js";

function createManager(fsModule) {
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    logger: null,
    fsModule
  });
  manager.activeSnapshot = {
    sourceIndex: [
      {
        filePath: "C:/tmp/app/shell.rvm",
        sourceLanguage: "rvm",
        contentHash: "abc",
        mtimeMs: 10,
        size: 100
      }
    ]
  };
  return manager;
}

test("AppSnapshotManager.detectChangedPaths uses file stat data rather than re-reading source contents", async () => {
  let readFileCalls = 0;
  let statCalls = 0;
  const manager = createManager({
    async readFile() {
      readFileCalls += 1;
      throw new Error("detectChangedPaths should not read file contents");
    },
    async stat() {
      statCalls += 1;
      return { mtimeMs: 10, size: 100 };
    }
  });

  const changed = await manager.detectChangedPaths();

  assert.deepEqual([...changed], []);
  assert.equal(statCalls, 1);
  assert.equal(readFileCalls, 0);
});

test("AppSnapshotManager.detectChangedPaths marks files dirty when stat metadata changes", async () => {
  const manager = createManager({
    async stat() {
      return { mtimeMs: 11, size: 100 };
    }
  });

  const changed = await manager.detectChangedPaths();

  assert.deepEqual([...changed], ["C:/tmp/app/shell.rvm"]);
});

test("AppPreviewSessionManager stores overlay edits without publishing to disk", async () => {
  const readFileCalls = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      manifestPath: "C:/tmp/app.wtoml",
      appRoot: "C:/tmp",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return { appRevision: 7 };
      }
    },
    fsModule: {
      async readFile(target) {
        readFileCalls.push(String(target));
        return "(surface Shell)";
      }
    }
  });

  const session = previewManager.createSession();
  const internalSession = previewManager.sessions.get(session.id);
  let rebuildCalls = 0;
  previewManager.rebuildPreviewSnapshot = async currentSession => {
    rebuildCalls += 1;
    return {
      world: {
        allWitnesses() {
          return [];
        }
      },
      appProject: { sourceFiles: [] },
      sourceIndex: [],
      compiledUnits: new Map()
    };
  };

  const updated = await previewManager.patchSources(session.id, [{
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)"
  }]);
  const resolvedSourcePath = path.resolve("C:/tmp/app/shell.rvm");

  assert.equal(updated.previewRevision, 1);
  assert.deepEqual(updated.changedSources, ["app/shell.rvm"]);
  assert.equal(internalSession.overlaySources.get(resolvedSourcePath), "(surface ShellUpdated)");
  assert.equal(rebuildCalls, 1);
  assert.deepEqual(readFileCalls, []);
});

test("AppPreviewSessionManager marks sessions stale when the active app revision changes", () => {
  let activeRevision = 4;
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return { appRevision: activeRevision };
      }
    }
  });

  const session = previewManager.createSession();
  assert.equal(session.status, "active");

  activeRevision = 5;
  const stale = previewManager.readSession(session.id);

  assert.equal(stale.status, "stale");
  assert.match(stale.invalidReason, /expected app revision 4, active revision 5/);
});

test("AppPreviewSessionManager resolves source associations by target query", () => {
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: {
            allWitnesses() {
              return [
                {
                  process: "dsl.source.annotate",
                  body: {
                    target: "EngentusLoginPasswordField",
                    file: "C:/tmp/app/shell-auth.rvm",
                    startLine: 59,
                    sourceLanguage: "rvm",
                    sourceKind: "view"
                  }
                },
                {
                  process: "dsl.source.annotate",
                  body: {
                    target: "EngentusLoginPasswordField",
                    file: "C:/tmp/app/engentus-desired-v2.wcss",
                    startLine: 1359,
                    sourceLanguage: "wcss",
                    sourceKind: "identity"
                  }
                }
              ];
            }
          }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "engentusloginpasswordfield");

  assert.equal(result.query, "engentusloginpasswordfield");
  assert.deepEqual(result.targets, ["EngentusLoginPasswordField"]);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map(match => [match.sourceLanguage, match.file]),
    [
      ["wcss", "C:/tmp/app/engentus-desired-v2.wcss"],
      ["rvm", "C:/tmp/app/shell-auth.rvm"]
    ]
  );
});

test("AppPreviewSessionManager replays widget evolution candidates against preview worlds and replaces prior candidate state", async () => {
  const world = createWorld();
  defineWidget(world, {
    actor: "system",
    id: "todo_title",
    kind: "Heading",
    props: { text: "Witness Todo", level: 1 },
    context: "frontend"
  });
  defineWidgetVersion(world, {
    actor: "system",
    soul: "todo_banner",
    version: "todo_banner_v1",
    kind: "Text",
    props: { text: "Versioned widget: v1" },
    context: "frontend"
  });
  defineWidgetVersion(world, {
    actor: "system",
    soul: "todo_banner",
    version: "todo_banner_v2",
    kind: "Text",
    props: { text: "Versioned widget: v2" },
    context: "frontend"
  });
  defineWidgetVersionTransition(world, {
    actor: "system",
    soul: "todo_banner",
    from: "todo_banner_v1",
    to: "todo_banner_v2",
    strategy: "compatible"
  });
  activateWidgetVersion(world, { actor: "system", soul: "todo_banner", version: "todo_banner_v1" });

  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world,
          compiledUnits: new Map()
        };
      }
    }
  });

  const session = previewManager.createSession();
  const first = await previewManager.patchCandidates(session.id, [{
    kind: "widget.replace",
    input: { id: "todo_title", kind: "Paragraph", text: "Preview paragraph" }
  }]);
  assert.equal(first.previewSession.previewRevision, 1);
  assert.equal(first.results[0].ok, true);
  assert.equal(first.results[0].migrationStatus, "compatible");
  const replacedWorld = previewManager.resolveRenderSession(session.id).world;
  const replacedWidget = widgetDefinitions(replacedWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(replacedWidget.kind, "Paragraph");
  assert.equal(replacedWidget.props.text, "Preview paragraph");

  const second = await previewManager.patchCandidates(session.id, [{
    kind: "widget.version.activate",
    input: { soul: "todo_banner", version: "todo_banner_v2" }
  }]);
  assert.equal(second.previewSession.previewRevision, 2);
  assert.equal(second.results[0].ok, true);
  assert.equal(second.results[0].migrationStatus, "compatible");
  const replayedWorld = previewManager.resolveRenderSession(session.id).world;
  const replayedWidget = widgetDefinitions(replayedWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(replayedWidget.kind, "Heading");
  const replayedBanner = widgetDefinitions(replayedWorld.allWitnesses()).find(row => row.id === "todo_banner");
  assert.equal(replayedBanner.props.text, "Versioned widget: v2");

  const third = await previewManager.patchCandidates(session.id, [{
    kind: "widget.replace.rollback",
    input: { id: "todo_title" }
  }]);
  assert.equal(third.previewSession.previewRevision, 3);
  assert.equal(third.results[0].ok, false);
  assert.equal(third.results[0].migrationStatus, "blocked");
  assert.match(third.results[0].reason, /no previous widget\.replace witness/);

  const rollbackSession = previewManager.createSession();
  const rollbackPreview = await previewManager.patchCandidates(rollbackSession.id, [
    {
      kind: "widget.replace",
      input: { id: "todo_title", kind: "Paragraph", text: "Rollback me" }
    },
    {
      kind: "widget.replace.rollback",
      input: { id: "todo_title" }
    }
  ]);
  assert.equal(rollbackPreview.previewSession.previewRevision, 1);
  assert.equal(rollbackPreview.results[0].ok, true);
  assert.equal(rollbackPreview.results[1].ok, true);
  assert.equal(rollbackPreview.results[1].migrationStatus, "compatible");
  const rolledBackWorld = previewManager.resolveRenderSession(rollbackSession.id).world;
  const rolledBackWidget = widgetDefinitions(rolledBackWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(rolledBackWidget.kind, "Heading");
  assert.equal(rolledBackWidget.props.text, "Witness Todo");
});

test("AppPreviewSessionManager ranks target candidates from descriptor metadata and exposes provenance", () => {
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 40,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/engentus-desired-v2.wcss",
        startLine: 460,
        sourceLanguage: "wcss",
        sourceKind: "identity"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanChartTooltip",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 88,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRunProgressFill",
        surfaceKind: "leaf",
        className: "prog-fill running",
        props: {
          presentationAnchor: "goodman-run-progress-fill",
          text: "Running"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanChartTooltip",
        surfaceKind: "leaf",
        className: "chart-page__tooltip",
        props: {
          presentationAnchor: "goodman-chart-tooltip",
          text: "Tooltip"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "", {
    descriptor: {
      id: "goodman-run-progress-fill",
      classNames: ["prog-fill", "running"],
      textPreview: "Running"
    }
  });

  assert.equal(result.resolvedTarget, "GoodmanRunProgressFill");
  assert.equal(result.candidates[0].target, "GoodmanRunProgressFill");
  assert.equal(result.candidates[0].confidence, "high");
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "dom-anchor"), true);
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "class-token"), true);
  assert.equal(result.targets.includes("GoodmanChartTooltip"), true);
});

test("AppPreviewSessionManager inspects editable RVM targets with authored props and valid property catalog", async () => {
  const sourceText = `import desire/v3-alpha

view EngentusLoginPasswordField {
  kind form-field
  class auth-field
  prop label = "Password"
  prop inputType = "password"
  prop inputId = "login-pw"
  prop placeholder = "secret"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusLoginPasswordField",
        file: "C:/tmp/app/shell-auth.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusLoginPasswordField",
        surfaceKind: "form-field",
        className: "auth-field",
        props: {
          label: "Password",
          inputType: "password",
          inputId: "login-pw",
          placeholder: "secret"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-auth.rvm" || String(target) === "C:/tmp/app/shell-auth.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  const inspection = await previewManager.inspectTarget(session.id, "EngentusLoginPasswordField");

  assert.equal(inspection.target, "EngentusLoginPasswordField");
  assert.equal(inspection.componentKind, "form-field");
  assert.equal(inspection.editable, true);
  assert.equal(inspection.authoredProps.class, "auth-field");
  assert.equal(inspection.authoredProps.label, "Password");
  assert.equal(inspection.runtimeProps.surfaceKind, "form-field");
  assert.equal(inspection.validProps.some(entry => entry.key === "label"), true);
  assert.equal(inspection.validProps.some(entry => entry.key === "inputType"), true);
  assert.deepEqual(
    inspection.validProps.find(entry => entry.key === "inputType")?.options,
    ["text", "password", "email", "number", "search", "tel", "url"]
  );
});

test("AppPreviewSessionManager inspectTarget returns breadcrumbs and resolved provenance for descriptor-driven selection", async () => {
  const sourceText = `import desire/v3-alpha

view GoodmanPanel {
  kind group
}

view GoodmanRunProgressFill {
  kind text
  prop presentationAnchor = "goodman-run-progress-fill"
  prop text = "Running"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanPanel",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 7,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanPanel",
        surfaceKind: "group",
        className: "panel",
        props: {},
        bindings: [],
        interactions: [],
        children: ["GoodmanRunProgressFill"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRunProgressFill",
        surfaceKind: "text",
        className: "prog-fill running",
        props: {
          presentationAnchor: "goodman-run-progress-fill",
          text: "Running"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-goodman.rvm" || String(target) === "C:/tmp/app/shell-goodman.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  const inspection = await previewManager.inspectTarget(session.id, "", {
    descriptor: {
      id: "goodman-run-progress-fill",
      classNames: ["prog-fill", "running"]
    }
  });

  assert.equal(inspection.target, "GoodmanRunProgressFill");
  assert.deepEqual(
    inspection.breadcrumbs.map(entry => entry.target),
    ["GoodmanPanel", "GoodmanRunProgressFill"]
  );
  assert.equal(Array.isArray(inspection.candidates), true);
  assert.equal(inspection.provenance.reasons.some(reason => reason.kind === "dom-anchor"), true);
});

test("AppPreviewSessionManager resolves through ancestor surface hints before broader candidate matching", async () => {
  const witnesses = [
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusPlatformConfigApp",
        surfaceKind: "group",
        className: "platform-config-body",
        props: {},
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "PlatformConfigSaveButton",
        surfaceKind: "action",
        className: "rbtn go",
        props: {
          text: "Save"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusPlatformConfigApp",
        file: "C:/tmp/app/shell-platform-config.rvm",
        startLine: 12,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "PlatformConfigSaveButton",
        file: "C:/tmp/app/shell-platform-config.rvm",
        startLine: 48,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "", {
    descriptor: {
      classNames: ["rbtn", "go"],
      ancestorSurfaceIds: ["PlatformConfigSaveButton", "EngentusPlatformConfigApp"],
      nearestSurfaceId: "PlatformConfigSaveButton"
    }
  });

  assert.equal(result.resolvedTarget, "PlatformConfigSaveButton");
  assert.equal(result.candidates[0].target, "PlatformConfigSaveButton");
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "surface-id"), true);
});

test("AppPreviewSessionManager patchTargetProperty updates overlays and preserves last good preview on rebuild failure", async () => {
  const sourceText = `import desire/v3-alpha

view EngentusLoginPasswordField {
  kind form-field
  prop label = "Password"
  prop inputType = "password"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusLoginPasswordField",
        file: "C:/tmp/app/shell-auth.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusLoginPasswordField",
        surfaceKind: "form-field",
        className: null,
        props: {
          label: "Password",
          inputType: "password"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-auth.rvm" || String(target) === "C:/tmp/app/shell-auth.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  previewManager.rebuildPreviewSnapshot = async (_sessionLike, { overlaySources, previewRevision } = {}) => ({
    world: { allWitnesses() { return witnesses; } },
    appProject: { runtimePluginRegistries: null },
    compiledUnits: new Map(),
    sourceIndex: [],
    previewRevision
  });

  const first = await previewManager.patchTargetProperty(session.id, {
    target: "EngentusLoginPasswordField",
    property: "label",
    value: "Passcode"
  });
  const internalSession = previewManager.sessions.get(session.id);
  const resolvedSourcePath = path.resolve("C:/tmp/app/shell-auth.rvm");

  assert.equal(first.previewSession.previewRevision, 1);
  assert.match(internalSession.overlaySources.get(resolvedSourcePath), /prop label = Passcode/);

  previewManager.rebuildPreviewSnapshot = async () => {
    throw new Error("preview rebuild failed");
  };

  await assert.rejects(
    previewManager.patchTargetProperty(session.id, {
      target: "EngentusLoginPasswordField",
      property: "label",
      value: "Broken"
    }),
    /preview rebuild failed/
  );
  assert.match(internalSession.overlaySources.get(resolvedSourcePath), /prop label = Passcode/);
  assert.equal(internalSession.previewRevision, 1);
});
