import assert from "node:assert/strict";
import test from "node:test";
import * as hostFacade from "../src/host.js";
import * as hostEntry from "../src/runtime-host-entry.js";

test("host facade re-exports the runtime host entry surface", () => {
  assert.equal(hostFacade.declareBackendHost, hostEntry.declareBackendHost);
  assert.equal(hostFacade.declareFrontendHost, hostEntry.declareFrontendHost);
  assert.equal(hostFacade.hostCapabilities, hostEntry.hostCapabilities);
  assert.equal(hostFacade.resolveServerRunner, hostEntry.resolveServerRunner);
  assert.equal(hostFacade.startServer, hostEntry.startServer);
});
