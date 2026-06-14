import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeSessionServices } from "../src/runtime-session-services.js";

test("runtime session services create, shape, sync, and clear guidance session state with tutorial aliases", () => {
  const sessionStore = new Map();
  const services = createRuntimeSessionServices({ sessionStore });
  const identity = {
    id: "identity.aaron",
    actor: "aaron",
    label: "Aaron",
    homeContext: "ctx.platform",
    homePerspective: "aaron:workspace"
  };

  const session = services.createSessionForIdentity(identity);
  assert.equal(sessionStore.has(session.id), true);
  assert.equal(Object.keys(session).includes("tutorialProgress"), false);
  assert.equal(session.tutorialProgress, session.guidanceProgress);
  assert.deepEqual(services.sessionResponseShape(session), {
    authenticated: true,
    identity: "identity.aaron",
    actor: "aaron",
    label: "Aaron",
    homeContext: "ctx.platform",
    perspective: "aaron:workspace"
  });

  assert.equal(services.guidanceProgressFor(session, "todo-from-scratch"), null);
  assert.equal(services.tutorialProgressFor(session, "todo-from-scratch"), null);
  services.setGuidanceProgress(session, "todo-from-scratch", { stepId: "identity:create" });
  assert.deepEqual(services.guidanceProgressFor(session, "todo-from-scratch"), { stepId: "identity:create" });
  assert.deepEqual(services.tutorialProgressFor(session, "todo-from-scratch"), { stepId: "identity:create" });
  services.setTutorialProgress(session, "todo-from-scratch", null);
  assert.equal(services.guidanceProgressFor(session, "todo-from-scratch"), null);
  assert.equal(services.tutorialProgressFor(session, "todo-from-scratch"), null);

  const synced = services.syncSessionIdentity(session, {
    ...identity,
    actor: "aaron.updated",
    label: "Aaron Updated",
    homeContext: "ctx.updated",
    homePerspective: "aaron:updated"
  });
  assert.equal(synced.actor, "aaron.updated");
  assert.equal(sessionStore.get(session.id).label, "Aaron Updated");
  assert.equal(sessionStore.get(session.id).tutorialProgress, sessionStore.get(session.id).guidanceProgress);
});
