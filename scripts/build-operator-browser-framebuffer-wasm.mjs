import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ascPath = path.join(root, "node_modules", "assemblyscript", "bin", "asc.js");
const sourcePath = path.join(root, "examples", "operator", "browser", "operator-framebuffer.as.ts");
const outDir = path.join(root, "examples", "operator", "browser", "dist");
const outPath = path.join(outDir, "operator-framebuffer.wasm");

function runChild(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", code => {
      resolve({
        code: Number(code ?? 1),
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

await fs.mkdir(outDir, { recursive: true });
const result = await runChild(
  process.execPath,
  [
    ascPath,
    sourcePath,
    "--target",
    "release",
    "--optimize",
    "--exportRuntime",
    "--outFile",
    outPath
  ],
  root
);

if (result.code !== 0) {
  process.stderr.write(`${result.stderr || result.stdout || "AssemblyScript compile failed"}\n`);
  process.exit(result.code);
}

process.stdout.write(`Built ${path.relative(root, outPath)}\n`);
