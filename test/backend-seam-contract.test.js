import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { BACKEND_SEAM_CAPABILITY_IDS, builtinCapabilityDefinitions } from "../src/runtime-builtins.js";

// Stage C0 — Freeze Contract Drift.
// Every shipped backend capability seam must declare the same contract shape so seams stay
// comparable as products, not just code paths. This test reads the authored source of truth —
// each plugin's runtime.js `capabilityDefinitions` provider plus the builtin runtime.config — and
// enforces that shape both ways:
//   forward — every id in BACKEND_SEAM_CAPABILITY_IDS carries the required contract fields;
//   reverse — every authored capability that ships provider + failure metadata is listed,
//             so a new seam cannot land without being declared here.

const here = path.dirname(url.fileURLToPath(import.meta.url));
const pluginsDir = path.resolve(here, "..", "plugins");

async function collectAuthoredCapabilityDefinitions() {
  const byId = new Map();
  const definedBy = new Map();
  const record = (capability, source) => {
    const id = String(capability?.id ?? "");
    if (!id) return;
    if (byId.has(id)) {
      throw new Error(`capability ${id} is defined by both ${definedBy.get(id)} and ${source}`);
    }
    byId.set(id, capability);
    definedBy.set(id, source);
  };

  // Builtin seams (e.g. runtime.config) are not owned by a plugin.
  for (const capability of builtinCapabilityDefinitions(BACKEND_SEAM_CAPABILITY_IDS)) {
    record(capability, "runtime-builtins");
  }

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runtimePath = path.join(pluginsDir, entry.name, "runtime.js");
    if (!fs.existsSync(runtimePath)) continue;
    const mod = await import(url.pathToFileURL(runtimePath).href);
    const providers = mod.providers ?? mod.default?.providers ?? [];
    for (const provider of providers) {
      if (provider?.kind !== "capabilityDefinitions") continue;
      for (const capability of provider.capabilities ?? []) {
        record(capability, `plugins/${entry.name}`);
      }
    }
  }
  return byId;
}

function failureProcesses(witnessContract) {
  if (!witnessContract || typeof witnessContract !== "object") return [];
  if (Array.isArray(witnessContract.failure)) return witnessContract.failure;
  return witnessContract.processes?.failure ?? [];
}

function hasSeamContract(capability) {
  return Array.isArray(capability?.providerAdapters)
    && capability.providerAdapters.length > 0
    && failureProcesses(capability?.witnessContract).length > 0;
}

test("every backend seam capability declares the full contract shape", async () => {
  const byId = await collectAuthoredCapabilityDefinitions();
  for (const id of BACKEND_SEAM_CAPABILITY_IDS) {
    const capability = byId.get(id);
    assert.ok(capability, `backend seam capability ${id} has no authored capability definition`);

    // providerAdapters: non-empty, exactly one default, each with id/label/status.
    assert.ok(Array.isArray(capability.providerAdapters) && capability.providerAdapters.length > 0,
      `${id} must declare at least one provider adapter`);
    const defaults = capability.providerAdapters.filter(adapter => adapter.default === true);
    assert.equal(defaults.length, 1, `${id} must declare exactly one default provider adapter`);
    for (const adapter of capability.providerAdapters) {
      assert.ok(typeof adapter.id === "string" && adapter.id.trim(), `${id} adapter requires an id`);
      assert.ok(typeof adapter.label === "string" && adapter.label.trim(), `${id} adapter ${adapter.id} requires a label`);
      assert.ok(typeof adapter.status === "string" && adapter.status.trim(), `${id} adapter ${adapter.id} requires a status`);
    }

    // witnessContract: external refs declared + at least one failure process witnessed.
    assert.ok(capability.witnessContract && typeof capability.witnessContract === "object",
      `${id} must declare a witness contract`);
    assert.ok(Array.isArray(capability.witnessContract.externalRefs),
      `${id} witness contract must declare externalRefs`);
    assert.ok(failureProcesses(capability.witnessContract).length > 0,
      `${id} witness contract must declare at least one failure process`);

    // authority + config: present (may be empty) so the seam's authority and config story is explicit.
    assert.ok(Array.isArray(capability.authority), `${id} must declare an authority array`);
    assert.ok(Array.isArray(capability.config), `${id} must declare a config array`);
  }
});

test("no backend seam ships provider + failure metadata without being declared", async () => {
  const byId = await collectAuthoredCapabilityDefinitions();
  const listed = new Set(BACKEND_SEAM_CAPABILITY_IDS);
  for (const [id, capability] of byId) {
    if (!hasSeamContract(capability)) continue;
    assert.ok(listed.has(id),
      `capability ${id} ships backend-seam contract metadata but is missing from BACKEND_SEAM_CAPABILITY_IDS`);
  }
});
