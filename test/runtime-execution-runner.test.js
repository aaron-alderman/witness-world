import assert from "node:assert/strict";
import test from "node:test";
import { createExecutionRunner } from "../src/runtime-execution-runner.js";

test("execution runner tracks nested async work and settles only when the full task graph clears", async () => {
  const runner = createExecutionRunner();
  const order = [];
  const settlePromise = runner.whenSettled();

  const work = runner.track("outer", async () => {
    order.push("outer:start");
    await runner.track("inner", async () => {
      order.push("inner:start");
      await Promise.resolve();
      order.push("inner:end");
    }, { correlationId: "inner:1" });
    order.push("outer:end");
  }, { correlationId: "outer:1" });

  await Promise.resolve();
  const snapshotWhileActive = runner.settledSnapshot();
  assert.equal(snapshotWhileActive.settled, false);
  assert.equal(snapshotWhileActive.activeTaskCount, 2);
  assert.deepEqual(snapshotWhileActive.pendingByKind, { outer: 1, inner: 1 });

  await work;
  const settled = await settlePromise;
  assert.equal(settled.settled, true);
  assert.equal(settled.activeTaskCount, 0);
  assert.deepEqual(order, ["outer:start", "inner:start", "inner:end", "outer:end"]);
  assert.deepEqual(runner.recentTasks().map(task => [task.kind, task.status]), [
    ["inner", "resolved"],
    ["outer", "resolved"]
  ]);
});

test("execution runner records failures and still releases the settle barrier", async () => {
  const runner = createExecutionRunner();
  await assert.rejects(
    runner.track("failing-task", async () => {
      throw new Error("boom");
    }, { correlationId: "fail:1" }),
    /boom/
  );

  const settled = await runner.whenSettled();
  assert.equal(settled.settled, true);
  assert.equal(settled.activeTaskCount, 0);
  const [task] = runner.recentTasks().slice(-1);
  assert.equal(task.kind, "failing-task");
  assert.equal(task.status, "rejected");
  assert.equal(task.error?.message, "boom");
});

test("execution runner supports filtered settle barriers for process-only idle", async () => {
  const runner = createExecutionRunner();
  let releaseProcess = null;
  let releaseRoute = null;
  const processDone = new Promise(resolve => { releaseProcess = resolve; });
  const routeDone = new Promise(resolve => { releaseRoute = resolve; });

  const processTask = runner.track("process.delay", async () => processDone, { correlationId: "process:1" });
  const routeTask = runner.track("route-swap", async () => routeDone, { correlationId: "route:1" });

  const processIdle = runner.whenSettled(task => String(task?.kind || "").startsWith("process."));
  await Promise.resolve();
  assert.equal(runner.settledSnapshot().settled, false);

  releaseProcess();
  await processTask;
  const processSettled = await processIdle;
  assert.equal(processSettled.settled, true);
  assert.equal(processSettled.activeTaskCount, 0);
  assert.equal(runner.settledSnapshot().settled, false);

  releaseRoute();
  await routeTask;
  assert.equal((await runner.whenSettled()).settled, true);
});
