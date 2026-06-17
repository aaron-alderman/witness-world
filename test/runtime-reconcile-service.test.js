import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRenderedHostTree,
  collectReconcileSurfaceStates,
  createReconcilePlan
} from "../src/runtime-reconcile-service.js";

test("reconcile service produces stable plans from identical inputs", () => {
  const input = {
    surfaceStates: [
      {
        surfaceId: "Surface.Home",
        rootId: "surface-home",
        hasBindings: true,
        hasVisibleBinding: true,
        expectedVisible: true,
        present: true,
        nextProps: { visible: true, title: "Home" }
      }
    ],
    activeSurfaceId: "Surface.Home"
  };

  const first = createReconcilePlan(input);
  const second = createReconcilePlan(input);
  assert.deepEqual(second, first);
});

test("reconcile service plans materialization and dematerialization from visibility state", () => {
  const plan = createReconcilePlan({
    surfaceStates: [
      {
        surfaceId: "Surface.Visible",
        hasBindings: true,
        hasVisibleBinding: true,
        expectedVisible: true,
        present: false,
        nextProps: { visible: true }
      },
      {
        surfaceId: "Surface.Hidden",
        hasBindings: true,
        hasVisibleBinding: true,
        expectedVisible: false,
        present: true,
        nextProps: { visible: false }
      }
    ],
    activeSurfaceId: "Surface.Root"
  });

  assert.deepEqual(
    plan.ops.map(op => [op.kind, op.surfaceId]),
    [
      ["materialize", "Surface.Visible"],
      ["patch-props", "Surface.Visible"],
      ["dematerialize", "Surface.Hidden"]
    ]
  );
  assert.equal(plan.structureChanged, true);
});

test("reconcile service emits route-underlay intent for the active surface", () => {
  const plan = createReconcilePlan({
    surfaceStates: [
      {
        surfaceId: "Surface.Login",
        hasBindings: true,
        hasVisibleBinding: false,
        expectedVisible: true,
        present: true,
        nextProps: { routeUnderlay: "home" }
      }
    ],
    activeSurfaceId: "Surface.Login"
  });

  assert.deepEqual(plan.ops.map(op => op.kind), ["route-underlay", "patch-props"]);
  assert.equal(plan.ops[0].routeKey, "home");
  assert.equal(plan.activeSurfaceUnderlayUpdated, true);
});

test("reconcile state collection derives active subtree input from rendered host state", () => {
  const renderedHostTree = buildRenderedHostTree({
    surfaceStates: [
      { surfaceId: "Surface.Home", rootId: "surface-home", present: true },
      { surfaceId: "Surface.Hidden", rootId: "surface-hidden", present: false }
    ]
  });

  const states = collectReconcileSurfaceStates({
    surfaces: [
      { id: "Surface.Home", view: { rootId: "surface-home" } },
      { id: "Surface.Hidden", view: { rootId: "surface-hidden" } },
      { id: "Surface.Other", view: { rootId: "surface-other" } }
    ],
    activeSurfaceIds: new Set(["Surface.Home", "Surface.Hidden"]),
    renderedHostTree,
    resolveSurfaceState(surface) {
      return {
        hasBindings: true,
        hasVisibleBinding: true,
        expectedVisible: surface.id === "Surface.Home",
        nextProps: { visible: surface.id === "Surface.Home" }
      };
    }
  });

  assert.deepEqual(states, [
    {
      surfaceId: "Surface.Home",
      rootId: "surface-home",
      present: true,
      hasBindings: true,
      hasVisibleBinding: true,
      expectedVisible: true,
      nextProps: { visible: true }
    },
    {
      surfaceId: "Surface.Hidden",
      rootId: "surface-hidden",
      present: false,
      hasBindings: true,
      hasVisibleBinding: true,
      expectedVisible: false,
      nextProps: { visible: false }
    }
  ]);
});
