import { compileRvmFileToDesirePlus, normalizeDesirePlusToDesire } from "../../src/desire/index.js";

export function createRvmModelBodyLoader({ resolveFile, nodeName }) {
  if (typeof resolveFile !== "function") {
    throw new Error("createRvmModelBodyLoader requires resolveFile()");
  }
  if (typeof nodeName !== "string" || !nodeName.trim()) {
    throw new Error("createRvmModelBodyLoader requires nodeName");
  }

  let cachedBody = null;

  return async function loadModelBody({
    readFile = null,
    requireReadCapability = true
  } = {}) {
    if (cachedBody && typeof readFile !== "function") {
      return cachedBody;
    }

    const file = resolveFile();
    const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(file, {
      readFile,
      requireReadCapability
    }));
    const node = desire.nodes.find(candidate => candidate.kind === "dataflow" && candidate.name === nodeName);
    if (!node) {
      throw new Error(`${nodeName} dataflow model not found in ${file}`);
    }
    if (typeof readFile !== "function") {
      cachedBody = node.body;
    }
    return node.body;
  };
}
