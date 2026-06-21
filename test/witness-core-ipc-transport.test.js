import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { createWitnessCoreBridge } from "../src/witness-core-bridge.js";
import { createWitnessCoreIpcTransport, normalizeWitnessCoreTransportPipe } from "../src/witness-core-ipc-transport.js";
import {
  WITNESS_CORE_TRANSPORT_METHODS,
  WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS
} from "../src/witness-core-transport-contract.js";

function testSocketPath(name) {
  const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (process.platform === "win32") return `\\\\.\\pipe\\${name}-${suffix}`;
  return path.join(os.tmpdir(), `${name}-${suffix}.sock`);
}

async function cleanupSocketPath(socketPath) {
  if (process.platform === "win32") return;
  await fs.rm(socketPath, { force: true }).catch(() => {});
}

function onceServerListening(server, socketPath) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

function readBodyText(stream) {
  return new Promise((resolve, reject) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let text = "";
    const pump = async () => {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
        resolve(text);
      } catch (error) {
        reject(error);
      }
    };
    void pump();
  });
}

test("normalizeWitnessCoreTransportPipe trims whitespace", () => {
  assert.equal(normalizeWitnessCoreTransportPipe("  \\\\.\\pipe\\witness-core-test  "), "\\\\.\\pipe\\witness-core-test");
  assert.equal(normalizeWitnessCoreTransportPipe(""), "");
  assert.equal(normalizeWitnessCoreTransportPipe(null), "");
});

test("witness-core IPC transport round-trips request and response envelopes", async () => {
  const socketPath = testSocketPath("witness-core-ipc-call");
  const server = net.createServer(socket => {
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      const boundary = buffer.indexOf("\n");
      if (boundary < 0) return;
      const line = buffer.slice(0, boundary).trim();
      const request = JSON.parse(line);
      socket.write(`${JSON.stringify({
        protocol: request.protocol,
        kind: "result",
        method: request.method,
        requestId: request.requestId,
        ok: true,
        payload: {
          path: request.args.query.path,
          content: "hello"
        },
        error: null
      })}\n`);
      socket.end();
    });
  });
  await cleanupSocketPath(socketPath);
  await onceServerListening(server, socketPath);
  const transport = createWitnessCoreIpcTransport({ pipePath: socketPath });
  const payload = await transport.call({
    method: WITNESS_CORE_TRANSPORT_METHODS.sourceRead,
    args: {
      query: {
        path: "app/content.wtoml"
      }
    }
  });
  assert.deepEqual(payload, {
    path: "app/content.wtoml",
    content: "hello"
  });
  await new Promise(resolve => server.close(resolve));
  await cleanupSocketPath(socketPath);
});

test("witness-core IPC transport converts event envelopes into SSE frames for subscriptions", async () => {
  const socketPath = testSocketPath("witness-core-ipc-events");
  const server = net.createServer(socket => {
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      const boundary = buffer.indexOf("\n");
      if (boundary < 0) return;
      const line = buffer.slice(0, boundary).trim();
      const request = JSON.parse(line);
      socket.write(`${JSON.stringify({
        protocol: request.protocol,
        kind: "result",
        requestId: request.requestId,
        ok: true,
        payload: { channel: "core.events" },
        error: null
      })}\n`);
      socket.write(`${JSON.stringify({
        protocol: request.protocol,
        kind: "event",
        channel: "core.events",
        requestId: request.requestId,
        eventName: "generation.green_local",
        payload: {
          kind: "generation.green_local",
          generation: {
            id: "gen-2",
            state: "green_local"
          }
        }
      })}\n`);
      socket.end();
    });
  });
  await cleanupSocketPath(socketPath);
  await onceServerListening(server, socketPath);
  const transport = createWitnessCoreIpcTransport({ pipePath: socketPath });
  const response = await transport.subscribe({
    channel: WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents
  });
  const bodyText = await readBodyText(response.body);
  assert.match(bodyText, /event: generation\.green_local/);
  assert.match(bodyText, /"id":"gen-2"/);
  await new Promise(resolve => server.close(resolve));
  await cleanupSocketPath(socketPath);
});

test("createWitnessCoreBridge can use the IPC transport without fetch", async () => {
  const socketPath = testSocketPath("witness-core-ipc-bridge");
  const server = net.createServer(socket => {
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      const boundary = buffer.indexOf("\n");
      if (boundary < 0) return;
      const line = buffer.slice(0, boundary).trim();
      const request = JSON.parse(line);
      socket.write(`${JSON.stringify({
        protocol: request.protocol,
        kind: "result",
        method: request.method,
        requestId: request.requestId,
        ok: true,
        payload: {
          requestedMode: "live",
          effectiveMode: "live",
          reason: "requested-live"
        },
        error: null
      })}\n`);
      socket.end();
    });
  });
  await cleanupSocketPath(socketPath);
  await onceServerListening(server, socketPath);
  const bridge = createWitnessCoreBridge({
    pipePath: socketPath,
    fetchImpl() {
      throw new Error("fetch should not be used when IPC transport is configured");
    }
  });
  const serving = await bridge.readServing();
  assert.equal(serving.effectiveMode, "live");
  await new Promise(resolve => server.close(resolve));
  await cleanupSocketPath(socketPath);
});

test("witness-core IPC transport retries briefly while the pipe listener is still coming up", async () => {
  const socketPath = testSocketPath("witness-core-ipc-retry");
  const server = net.createServer(socket => {
    let buffer = "";
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      const boundary = buffer.indexOf("\n");
      if (boundary < 0) return;
      const line = buffer.slice(0, boundary).trim();
      const request = JSON.parse(line);
      socket.write(`${JSON.stringify({
        protocol: request.protocol,
        kind: "result",
        method: request.method,
        requestId: request.requestId,
        ok: true,
        payload: {
          exists: true,
          isFile: true,
          size: 7,
          modifiedAt: "now"
        },
        error: null
      })}\n`);
      socket.end();
    });
  });
  await cleanupSocketPath(socketPath);
  const transport = createWitnessCoreIpcTransport({
    pipePath: socketPath,
    connectTimeoutMs: 500,
    connectRetryDelayMs: 20
  });
  setTimeout(() => {
    void onceServerListening(server, socketPath);
  }, 80);
  const payload = await transport.call({
    method: WITNESS_CORE_TRANSPORT_METHODS.sourceStat,
    args: {
      query: {
        path: "app/content.wtoml"
      }
    }
  });
  assert.equal(payload.exists, true);
  await new Promise(resolve => server.close(resolve));
  await cleanupSocketPath(socketPath);
});
