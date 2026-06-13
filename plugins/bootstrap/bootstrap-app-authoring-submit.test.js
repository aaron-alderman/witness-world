import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapAppAuthoringSubmit,
  buildBootstrapAppAuthoringSubmitRequest,
  renderBootstrapAppAuthoringSubmitFactory,
  runBootstrapAppAuthoringSubmit
} from "./bootstrap-app-authoring-submit.js";

test("bootstrap app authoring submit request builder preserves create-form payload contracts", () => {
  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "context" },
      data: {
        id: "ctx.platform",
        label: "Platform",
        parent: "",
        stewardsJson: "[]"
      }
    }),
    {
      url: "/api/contexts",
      body: {
        id: "ctx.platform",
        label: "Platform",
        parent: "",
        stewardsJson: "[]"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "widget" },
      data: {
        id: "page_root",
        kind: "Page",
        parent: "",
        tutorialTarget: "",
        attach: false,
        template: true,
        order: "0",
        level: "",
        text: "",
        title: "Home"
      }
    }),
    {
      url: "/api/widgets",
      body: {
        id: "page_root",
        kind: "Page",
        tutorialTarget: "page_root",
        attach: false,
        template: true,
        order: 0,
        level: undefined,
        title: "Home"
      }
    }
  );

  assert.deepEqual(
    buildBootstrapAppAuthoringSubmitRequest({
      detail: { family: "route" },
      data: {
        id: "home_route",
        path: "/",
        handler: "page.home",
        page: "home",
        backendProgramSoul: "",
        rootWidget: "page_root",
        frontendProgram: "home_program",
        liveProjection: true
      }
    }),
    {
      url: "/api/routes",
      body: {
        id: "home_route",
        path: "/",
        handler: "page.home",
        page: "home",
        rootWidget: "page_root",
        frontendProgram: "home_program",
        liveProjection: true
      }
    }
  );
});

test("bootstrap app authoring submit helper posts, resets, and refreshes on success", async () => {
  const calls = [];
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapAppAuthoringSubmit({
    detail: {
      family: "step",
      formId: "step-form",
      statusId: "step-status"
    },
    readFormData: () => ({
      program: "landing_program",
      event: "load",
      op: "setText",
      order: "0"
    }),
    postJson: async (url, body) => {
      calls.push({ url, body });
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{
    url: "/api/frontend-steps",
    body: {
      program: "landing_program",
      event: "load",
      op: "setText",
      order: 0
    }
  }]);
  assert.deepEqual(statuses, [{ id: "step-status", text: "Saved." }]);
  assert.deepEqual(resets, ["step-form"]);
  assert.equal(refreshed, 1);
});

test("bootstrap app authoring submit helper reports errors without reset or refresh", async () => {
  const statuses = [];
  const resets = [];
  let refreshed = 0;

  const ok = await runBootstrapAppAuthoringSubmit({
    detail: {
      family: "runner",
      formId: "runner-form",
      statusId: "runner-status"
    },
    readFormData: () => ({
      id: "demo_server"
    }),
    postJson: async () => {
      throw new Error("runner conflict");
    },
    setStatus: (id, text) => statuses.push({ id, text }),
    resetForm: formId => resets.push(formId),
    refresh: async () => {
      refreshed += 1;
    }
  });

  assert.equal(ok, false);
  assert.deepEqual(statuses, [{ id: "runner-status", text: "runner conflict" }]);
  assert.deepEqual(resets, []);
  assert.equal(refreshed, 0);
});

test("bootstrap app authoring submit bridge binds one documented event family", () => {
  const events = [];
  const target = {
    addEventListener(name, handler) {
      events.push([name, handler]);
    }
  };

  const registered = bindBootstrapAppAuthoringSubmit({ target });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], "witness:bootstrap-app-authoring-submit");
  assert.equal(typeof registered, "function");

  const factory = renderBootstrapAppAuthoringSubmitFactory();
  assert.equal(factory.includes("const buildBootstrapAppAuthoringSubmitRequest ="), true);
  assert.equal(factory.includes("const runBootstrapAppAuthoringSubmit ="), true);
  assert.equal(factory.includes("const bindBootstrapAppAuthoringSubmit ="), true);
});
