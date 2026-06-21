import { createOperatorBrowserStateFromWorkbenchSnapshot } from "./operator-snapshot-adapter.js";
import { createOperatorWorkbenchSnapshotFixture } from "./operator-snapshot-fixture.js";

export function createOperatorExampleState() {
  return createOperatorBrowserStateFromWorkbenchSnapshot(createOperatorWorkbenchSnapshotFixture());
}
