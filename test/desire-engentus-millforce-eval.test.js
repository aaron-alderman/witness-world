import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "../src/desire/index.js";
import { evaluateModel } from "../plugins/chart-runtime/dataflow-eval.js";
import { millForceKernels } from "../plugins/chart-runtime/mill-force-kernels.js";
import {
  millForcesFaithful,
  millForcesGrounded,
  DEFAULT_INPUTS
} from "../example-ports/engentus/js/mill_force_model.js";

// ── MF1: the symmetry-break proof ──────────────────────────────────────────────
// One IR model over a `method` axis reproduces BOTH hand-coded models. Most of it
// is honest dataflow; only fill_angle / gravity_area / cf_mass_moment are lowered
// kernels (the irreducible numerical methods), plus the parameterised Fw_t sign.

async function loadModelBody() {
  const file = path.join(process.cwd(), "examples_rvm", "engentus", "app", "models", "mill-force.rvm");
  const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file));
  const model = desire.nodes.find(n => n.kind === "dataflow" && n.name === "MillForce");
  assert.ok(model, "MillForce dataflow node not found");
  return model.body;
}

const close = (a, b, rel = 1e-6) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));

function checkAgainst(evaluated, methodName, jsResult) {
  const m = evaluated.axes.method.values.indexOf(methodName);
  assert.ok(m >= 0, `method ${methodName} not an axis value`);
  const N = evaluated.axes.segment.values.length;
  assert.equal(N, jsResult.segments.length);
  const sampleSegs = [0, 3, 7, 12, 19, 25, N - 1];
  for (const s of sampleSegs) {
    const js = jsResult.segments[s];
    for (const field of ["m_charge", "Fw_r", "Fw_t", "Fc_r", "F_r", "F_t", "F_resultant"]) {
      const got = evaluated.fields[field].data[s][m];
      assert.ok(close(got, js[field]), `${methodName} seg ${s} ${field}: got ${got} expected ${js[field]}`);
    }
  }
}

test("MillForce(grounded) reproduces millForcesGrounded per-segment forces", async () => {
  const evaluated = evaluateModel(await loadModelBody(), { functions: millForceKernels });
  assert.deepEqual(evaluated.axes.method.values, ["faithful", "grounded"]);
  assert.equal(evaluated.axes.segment.values.length, DEFAULT_INPUTS.N_segments);
  checkAgainst(evaluated, "grounded", millForcesGrounded(DEFAULT_INPUTS));
});

test("MillForce(faithful) reproduces millForcesFaithful per-segment forces", async () => {
  const evaluated = evaluateModel(await loadModelBody(), { functions: millForceKernels });
  checkAgainst(evaluated, "faithful", millForcesFaithful(DEFAULT_INPUTS));
});

test("the faithful/grounded duality lives only in the kernels + the Fw_t sign", async () => {
  const evaluated = evaluateModel(await loadModelBody(), { functions: millForceKernels });
  const fIdx = evaluated.axes.method.values.indexOf("faithful");
  const gIdx = evaluated.axes.method.values.indexOf("grounded");
  // pick a loaded segment (non-collapsed): the shoulder region, segment ~ middle of charge
  const seg = 3;
  const FwtF = evaluated.fields.Fw_t.data[seg][fIdx];
  const FwtG = evaluated.fields.Fw_t.data[seg][gIdx];
  // sign flip by design (Excel +sin vs grounded −sin)
  assert.ok(FwtF !== 0 && FwtG !== 0, "expected a loaded segment");
  assert.ok(Math.sign(FwtF) === -Math.sign(FwtG), "Fw_t sign should flip between methods");
});
