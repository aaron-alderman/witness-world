import test from "node:test";
import assert from "node:assert/strict";

import {
  WITNESS_CORE_TRANSPORT_MESSAGE_KINDS,
  WITNESS_CORE_TRANSPORT_METHODS,
  WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
  WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS,
  createWitnessCoreTransportCall,
  createWitnessCoreTransportEvent,
  createWitnessCoreTransportResult,
  createWitnessCoreTransportSubscribe,
  parseWitnessCoreTransportMessage
} from "../src/witness-core-transport-contract.js";

test("witness-core transport contract defines versioned call and subscribe shapes", () => {
  assert.equal(WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION, "witness-core-transport/v1");
  assert.equal(WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.call, "call");
  assert.equal(WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.subscribe, "subscribe");
  assert.equal(WITNESS_CORE_TRANSPORT_METHODS.sourceRead, "source.read");
  assert.equal(WITNESS_CORE_TRANSPORT_METHODS.statusReadHealth, "status.read_health");
  assert.equal(WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents, "core.events");
});

test("witness-core transport helpers round-trip call, result, subscribe, and event envelopes", () => {
  const call = createWitnessCoreTransportCall({
    method: WITNESS_CORE_TRANSPORT_METHODS.sourceRead,
    requestId: "req-1",
    args: { query: { path: "app/content.wtoml" } }
  });
  const result = createWitnessCoreTransportResult({
    method: WITNESS_CORE_TRANSPORT_METHODS.sourceRead,
    requestId: "req-1",
    ok: true,
    payload: { content: "hello" }
  });
  const subscribe = createWitnessCoreTransportSubscribe({
    channel: WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents,
    requestId: "sub-1",
    args: { scope: "status" }
  });
  const event = createWitnessCoreTransportEvent({
    channel: WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents,
    requestId: "sub-1",
    eventName: "generation.green_local",
    payload: { generationId: "gen-1" }
  });

  assert.equal(parseWitnessCoreTransportMessage(call)?.method, WITNESS_CORE_TRANSPORT_METHODS.sourceRead);
  assert.equal(parseWitnessCoreTransportMessage(result)?.kind, WITNESS_CORE_TRANSPORT_MESSAGE_KINDS.result);
  assert.equal(parseWitnessCoreTransportMessage(subscribe)?.channel, WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS.coreEvents);
  assert.equal(parseWitnessCoreTransportMessage(event)?.eventName, "generation.green_local");
});

test("witness-core transport contract rejects unknown methods and channels", () => {
  assert.throws(
    () => createWitnessCoreTransportCall({ method: "unknown.method" }),
    /unknown witness-core transport method/i
  );
  assert.throws(
    () => createWitnessCoreTransportSubscribe({ channel: "unknown.channel" }),
    /unknown witness-core transport subscription/i
  );
  assert.equal(parseWitnessCoreTransportMessage({
    protocol: WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION,
    kind: "call",
    method: "unknown.method"
  }), null);
});
