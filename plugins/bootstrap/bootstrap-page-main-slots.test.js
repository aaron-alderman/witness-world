import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseWitnessToml } from "../../src/dsl.js";
import { buildBootstrapPageMainSlots } from "./bootstrap-page-main-slots.js";
import { buildBootstrapIdentityView } from "./bootstrap-identity-view-state.js";
import { buildBootstrapPageMainReplacementContent } from "./bootstrap-page-main-replacement-content.js";
import { buildBootstrapPageMainSeedState } from "./bootstrap-page-main-seed-state.js";

test("bootstrap page main slot helper assembles authored slot content and seeded state scripts", () => {
  const slots = buildBootstrapPageMainSlots({
    bootstrapState: {
      identities: [{
        id: "identity.alice",
        actor: "alice",
        label: "Alice",
        username: "alice",
        password: "secret",
        homePerspective: "default",
        homeContext: "ctx.main"
      }]
    },
    bootstrapModel: {},
    requestUrl: "/_bootstrap?identity=identity.alice"
  });

  assert.equal(typeof slots["bootstrap-top-cards-slot"], "string");
  assert.equal(typeof slots["bootstrap-governance-contexts-slot"], "string");
  assert.equal(typeof slots["bootstrap-capability-remove-slot"], "string");
  assert.equal(typeof slots["bootstrap-starter-controls-slot"], "string");
  assert.match(slots["bootstrap-top-cards-slot"], /witness-bootstrap-top-cards-initial-state/);
  assert.match(slots["bootstrap-top-cards-slot"], /identity\.alice/);
  assert.match(slots["bootstrap-governance-contexts-slot"], /context-form/);
  assert.match(slots["bootstrap-capability-remove-slot"], /bootstrap_capability_remove_controls_root|capability-remove-form/);
  assert.match(slots["bootstrap-starter-controls-slot"], /witness-bootstrap-starter-controls-initial-state/);
});

test("bootstrap top cards slot injects the authored guidance card into the authored replacement slot", () => {
  const slots = buildBootstrapPageMainSlots({
    bootstrapState: {},
    bootstrapModel: {},
    requestUrl: "/_bootstrap",
    guidance: {
      id: "bootstrap.guidance",
      title: "Bootstrap Guidance",
      summary: "Use the real authored controls."
    }
  });

  assert.match(slots["bootstrap-top-cards-slot"], /bootstrap-guidance-card-slot/);
  assert.match(slots["bootstrap-top-cards-slot"], /tutorial-card/);
  assert.match(slots["bootstrap-top-cards-slot"], /tutorial-start/);
  assert.match(slots["bootstrap-top-cards-slot"], /tutorial-suggestions/);
});

test("bootstrap identity view helper switches between create and edit mode from bootstrap state and request url", () => {
  const createView = buildBootstrapIdentityView();
  const editView = buildBootstrapIdentityView({
    bootstrapState: {
      identities: [{
        id: "identity.bob",
        actor: "bob",
        label: "Bob",
        username: "bob"
      }]
    },
    requestUrl: "/_bootstrap?identity=identity.bob"
  });

  assert.equal(createView.mode, "create");
  assert.equal(createView.idDisabled, false);
  assert.equal(editView.mode, "edit");
  assert.equal(editView.idDisabled, true);
  assert.equal(editView.fields.id, "identity.bob");
});

test("bootstrap page main state helper owns seeded identity/starter state and guidance replacement content", () => {
  const seeded = buildBootstrapPageMainSeedState({
    bootstrapState: {
      identities: [{
        id: "identity.alice",
        actor: "alice",
        label: "Alice"
      }],
      activeStarterBlueprint: {
        blueprint: {
          requestPlan: []
        }
      }
    },
    bootstrapModel: {
      appReady: false
    },
    requestUrl: "/_bootstrap?identity=identity.alice"
  });
  const replacement = buildBootstrapPageMainReplacementContent({
    guidance: {
      id: "bootstrap.guidance"
    }
  });

  assert.equal(seeded.bootstrapIdentityView.mode, "edit");
  assert.equal(Array.isArray(seeded.bootstrapStarterPlan.requests), true);
  assert.equal(typeof replacement.guidanceCard, "string");
});

test("bootstrap page main slot manifest owns slot inventory and render wiring", async () => {
  const manifestSource = await readFile(new URL("./bootstrap-page-main-slots.wtoml", import.meta.url), "utf8");
  const slots = parseWitnessToml(manifestSource)
    .filter(doc => doc.kind === "bootstrapPageSlot")
    .map(doc => doc.values);
  const slotIds = slots.map(slot => slot.slotDomId);

  assert.equal(Array.isArray(slots), true);
  assert.equal(slotIds.includes("bootstrap-top-cards-slot"), true);
  assert.equal(slotIds.includes("bootstrap-runtime-plugin-install-slot"), true);
  assert.equal(slotIds.includes("bootstrap-capability-remove-slot"), true);
  assert.equal(slotIds.includes("bootstrap-starter-controls-slot"), true);
  assert.equal(slots.some(slot => slot.wtomlFile === "bootstrap-runtime-integration-controls.wtoml"), true);
  assert.equal(slots.some(slot => slot.initialStateSource === "bootstrapIdentityView"), true);
  assert.equal(slots.some(slot => slot.initialStateSource === "bootstrapStarterPlan"), true);
  assert.equal(slots.some(slot => slot.replacementContentSource === "guidanceCard"), true);
});
