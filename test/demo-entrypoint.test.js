import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startUiDemoServer } from "./support/harness.js";

test("demo entrypoint serves the todo app without mounting eden-canvas", async () => {
  const { url, close } = await startUiDemoServer({
    dslPath: path.join(process.cwd(), "examples", "demo-todo-app/app.wtoml")
  });
  try {
    const home = await fetch(`${url}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Witness Todo/);

    const eden = await fetch(`${url}/eden-canvas`);
    assert.equal(eden.status, 404);
  } finally {
    await close();
  }
});

