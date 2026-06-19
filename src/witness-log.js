import fs from "node:fs";
import path from "node:path";

function appendTextAsync(file, text) {
  return fs.promises.appendFile(file, text, "utf8");
}

export class WitnessLog {
  constructor({
    file = null,
    bufferedPersistence = false
  } = {}) {
    this.file = file;
    this.entries = [];
    this.directoryPrepared = false;
    this.writeChain = Promise.resolve();
    this.pendingWriteCount = 0;
    this.persistenceMode = bufferedPersistence === true ? "buffered" : "sync";
    this.bufferedLines = [];
    if (file && fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8");
      this.entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
      this.directoryPrepared = true;
    }
  }

  ensureDirectorySync() {
    if (!this.file || this.directoryPrepared) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.directoryPrepared = true;
  }

  enqueueWrite(text) {
    if (!this.file || !text) return Promise.resolve();
    this.ensureDirectorySync();
    this.pendingWriteCount += 1;
    const task = this.writeChain.then(() => appendTextAsync(this.file, text));
    this.writeChain = task
      .catch(() => {})
      .finally(() => {
        this.pendingWriteCount = Math.max(0, this.pendingWriteCount - 1);
        if (this.pendingWriteCount === 0 && this.persistenceMode === "queued") {
          this.persistenceMode = "sync";
        }
      });
    return task;
  }

  beginBufferedPersistence() {
    if (!this.file) return;
    if (this.persistenceMode === "buffered") return;
    this.persistenceMode = "buffered";
  }

  commitBufferedPersistence({
    mode = "post-ready"
  } = {}) {
    if (!this.file) return Promise.resolve();
    const chunk = this.bufferedLines.join("");
    this.bufferedLines = [];
    if (mode === "pre-ready") {
      this.persistenceMode = "sync";
      if (chunk) {
        this.ensureDirectorySync();
        fs.appendFileSync(this.file, chunk, "utf8");
      }
      return this.flushPersistence();
    }
    this.persistenceMode = "queued";
    return chunk ? this.enqueueWrite(chunk) : this.flushPersistence();
  }

  async flushPersistence() {
    if (this.persistenceMode === "buffered") {
      await this.commitBufferedPersistence({ mode: "pre-ready" });
      return;
    }
    await this.writeChain;
  }

  append(witness) {
    this.entries.push(witness);
    if (this.file) {
      const line = `${JSON.stringify(witness)}\n`;
      if (this.persistenceMode === "buffered") {
        this.bufferedLines.push(line);
      } else if (this.persistenceMode === "queued") {
        this.enqueueWrite(line);
      } else {
        this.ensureDirectorySync();
        fs.appendFileSync(this.file, line, "utf8");
      }
    }
    return witness;
  }

  replace(witnesses) {
    this.entries = [...witnesses];
    this.bufferedLines = [];
    this.pendingWriteCount = 0;
    this.writeChain = Promise.resolve();
    if (this.file) {
      this.ensureDirectorySync();
      fs.writeFileSync(this.file, this.entries.map(w => JSON.stringify(w)).join("\n") + (this.entries.length ? "\n" : ""), "utf8");
    }
    return this.entries;
  }

  live() {
    return this.entries;
  }

  all() {
    return [...this.entries];
  }

  count() {
    return this.entries.length;
  }

  last() {
    return this.entries.at(-1) ?? null;
  }

  slice(start = 0, end = undefined) {
    return this.entries.slice(start, end);
  }
}
