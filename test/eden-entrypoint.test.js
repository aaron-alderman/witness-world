import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startUiDemoServer } from "./support/harness.js";

test("eden entrypoint serves the eden canvas route on its dedicated app file", async () => {
  const { url, close } = await startUiDemoServer({
    dslPath: path.join(process.cwd(), "examples", "eden/app.wtoml")
  });
  try {
    const eden = await fetch(`${url}/eden-canvas`);
    assert.equal(eden.status, 200);
    const html = await eden.text();
    assert.match(html, /Eden Canvas/);
    assert.match(html, /eden-stage/);

    const home = await fetch(`${url}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Witness Todo/);
  } finally {
    await close();
  }
});

