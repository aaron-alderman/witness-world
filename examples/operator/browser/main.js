import { parseOperatorWorkbenchRvm } from "./operator-rvm.js";
import { collectGlyphCodepoints } from "./operator-glyph-atlas.js";
import { createOperatorBrowserRuntime } from "./operator-runtime.js";
import { createOperatorBrowserLiveApi } from "./operator-browser-live-api.js";
import { createOperatorBrowserStateFromWorkbenchSnapshot } from "./operator-snapshot-adapter.js";
import { createOperatorWorkbenchSnapshotFixture } from "./operator-snapshot-fixture.js";
import { resolveOperatorBrowserBootstrap } from "./operator-bootstrap.js";

async function boot() {
  const canvas = document.getElementById("operator-canvas");
  if (!canvas) throw new Error("operator canvas not found");
  const source = await fetch("./operator.workbench.rvm").then(response => response.text());
  const bridgeApi = createOperatorBrowserLiveApi({ baseUrl: "." });
  const bootstrap = await resolveOperatorBrowserBootstrap({
    liveApi: bridgeApi,
    search: window.location.search,
    loadFixtureSnapshot: async () => createOperatorWorkbenchSnapshotFixture()
  });
  const model = parseOperatorWorkbenchRvm(source);
  const initialState = createOperatorBrowserStateFromWorkbenchSnapshot(bootstrap.snapshot);
  initialState.hostMode = bootstrap.hostMode;
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState,
    liveApi: bootstrap.liveApi,
    fallbackPolicy: bootstrap.hostMode === "fixture-readonly" ? "read-only-fixture" : "live"
  });
  globalThis.__operatorWorkbench = {
    model,
    runtime,
    liveApi: bridgeApi,
    runtimeLiveApi: bootstrap.liveApi,
    hostMode: bootstrap.hostMode,
    snapshot: bootstrap.snapshot,
    collectGlyphCodepoints
  };
  runtime.mount();
}

boot().catch(error => {
  console.error(error);
});
