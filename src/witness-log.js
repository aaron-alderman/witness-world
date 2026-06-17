import fs from "node:fs";
import path from "node:path";

export class WitnessLog {
  constructor({ file = null } = {}) {
    this.file = file;
    this.entries = [];
    if (file && fs.existsSync(file)) {
      const text = fs.readFileSync(file, "utf8");
      this.entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
    }
  }

  append(witness) {
    this.entries.push(witness);
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(witness)}\n`, "utf8");
    }
    return witness;
  }

  replace(witnesses) {
    this.entries = [...witnesses];
    if (this.file) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, this.entries.map(w => JSON.stringify(w)).join("\n") + (this.entries.length ? "\n" : ""), "utf8");
    }
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
