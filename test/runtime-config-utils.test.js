import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRuntimeConfigFieldName, resolveRuntimeConfig } from "../src/runtime-config-utils.js";

test("runtime config utilities normalize field names and resolve values", () => {
  assert.equal(normalizeRuntimeConfigFieldName(" plain.value "), "plain.value");
  assert.equal(normalizeRuntimeConfigFieldName("\"quoted.value\""), "quoted.value");

  const resolved = resolveRuntimeConfig({
    "\"flat.key\"": 7,
    direct: "ok",
    secretOnly: { secret: "API_TOKEN" },
    fallbackSecret: { secret: "MISSING_TOKEN", default: "fallback" },
    optionalSecret: { secret: "ALSO_MISSING", required: false }
  }, {
    API_TOKEN: "secret-value"
  });

  assert.equal(resolved.ok, true);
  assert.equal(resolved.values["flat.key"], 7);
  assert.equal(resolved.values.direct, "ok");
  assert.equal(resolved.values.secretOnly, "secret-value");
  assert.equal(resolved.values.fallbackSecret, "fallback");
  assert.equal("optionalSecret" in resolved.values, false);
  assert.equal(resolved.fields.find(field => field.name === "secretOnly")?.redacted, true);
});

test("runtime config resolution reports invalid entries and missing required secrets", () => {
  const resolved = resolveRuntimeConfig({
    invalid: { secret: "" },
    missingSecret: { secret: "NOPE" },
    badValue: { value: { nope: true } }
  }, {});

  assert.equal(resolved.ok, false);
  assert.equal(resolved.failures.some(failure => failure.field === "invalid"), true);
  assert.equal(resolved.failures.some(failure => failure.field === "missingSecret"), true);
  assert.equal(resolved.failures.some(failure => failure.field === "badValue"), true);
});
