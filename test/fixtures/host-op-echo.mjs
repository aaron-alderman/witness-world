#!/usr/bin/env node
// host-op-echo.mjs — a minimal EXTERNAL black box honouring the host-operation
// ABI over any transport pathway. Used by the Rung-C transport tests to prove
// the subprocess transport is pathway-agnostic; a real Python black box would
// read/write exactly the same way.
//
//   input  (HOST_OP_INPUT_VIA):  "env" → $HOST_OP_REQUEST | "stdin" | "file" → $HOST_OP_REQUEST_FILE
//   output (HOST_OP_OUTPUT_VIA): "stdout" | "file" → $HOST_OP_RESPONSE_FILE
//   errors: anything → stderr + non-zero exit.
//
// Behaviour: echoes the request back in the payload. If request.simulate ===
// "failure" it returns a failure response; if request.simulate === "crash" it
// dies on the error channel (to exercise stderr + non-zero exit handling).

import { readFileSync, writeFileSync } from "node:fs";

function readAllStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

try {
  const inputVia = process.env.HOST_OP_INPUT_VIA ?? "stdin";
  let raw;
  if (inputVia === "env") raw = process.env.HOST_OP_REQUEST ?? "";
  else if (inputVia === "file") raw = readFileSync(process.env.HOST_OP_REQUEST_FILE, "utf8");
  else raw = readAllStdin();

  const envelope = JSON.parse(raw);
  const request = envelope.request ?? {};

  if (request.simulate === "crash") {
    process.stderr.write("host-op-echo: simulated crash\n");
    process.exit(3);
  }

  const response = request.simulate === "failure"
    ? { status: "failure", payload: { message: "simulated failure", echo: request } }
    : { status: "success", payload: { echo: request, host_operation: envelope.host_operation } };

  const out = JSON.stringify(response);
  if ((process.env.HOST_OP_OUTPUT_VIA ?? "stdout") === "file") writeFileSync(process.env.HOST_OP_RESPONSE_FILE, out, "utf8");
  else process.stdout.write(out);
} catch (err) {
  process.stderr.write(`host-op-echo error: ${err.message}\n`);
  process.exit(1);
}
