import assert from "node:assert/strict";
import test from "node:test";
import * as hostFacade from "../src/host.js";
import * as hostEntry from "../src/runtime-host-entry.js";
import { normalizeLogger } from "../src/logger.js";

test("host facade re-exports the runtime host entry surface", () => {
  assert.equal(hostFacade.declareBackendHost, hostEntry.declareBackendHost);
  assert.equal(hostFacade.declareFrontendHost, hostEntry.declareFrontendHost);
  assert.equal(hostFacade.hostCapabilities, hostEntry.hostCapabilities);
  assert.equal(hostFacade.resolveServerRunner, hostEntry.resolveServerRunner);
  assert.equal(hostFacade.startServer, hostEntry.startServer);
});

test("normalizeLogger converts null into a safe logger contract", () => {
  const logger = normalizeLogger(null);
  assert.equal(typeof logger.info, "function");
  assert.equal(typeof logger.warn, "function");
  assert.equal(typeof logger.error, "function");
  assert.equal(typeof logger.debug, "function");
  assert.doesNotThrow(() => logger.info("event", {}));
});
