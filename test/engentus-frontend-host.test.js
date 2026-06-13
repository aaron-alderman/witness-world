import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { startUiServer } from "./support/harness.js";

test("engentus frontend server serves the DESIRE shell and charts without loading the pipeline", async () => {
  const { world, url, close } = await startUiServer({
    dslPath: path.join(process.cwd(), "examples", "engentus/app.wtoml"),
    serverRunnerId: "engentus_server"
  });
  try {
    const root = await fetch(`${url}/`);
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /Engentus/);
    assert.match(html, /Frontend-only DESIRE app/);
    assert.match(html, /Goodman Diagram/);
    assert.match(html, /Mill Force Rose/);
    assert.match(html, /Mill Charge Cross Section/);

    const alias = await fetch(`${url}/engentus`);
    assert.equal(alias.status, 200);

    const chart = await fetch(`${url}/chart?chart=GoodmanDiagram`);
    assert.equal(chart.status, 200);
    assert.match(await chart.text(), /GoodmanDiagram/);
    assert.equal(world.allWitnesses().some(witness =>
      JSON.stringify(witness.body ?? {}).includes("engentus.pipeline.")
    ), false);
  } finally {
    await close();
  }
});

