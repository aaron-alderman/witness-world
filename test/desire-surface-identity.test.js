import assert from "node:assert/strict";
import test from "node:test";
import {
  compileRvmToDesirePlus,
  serializeDesirePlusToRvm
} from "../src/desire/index.js";

test("RVM surface identity stays in the semantic layer and round-trips through serialization", () => {
  const source = `
view TodoPage {
  identity todo.page
  kind page
  class todo-page
}

chart TodoChart of TodoMetrics {
  identity todo.chart
  frame cartesian
}
`.trim();

  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/surface-identity.rvm" });
  const page = desirePlus.nodes.find(node => node.semantic?.kind === "surface" && node.name === "TodoPage")?.semantic;
  const chart = desirePlus.nodes.find(node => node.semantic?.kind === "surface" && node.name === "TodoChart")?.semantic;

  assert.equal(page?.identity, "todo.page");
  assert.equal(chart?.identity, "todo.chart");

  const serialized = serializeDesirePlusToRvm({
    ...desirePlus,
    nodes: desirePlus.nodes.map(node => ({
      ...node,
      payload: { ...node.payload, raw: "", header: "" }
    }))
  });

  assert.match(serialized, /identity todo\.page/);
  assert.match(serialized, /identity todo\.chart/);
});
