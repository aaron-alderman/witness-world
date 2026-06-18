import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  buildEngentusStyleArtifacts,
  loadEngentusGeneratedCssBundle
} from "../examples/engentus/app/engentus-style-application.js";

const proofDir = path.join(process.cwd(), "tmp", "engentus-wcss");

await mkdir(proofDir, { recursive: true });

const bundle = await loadEngentusGeneratedCssBundle();
const artifacts = await buildEngentusStyleArtifacts();

for (const [fileName, content] of Object.entries(bundle.files)) {
  await writeFile(path.join(proofDir, fileName), content, "utf8");
}
await writeFile(
  path.join(proofDir, "engentus-style-inventory.json"),
  `${JSON.stringify(artifacts.inventory, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(proofDir, "engentus-style-parity.json"),
  `${JSON.stringify(artifacts.parity, null, 2)}\n`,
  "utf8"
);
await writeFile(
  path.join(proofDir, "engentus-style-ownership.json"),
  `${JSON.stringify({
    switchManifest: artifacts.switchManifest,
    authoredPlan: artifacts.authoredPlan,
    ownership: artifacts.ownership
  }, null, 2)}\n`,
  "utf8"
);
