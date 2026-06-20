import { parseOperatorWorkbenchRvm } from "./operator-rvm.js";
import { collectGlyphCodepoints } from "./operator-glyph-atlas.js";
import { createOperatorBrowserRuntime } from "./operator-runtime.js";
import { createOperatorExampleState } from "./operator-sample-state.js";

async function boot() {
  const canvas = document.getElementById("operator-canvas");
  if (!canvas) throw new Error("operator canvas not found");
  const source = await fetch("./operator.workbench.rvm").then(response => response.text());
  const model = parseOperatorWorkbenchRvm(source);
  const runtime = createOperatorBrowserRuntime({
    canvas,
    model,
    initialState: createOperatorExampleState()
  });
  globalThis.__operatorWorkbench = {
    model,
    runtime,
    collectGlyphCodepoints
  };
  runtime.mount();
}

boot().catch(error => {
  console.error(error);
});
