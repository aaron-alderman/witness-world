import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuidanceScopeCatalogEntries,
  guidanceScopeAnchorsFromBootstrapSections,
  guidanceScopeAnchorsFromSurfaces,
  guidanceScopeAnchorsFromWidgets
} from "../src/runtime-guidance-scope-anchors.js";
import { guidanceScopeInfo } from "../src/runtime-guidance-model.js";

test("guidanceScopeAnchorsFromWidgets derives non-step anchors from authored widget guidanceTarget metadata", () => {
  const anchors = guidanceScopeAnchorsFromWidgets("app", [
    { id: "todo_form", kind: "Form", guidanceTarget: "todo-form", title: "Todo form" },
    { id: "todo_submit", kind: "Button", parent: "todo_form", order: 1, guidanceTarget: "todo-submit", text: "Add" }
  ]);

  assert.deepEqual(anchors, [
    {
      scopeKey: "section:app:todo_form",
      scopeKind: "section",
      scopePage: "app",
      scopeSectionId: "todo_form",
      scopeLabel: "Todo form",
      target: "todo-form"
    },
    {
      scopeKey: "widget:todo_submit",
      scopeKind: "widget",
      scopePage: "app",
      scopeWidgetId: "todo_submit",
      scopeLabel: "Add",
      target: "todo-submit"
    }
  ]);
});

test("guidanceScopeAnchorsFromBootstrapSections lets packages opt into bootstrap operator anchors without tutorial steps", () => {
  const anchors = guidanceScopeAnchorsFromBootstrapSections([
    { sectionId: "proposal-form", label: "Proposal form", target: "proposal-form" },
    { widgetId: "bootstrap_identity_id_input", label: "Identity id", target: "identity-id" }
  ]);

  assert.equal(anchors.length, 2);
  assert.equal(anchors[0].scopeKey, "section:bootstrap:proposal-form");
  assert.equal(anchors[1].scopeKey, "widget:bootstrap_identity_id_input");
});

test("guidanceScopeAnchorsFromSurfaces derives non-step anchors from authored surface guidance metadata", () => {
  const anchors = guidanceScopeAnchorsFromSurfaces("app", [
    { id: "native_todo_title", surfaceKind: "text", props: { text: "Witness Todo", dataGuidanceTarget: "app-title" } },
    { id: "native_todo_form", surfaceKind: "generic", props: { tag: "form", dataGuidanceTarget: "todo-form" } }
  ]);

  assert.deepEqual(anchors, [
    {
      scopeKey: "widget:native_todo_title",
      scopeKind: "widget",
      scopePage: "app",
      scopeWidgetId: "native_todo_title",
      scopeLabel: "Witness Todo",
      target: "app-title"
    },
    {
      scopeKey: "section:app:native_todo_form",
      scopeKind: "section",
      scopePage: "app",
      scopeSectionId: "native_todo_form",
      scopeLabel: "Native Todo Form",
      target: "todo-form"
    }
  ]);
});

test("buildGuidanceScopeCatalogEntries composes widget and bootstrap anchors for arbitrary guidance definitions", () => {
  const guidance = {
    id: "example",
    steps: [{ id: "step-1", page: "app", chapterId: "intro", title: "Intro" }],
    scopes: buildGuidanceScopeCatalogEntries({
      pages: ["app"],
      widgetsByPage: {
        app: [{ id: "custom_panel", kind: "Box", guidanceTarget: "custom-panel", title: "Custom panel" }]
      },
      bootstrapSections: [{ sectionId: "context-form", label: "Context form", target: "context-form" }]
    })
  };

  assert.deepEqual(guidanceScopeInfo(guidance, "section:app:custom_panel"), {
    key: "section:app:custom_panel",
    kind: "section",
    page: "app",
    label: "Custom panel",
    sectionId: "custom_panel",
    target: "custom-panel"
  });
  assert.equal(guidanceScopeInfo(guidance, "section:bootstrap:context-form")?.target, "context-form");
});
