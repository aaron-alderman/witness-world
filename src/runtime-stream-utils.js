import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";

export function parseStreamFailureLimit(value) {
  const raw = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

export async function streamReadableToFile(source, targetPath, { failAfterBytes = null } = {}) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.part-${randomUUID()}`;
  let sizeBytes = 0;
  let chunkCount = 0;
  let maxChunkBytes = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += buffer.length;
      chunkCount += 1;
      if (buffer.length > maxChunkBytes) maxChunkBytes = buffer.length;
      if (failAfterBytes != null && sizeBytes > failAfterBytes) {
        callback(new Error("stream failure injected"));
        return;
      }
      callback(null, buffer);
    }
  });
  const sink = createWriteStream(tempPath);
  let drainCount = 0;
  sink.on("drain", () => {
    drainCount += 1;
  });
  try {
    await streamPipeline(source, limiter, sink);
    await fs.rm(targetPath, { force: true }).catch(() => {});
    await fs.rename(tempPath, targetPath);
    return {
      sizeBytes,
      chunkCount,
      maxChunkBytes,
      drainCount,
      writeHighWaterMarkBytes: Number.isFinite(sink.writableHighWaterMark) ? sink.writableHighWaterMark : null
    };
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function streamFileToFile(sourcePath, targetPath, { failAfterBytes = null } = {}) {
  return streamReadableToFile(createReadStream(sourcePath), targetPath, { failAfterBytes });
}
