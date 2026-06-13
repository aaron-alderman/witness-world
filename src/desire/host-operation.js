// host-operation.js — GENERIC host-operation protocol + runtime. No domain logic.
//
// Rung C of the pipeline-fidelity ladder: make a DESIRE process actually *work*
// end-to-end against an external "black box" (a Python/DB algorithm), WITHOUT
// implementing the algorithm in DESIRE. DESIRE owns the wiring (A), the state
// machine (B), and now the orchestration + I/O protocol (C); the algorithm
// stays opaque behind a frozen request/response contract.
//
// ── The black-box ABI (frozen here) ──
//   A host operation is invoked with an ENVELOPE:
//       { host_operation: string, request: object }
//   where `request` conforms to the adapter's `request_schema`. It returns a
//   RESPONSE:
//       { status: "success" | "failure", payload: object }
//   where `payload` conforms to the success event's `payload_schema` (success)
//   or the failure event's `payload_schema` (failure). This pair IS the I/O
//   protocol. A handler may be in-process (a deterministic CI stub) or an
//   external subprocess (the real black box) reached over a pathway-agnostic
//   transport.
//
// ── Transport pathways (subprocess handlers) ──
//   The transport never assumes a single channel. A request reaches the child
//   over ONE input pathway and the response returns over ONE output pathway:
//     input : "env" (JSON in an env var) | "stdin" (JSON piped) | "file" (JSON file)
//     output: "stdout" (JSON printed)    | "file" (JSON file)
//   stderr + a non-zero exit code are the error channel. The child learns which
//   pathway to use from the HOST_OP_* env contract below, so the same black box
//   script works under any pathway the caller chooses.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Env contract shared by the subprocess transport and any black box it drives.
export const HOST_OP_ENV = Object.freeze({
  inputVia: "HOST_OP_INPUT_VIA",     // "env" | "stdin" | "file"
  outputVia: "HOST_OP_OUTPUT_VIA",   // "stdout" | "file"
  request: "HOST_OP_REQUEST",        // envelope JSON (input via "env")
  requestFile: "HOST_OP_REQUEST_FILE", // path to envelope JSON (input via "file")
  responseFile: "HOST_OP_RESPONSE_FILE" // path to write response JSON (output via "file")
});

export class HostOperationError extends Error {
  constructor(message, violations = []) {
    super(message);
    this.name = "HostOperationError";
    this.violations = violations;
  }
}

// ── Schema-lite validation (generic over message field defs) ──

function checkType(value, type) {
  switch (type) {
    case "string":
    case "text":
    case "timestamptz":
    case "timestamp":
    case "date":
      return typeof value === "string";
    case "int":
    case "integer":
    case "float64":
    case "float":
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "bool":
    case "boolean":
      return typeof value === "boolean";
    default:
      return true; // unknown / domain type: accept (structural check only)
  }
}

export function validateAgainstSchema(value, fields, label = "value") {
  const violations = [];
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return [`${label}: expected an object`];
  }
  for (const field of fields ?? []) {
    const name = field?.name;
    if (!name) continue;
    if (!(name in value)) { violations.push(`${label}: missing field '${name}'`); continue; }
    if (!checkType(value[name], field.type)) {
      violations.push(`${label}: field '${name}' expected ${field.type}, got ${typeof value[name]}`);
    }
  }
  return violations;
}

// ── Contracts extracted from an applied world ──
// For every adapter: its host_operation id, request schema, and the success /
// failure result schemas (the events' payload_schema). Keyed by host_operation.

const KIND_BY_PROCESS = {
  "desire.defineProcess": "process",
  "desire.defineMessage": "message",
  "desire.defineBoundary": "boundary"
};

function witnessesOf(world) {
  if (world && typeof world.allWitnesses === "function") return world.allWitnesses();
  if (Array.isArray(world)) return world;
  if (Array.isArray(world?.witnesses)) return world.witnesses;
  throw new Error("expected a world (with allWitnesses()) or a witness array");
}

export function extractHostOperationContracts(world) {
  const defs = new Map();
  for (const w of witnessesOf(world)) {
    const kind = KIND_BY_PROCESS[w.process];
    const id = w.body?.id;
    if (kind && id) defs.set(id, { id, kind, body: w.body });
  }
  const schemas = {};
  for (const d of defs.values()) {
    if (d.kind === "message") schemas[d.id] = d.body.fields ?? [];
  }
  const operations = {};
  for (const d of defs.values()) {
    if (d.kind !== "boundary") continue;
    for (const op of d.body.operations ?? []) {
      if (op.kind !== "adapter" || !op.hostOperation) continue;
      const successEvent = defs.get(op.successEvent);
      const failureEvent = defs.get(op.failureEvent);
      operations[op.hostOperation] = {
        adapter: d.id,
        command: op.command,
        requestSchema: op.requestSchema ?? null,
        successEvent: op.successEvent ?? null,
        failureEvent: op.failureEvent ?? null,
        successResultSchema: successEvent?.body?.schema ?? null,
        failureResultSchema: failureEvent?.body?.schema ?? null
      };
    }
  }
  return { operations, schemas };
}

// ── The runtime: host_operation id → handler, with request/response validation ──

export function createHostOperationRuntime({ handlers = {}, contracts = null } = {}) {
  const registry = new Map(Object.entries(handlers));
  const schemas = contracts?.schemas ?? {};
  const operations = contracts?.operations ?? {};

  function validate(schemaName, value, label) {
    if (!schemaName || !schemas[schemaName]) return;
    const violations = validateAgainstSchema(value, schemas[schemaName], label);
    if (violations.length) throw new HostOperationError(`${label} failed schema '${schemaName}'`, violations);
  }

  async function invoke(envelope) {
    if (!envelope || typeof envelope !== "object") throw new HostOperationError("invoke: envelope must be { host_operation, request }");
    const { host_operation: hostOp, request } = envelope;
    const handler = registry.get(hostOp);
    if (!handler) throw new HostOperationError(`no handler registered for host_operation '${hostOp}'`);

    const contract = operations[hostOp] ?? null;
    if (contract) validate(contract.requestSchema, request, `request for ${hostOp}`);

    const response = await handler(request ?? {}, { host_operation: hostOp });
    if (!response || typeof response !== "object" || (response.status !== "success" && response.status !== "failure")) {
      throw new HostOperationError(`handler for '${hostOp}' returned a malformed response (need { status, payload })`);
    }
    const payload = response.payload ?? {};
    if (contract) {
      if (response.status === "success") validate(contract.successResultSchema, payload, `success payload for ${hostOp}`);
      else validate(contract.failureResultSchema, payload, `failure payload for ${hostOp}`);
    }
    return { status: response.status, payload };
  }

  return {
    invoke,
    has: hostOp => registry.has(hostOp),
    list: () => [...registry.keys()],
    register(hostOp, handler) { registry.set(hostOp, handler); return this; }
  };
}

// A request/response function matching the `/api/runtime/materialized-host-operation`
// route contract: the SBTP adapter route delegates the envelope straight here.
export function createMaterializedHostOperationRoute(runtime) {
  return async function materializedHostOperation(envelope) {
    return runtime.invoke(envelope);
  };
}

// ── In-process handler (deterministic stub stand-in for the black box) ──

export function inProcessHandler(fn) {
  return async (request, meta) => fn(request, meta);
}

// ── Subprocess handler (the real black box, over a pathway-agnostic transport) ──

export function createSubprocessHandler(config = {}) {
  const {
    command,
    args = [],
    input = { via: "stdin" },
    output = { via: "stdout" },
    env = {},
    cwd = undefined,
    timeoutMs = 15000
  } = config;
  if (!command) throw new Error("createSubprocessHandler: `command` is required");
  const inputVia = input.via ?? "stdin";
  const outputVia = output.via ?? "stdout";

  return (request, meta) => new Promise((resolve, reject) => {
    const envelope = JSON.stringify({ host_operation: meta?.host_operation ?? null, request: request ?? {} });
    const work = mkdtempSync(join(tmpdir(), "hostop-"));
    const cleanup = () => { try { rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ } };

    const childEnv = { ...process.env, ...env, [HOST_OP_ENV.inputVia]: inputVia, [HOST_OP_ENV.outputVia]: outputVia };
    let reqFile = null;
    let respFile = null;
    try {
      if (inputVia === "env") {
        childEnv[input.name ?? HOST_OP_ENV.request] = envelope;
      } else if (inputVia === "file") {
        reqFile = input.path ?? join(work, "request.json");
        writeFileSync(reqFile, envelope, "utf8");
        childEnv[HOST_OP_ENV.requestFile] = reqFile;
      } else if (inputVia !== "stdin") {
        cleanup();
        reject(new HostOperationError(`unknown input pathway '${inputVia}'`));
        return;
      }
      if (outputVia === "file") {
        respFile = output.path ?? join(work, "response.json");
        childEnv[HOST_OP_ENV.responseFile] = respFile;
      } else if (outputVia !== "stdout") {
        cleanup();
        reject(new HostOperationError(`unknown output pathway '${outputVia}'`));
        return;
      }
    } catch (err) {
      cleanup();
      reject(err);
      return;
    }

    const child = spawn(command, args, { env: childEnv, cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      cleanup();
      reject(new HostOperationError(`host operation '${meta?.host_operation}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", d => { stdout += d; });
    child.stderr.on("data", d => { stderr += d; });
    child.on("error", err => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new HostOperationError(`failed to launch host operation: ${err.message}`));
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (code !== 0) {
          // stderr is the error channel.
          throw new HostOperationError(`host operation '${meta?.host_operation}' exited ${code}: ${stderr.trim()}`);
        }
        const raw = outputVia === "file" ? readFileSync(respFile, "utf8") : stdout;
        let response;
        try {
          response = JSON.parse(raw);
        } catch {
          throw new HostOperationError(`host operation '${meta?.host_operation}' produced invalid JSON on ${outputVia}: ${raw.slice(0, 200)}`);
        }
        resolve(response);
      } catch (err) {
        reject(err);
      } finally {
        cleanup();
      }
    });

    if (inputVia === "stdin") {
      child.stdin.write(envelope);
      child.stdin.end();
    }
  });
}
