import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  GUIDANCE_SUGGESTION_ACTION_KINDS,
  GUIDANCE_SUGGESTION_FOCUS_TARGETS,
  validateGuidanceActionRegistry
} from "../src/runtime-guidance-action-registry.js";

test("guidance action registry validates without hidden behavior", () => {
  const result = validateGuidanceActionRegistry();
  assert.equal(result.ok, true, result.issues.join("; "));
  assert.equal(result.ok, GUIDANCE_SUGGESTION_ACTION_KINDS.length > 0);
});

test("registered suggestion focus targets exist on bootstrap surfaces", async () => {
  const bootstrapWtoml = await readFile(new URL("../plugins/bootstrap/bootstrap-top-cards.wtoml", import.meta.url), "utf8");
  const starterWtoml = await readFile(new URL("../plugins/bootstrap/bootstrap-starter-controls.wtoml", import.meta.url), "utf8");
  const pageMainWtoml = await readFile(new URL("../plugins/bootstrap/bootstrap-page-main.wtoml", import.meta.url), "utf8");
  const combined = bootstrapWtoml + starterWtoml + pageMainWtoml;
  for (const target of GUIDANCE_SUGGESTION_FOCUS_TARGETS) {
    assert.match(combined, new RegExp(`guidanceTarget = "${target}"`));
  }
});