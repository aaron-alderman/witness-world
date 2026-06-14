import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const todoStarterBlueprintDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, "todo-starter-blueprint.json"), "utf8")
);

export function todoStarterBlueprint() {
  return JSON.parse(JSON.stringify(todoStarterBlueprintDocument));
}
