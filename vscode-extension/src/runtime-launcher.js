import { spawn } from "node:child_process";
import path from "node:path";

function parseRuntimeUrl(line) {
  const match = String(line || "").match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

export class RuntimeLauncher {
  constructor({
    repoRoot,
    writeOutput = () => {},
    onChange = () => {}
  }) {
    this.repoRoot = repoRoot;
    this.writeOutput = writeOutput;
    this.onChange = onChange;
    this.child = null;
    this.status = {
      running: false,
      url: null,
      appPath: null,
      runtimeProfile: null,
      port: null,
      exitCode: null,
      error: null
    };
    this.waiters = new Set();
  }

  emitChange() {
    this.onChange({ ...this.status });
  }

  getStatus() {
    return { ...this.status };
  }

  settleWaiters() {
    for (const waiter of [...this.waiters]) {
      if (this.status.url) {
        clearTimeout(waiter.timeoutId);
        this.waiters.delete(waiter);
        waiter.resolve(this.status.url);
        continue;
      }
      if (!this.status.running && this.status.error) {
        clearTimeout(waiter.timeoutId);
        this.waiters.delete(waiter);
        waiter.reject(new Error(this.status.error));
      }
    }
  }

  start({
    appPath,
    runtimeProfile = "full",
    port = 3000
  }) {
    if (this.child) throw new Error("preview runtime already running");
    const cliPath = path.join(this.repoRoot, "src", "cli.js");
    const args = [cliPath, "serve", appPath, "--runtime-profile", runtimeProfile, "--port", String(port)];
    this.child = spawn(process.execPath, args, {
      cwd: this.repoRoot,
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.status = {
      running: true,
      url: null,
      appPath,
      runtimeProfile,
      port,
      exitCode: null,
      error: null
    };
    this.emitChange();
    const consume = stream => {
      let buffer = "";
      stream.on("data", chunk => {
        buffer += chunk.toString();
        const parts = buffer.split(/\r?\n/);
        buffer = parts.pop() ?? "";
        for (const line of parts) {
          if (!line.trim()) continue;
          this.writeOutput(line);
          const parsedUrl = parseRuntimeUrl(line);
          if (parsedUrl && !this.status.url) {
            this.status.url = parsedUrl;
            this.emitChange();
            this.settleWaiters();
          }
        }
      });
    };
    consume(this.child.stdout);
    consume(this.child.stderr);
    this.child.on("error", error => {
      this.status = {
        ...this.status,
        running: false,
        error: error instanceof Error ? error.message : String(error)
      };
      this.emitChange();
      this.settleWaiters();
    });
    this.child.on("exit", code => {
      this.child = null;
      this.status = {
        ...this.status,
        running: false,
        exitCode: code,
        error: this.status.url
          ? this.status.error
          : (code === 0 ? "preview runtime exited before publishing a URL" : `preview runtime exited with code ${code}`)
      };
      this.emitChange();
      this.settleWaiters();
    });
  }

  waitForUrl({ timeoutMs = 10000 } = {}) {
    if (this.status.url) return Promise.resolve(this.status.url);
    if (!this.status.running) {
      return Promise.reject(new Error(this.status.error || "preview runtime is not running"));
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error("preview runtime did not publish a URL before timeout"));
        }, timeoutMs)
      };
      this.waiters.add(waiter);
    });
  }

  async stop() {
    if (!this.child) return;
    const current = this.child;
    await new Promise(resolve => {
      current.once("exit", () => resolve());
      current.kill();
    });
  }

  async dispose() {
    await this.stop();
  }
}
