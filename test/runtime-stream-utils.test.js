import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Readable } from "node:stream";
import { parseStreamFailureLimit, streamFileToFile, streamReadableToFile } from "../plugins/fs-stream/stream-utils.js";

test("stream utils parse failure limits and persist readable content", async () => {
  assert.equal(parseStreamFailureLimit("12"), 12);
  assert.equal(parseStreamFailureLimit("-1"), null);

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stream-utils-"));
  const targetPath = path.join(tempRoot, "nested", "out.txt");
  const result = await streamReadableToFile(Readable.from(["hello", " ", "world"]), targetPath);

  assert.equal(await fs.readFile(targetPath, "utf8"), "hello world");
  assert.equal(result.sizeBytes, 11);
  assert.equal(result.chunkCount, 3);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("stream utils support file copies and clean up failed temp writes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-stream-utils-"));
  const sourcePath = path.join(tempRoot, "source.txt");
  const targetPath = path.join(tempRoot, "copied.txt");
  await fs.writeFile(sourcePath, "copy me", "utf8");

  const copied = await streamFileToFile(sourcePath, targetPath);
  assert.equal(await fs.readFile(targetPath, "utf8"), "copy me");
  assert.equal(copied.sizeBytes, 7);

  await assert.rejects(
    streamReadableToFile(Readable.from(["abcdef"]), path.join(tempRoot, "fail.txt"), { failAfterBytes: 3 }),
    /stream failure injected/
  );
  assert.equal(await fs.stat(path.join(tempRoot, "fail.txt")).catch(() => null), null);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
