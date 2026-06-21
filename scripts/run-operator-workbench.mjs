import path from "node:path";
import { launchDesktopProcess } from "../src/desktop-cli.js";

const workspaceRoot = process.cwd();
const defaultArgs = [
  path.resolve(workspaceRoot, "examples", "operator"),
  "--runtime-plugin",
  "plugin.operator-workbench"
];

const exitCode = await launchDesktopProcess({
  args: [...defaultArgs, ...process.argv.slice(2)],
  cwd: workspaceRoot,
  env: process.env,
  entryScript: path.resolve(workspaceRoot, "plugins", "operator-workbench", "workbench", "main.js")
});

process.exit(exitCode ?? 0);
