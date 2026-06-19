import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRuntimeIssueSuggestions,
  summarizeCompanionAttention
} from "../src/runtime-guidance-runtime-issue-suggestions.js";

test("buildRuntimeIssueSuggestions turns active runtime issues into explainable companion suggestions", () => {
  const suggestions = buildRuntimeIssueSuggestions({
    issues: [
      {
        id: "issue-a",
        severity: "warning",
        phase: "settle-probe",
        kind: "missing-target",
        message: "Missing interaction target",
        surfaceId: "home",
        status: "active"
      },
      {
        id: "issue-b",
        severity: "error",
        phase: "boot",
        kind: "runtime-boot-failure",
        message: "Boot failed",
        targetId: "login-button",
        status: "active"
      },
      {
        id: "issue-c",
        severity: "info",
        message: "Resolved issue",
        status: "resolved"
      }
    ]
  });

  assert.equal(suggestions.length, 2);
  assert.equal(suggestions[0].issueId, "issue-b");
  assert.equal(suggestions[0].action.kind, "focusRuntimeTarget");
  assert.equal(suggestions[0].action.targetId, "login-button");
  assert.equal(suggestions[1].action.kind, "openRuntimeIssues");
  assert.match(suggestions[0].explain, /runtime inspection/);
});

test("summarizeCompanionAttention prioritizes runtime errors in the companion badge", () => {
  const attention = summarizeCompanionAttention({
    issueSummary: { active: 2, worstSeverity: "error" },
    suggestions: [{ id: "one" }],
    guidance: { visible: true, label: "Resume Tutorial" }
  });

  assert.equal(attention.visible, true);
  assert.equal(attention.fabLabel, "Issues 2");
  assert.equal(attention.worstSeverity, "error");
});