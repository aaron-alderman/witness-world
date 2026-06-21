import { runOperatorTui } from "../plugins/operator-workbench/tui-engine.js";

const exitCode = await runOperatorTui({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  stdin: process.stdin,
  stdout: process.stdout
});

process.exit(exitCode ?? 0);
