import assert from "node:assert/strict";
import test from "node:test";
import { createProcessRuntime } from "../src/desire/process-eval.js";

function toyWorld() {
  return [
    {
      process: "desire.defineType",
      body: { id: "ShellStatus", role: "state", initial: "idle", valueType: "text" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "BeginFlow", role: "event", writes: {} }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellProcess",
        state: ["ShellStatus"],
        handles: ["BeginFlow"],
        emits: [],
        rules: [
          {
            trigger: "BeginFlow",
            steps: [
              { kind: "delay", ms: 5 },
              { kind: "setState", state: "ShellStatus", value: "done" }
            ]
          }
        ]
      }
    }
  ];
}

test("process runtime delay rules register with the shared execution runner", async () => {
  let releaseDelay = null;
  const delayPromise = new Promise(resolve => {
    releaseDelay = resolve;
  });
  const runtime = createProcessRuntime(toyWorld(), {
    delayScheduler() {
      return delayPromise;
    }
  });

  const delivery = runtime.deliverAuthored("BeginFlow");
  await Promise.resolve();
  const activeSnapshot = runtime.executionRunner.settledSnapshot();
  assert.equal(activeSnapshot.settled, false);
  assert.deepEqual(activeSnapshot.pendingByKind, {
    "process.rule": 1,
    "process.delay": 1
  });

  releaseDelay();
  await delivery;
  await runtime.whenIdle();
  assert.equal(runtime.value("ShellStatus"), "done");
  assert.equal(runtime.executionRunner.settledSnapshot().settled, true);
});

test("process runtime command rules can invoke bound adapter routes", async () => {
  const requests = [];
  const runtime = createProcessRuntime([
    {
      process: "desire.defineType",
      body: { id: "ActorState", role: "state", initial: "aaron", valueType: "text" }
    },
    {
      process: "desire.defineType",
      body: { id: "LoadBusy", role: "state", initial: false, valueType: "bool" }
    },
    {
      process: "desire.defineType",
      body: { id: "LoadSummary", role: "state", initial: "", valueType: "text" }
    },
    {
      process: "desire.defineType",
      body: { id: "LoadNotice", role: "state", initial: "", valueType: "text" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "RefreshRequested", role: "event", writes: {} }
    },
    {
      process: "desire.defineMessage",
      body: {
        id: "LoadSucceeded",
        role: "event",
        fields: [
          { name: "summary", type: "LoadSummary" },
          { name: "message", type: "LoadNotice" }
        ],
        writes: { LoadBusy: false }
      }
    },
    {
      process: "desire.defineMessage",
      body: {
        id: "LoadFailed",
        role: "event",
        fields: [
          { name: "summary", type: "LoadSummary" },
          { name: "message", type: "LoadNotice" }
        ],
        writes: { LoadBusy: false }
      }
    },
    {
      process: "desire.defineMessage",
      body: { id: "LoadRemote", role: "command", fields: [] }
    },
    {
      process: "desire.defineBoundary",
      body: {
        id: "LoadRemoteHttp",
        operations: [{
          kind: "adapter",
          command: "LoadRemote",
          method: "GET",
          route: "/api/demo",
          actorState: "ActorState",
          loadingState: "LoadBusy",
          successEvent: "LoadSucceeded",
          failureEvent: "LoadFailed",
          hostOperation: "demo.load"
        }]
      }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "LoadProcess",
        state: ["ActorState", "LoadBusy", "LoadSummary", "LoadNotice"],
        handles: ["RefreshRequested", "LoadSucceeded", "LoadFailed"],
        emits: ["LoadRemote"],
        rules: [
          {
            trigger: "RefreshRequested",
            steps: [
              { kind: "setState", state: "LoadBusy", value: true },
              { kind: "command", command: "LoadRemote" }
            ]
          }
        ]
      }
    }
  ], {
    routeInvoker: async request => {
      requests.push({
        route: request.route,
        method: request.method,
        actorState: request.actorState,
        actor: request.runtime.value(request.actorState)
      });
      return {
        status: "success",
        payload: {
          summary: "{\n  \"ok\": true\n}",
          message: "loaded"
        }
      };
    }
  });

  await runtime.deliverAuthored("RefreshRequested");
  await runtime.whenIdle();

  assert.deepEqual(requests, [
    {
      route: "/api/demo",
      method: "GET",
      actorState: "ActorState",
      actor: "aaron"
    }
  ]);
  assert.equal(runtime.value("LoadBusy"), false);
  assert.equal(runtime.value("LoadNotice"), "loaded");
  assert.match(runtime.value("LoadSummary"), /"ok": true/);
});

test("process runtime ignores stale route results instead of applying success or failure writes", async () => {
  const runtime = createProcessRuntime([
    {
      process: "desire.defineType",
      body: { id: "LoadBusy", role: "state", initial: false, valueType: "bool" }
    },
    {
      process: "desire.defineType",
      body: { id: "LoadNotice", role: "state", initial: "", valueType: "text" }
    },
    {
      process: "desire.defineType",
      body: { id: "FollowUpState", role: "state", initial: "idle", valueType: "text" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "RefreshRequested", role: "event", writes: {} }
    },
    {
      process: "desire.defineMessage",
      body: {
        id: "LoadSucceeded",
        role: "event",
        fields: [{ name: "message", type: "LoadNotice" }],
        writes: { LoadBusy: false }
      }
    },
    {
      process: "desire.defineMessage",
      body: {
        id: "LoadFailed",
        role: "event",
        fields: [{ name: "message", type: "LoadNotice" }],
        writes: { LoadBusy: false }
      }
    },
    {
      process: "desire.defineMessage",
      body: { id: "LoadRemote", role: "command", fields: [] }
    },
    {
      process: "desire.defineBoundary",
      body: {
        id: "LoadRemoteHttp",
        operations: [{
          kind: "adapter",
          command: "LoadRemote",
          method: "GET",
          route: "/api/demo",
          loadingState: "LoadBusy",
          successEvent: "LoadSucceeded",
          failureEvent: "LoadFailed"
        }]
      }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "LoadProcess",
        state: ["LoadBusy", "LoadNotice", "FollowUpState"],
        handles: ["RefreshRequested", "LoadSucceeded", "LoadFailed"],
        emits: ["LoadRemote"],
        rules: [
          {
            trigger: "RefreshRequested",
            steps: [{ kind: "command", command: "LoadRemote" }]
          },
          {
            trigger: "LoadSucceeded",
            steps: [{ kind: "setState", state: "FollowUpState", value: "applied" }]
          }
        ]
      }
    }
  ], {
    routeInvoker: async request => {
      assert.equal(Boolean(request.requestContext), true);
      return {
        status: "ignored",
        ignored: true,
        payload: { message: "stale" }
      };
    }
  });

  await runtime.deliverAuthored("RefreshRequested", null, {
    routeRequestContext: {
      isCurrent() {
        return false;
      }
    }
  });

  assert.equal(runtime.value("LoadBusy"), true);
  assert.equal(runtime.value("LoadNotice"), "");
  assert.equal(runtime.value("FollowUpState"), "idle");
  assert.equal(runtime.trace.some(entry => entry.kind === "route.ignore" && entry.outcome === "ignored"), true);
});

test("process runtime option rules branch from runtime config truthiness", async () => {
  const world = [
    {
      process: "desire.defineType",
      body: { id: "ShellStatus", role: "state", initial: "idle", valueType: "text" }
    },
    {
      process: "desire.defineMessage",
      body: { id: "BeginFlow", role: "event", writes: {} }
    },
    {
      process: "desire.defineProcess",
      body: {
        id: "ShellProcess",
        state: ["ShellStatus"],
        handles: ["BeginFlow"],
        emits: [],
        rules: [
          {
            trigger: "BeginFlow",
            steps: [
              {
                kind: "option",
                config: "features.fastPath",
                real: [{ kind: "setState", state: "ShellStatus", value: "real" }],
                else: [{ kind: "setState", state: "ShellStatus", value: "else" }]
              }
            ]
          }
        ]
      }
    }
  ];

  const enabled = createProcessRuntime(world, {
    config: { features: { fastPath: true } }
  });
  await enabled.deliverAuthored("BeginFlow");
  assert.equal(enabled.value("ShellStatus"), "real");

  const disabled = createProcessRuntime(world, {
    config: { features: { fastPath: false } }
  });
  await disabled.deliverAuthored("BeginFlow");
  assert.equal(disabled.value("ShellStatus"), "else");

  const stringFalse = createProcessRuntime(world, {
    config: { features: { fastPath: "false" } }
  });
  await stringFalse.deliverAuthored("BeginFlow");
  assert.equal(stringFalse.value("ShellStatus"), "else");
});
