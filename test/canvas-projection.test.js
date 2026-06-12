import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWorld, createThing, thing, relation } from "../src/kernel.js";
import { createPerspective, placeThing, moveInstance, moveManyInstances, relateThings, removeInstance, duplicateInstance, setGrid, batchApply, attachAsset } from "../src/canvas-processes.js";
import { canvasProjection, perspectivesProjection, thingDetails } from "../src/canvas-projection.js";

function seededWorld({ witnessLogPath = null } = {}) {
  const world = createWorld({ witnessLogPath });
  createThing(world, { actor: "adam", id: "aaron" });
  createThing(world, { actor: "aaron", id: "customer" });
  createThing(world, { actor: "aaron", id: "proposal" });
  return world;
}

test("perspectivesProjection lists witnessed perspectives with titles and owners", () => {
  const world = seededWorld();
  createPerspective(world, { actor: "aaron", title: "Sales View" });
  createPerspective(world, { actor: "aaron", title: "Support View" });
  const perspectives = perspectivesProjection(world.allWitnesses());
  assert.equal(perspectives.length, 2);
  assert.deepEqual(perspectives.map(p => p.owner), ["aaron", "aaron"]);
  assert(perspectives.some(p => p.title === "Sales View"));
});

test("canvasProjection returns null for unknown perspective", () => {
  const world = seededWorld();
  assert.equal(canvasProjection(world.allWitnesses(), "nope"), null);
});

test("instances carry geometry, labels fall back to thing id", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 100, y: 200 });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.equal(canvas.instances.length, 1);
  const [instance] = canvas.instances;
  assert.equal(instance.thing, "customer");
  assert.equal(instance.label, "customer");
  assert.equal(instance.x, 100);
  assert.equal(instance.y, 200);
});

test("the same thing holds different positions in different perspectives", () => {
  const world = seededWorld();
  const sales = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  const support = createPerspective(world, { actor: "aaron", title: "Support View" }).body.id;
  const salesInstance = placeThing(world, { actor: "aaron", perspective: sales, thing: "customer", x: 10, y: 10 }).body.instance;
  const supportInstance = placeThing(world, { actor: "aaron", perspective: support, thing: "customer", x: 500, y: 500 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective: sales, instance: salesInstance, x: 42, y: 43 });

  const salesCanvas = canvasProjection(world.allWitnesses(), sales);
  const supportCanvas = canvasProjection(world.allWitnesses(), support);
  assert.notEqual(salesInstance, supportInstance);
  assert.equal(salesCanvas.instances[0].x, 42);
  assert.equal(supportCanvas.instances[0].x, 500);
});

test("connectors appear only when both endpoints are placed, and exclude canvas vocabulary", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal" });

  placeThing(world, { actor: "aaron", perspective, thing: "customer" });
  let canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.equal(canvas.connectors.length, 0);

  placeThing(world, { actor: "aaron", perspective, thing: "proposal" });
  canvas = canvasProjection(world.allWitnesses(), perspective);
  const rels = canvas.connectors.map(c => c.rel);
  assert(rels.includes("references"));
  assert.equal(rels.includes("hasGeometry"), false);
  assert.equal(rels.includes("contains"), false);
  assert.equal(rels.includes("proxies"), false);
});

test("removed instances disappear from the projection and return to availableThings", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  removeInstance(world, { actor: "aaron", perspective, instance });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.equal(canvas.instances.length, 0);
  assert(canvas.availableThings.some(t => t.id === "customer"));
});

test("availableThings hides infrastructure kinds and counts placements", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "customer" });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  const ids = canvas.availableThings.map(t => t.id);
  assert.equal(ids.includes(perspective), false);
  assert.equal(canvas.availableThings.find(t => t.id === "customer").placed, 1);
  assert.equal(canvas.availableThings.find(t => t.id === "proposal").placed, 0);
});

test("the same thing placed twice in one perspective keeps independent geometry", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  const first = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 10, y: 10 }).body.instance;
  const second = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 300, y: 300 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance: first, x: 50, y: 60 });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.equal(canvas.instances.length, 2);
  assert.equal(canvas.instances.find(i => i.id === first).x, 50);
  assert.equal(canvas.instances.find(i => i.id === second).x, 300);
  assert.equal(canvas.availableThings.find(t => t.id === "customer").placed, 2);
});

test("a relation draws one connector per instance pair when a thing is duplicated", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 0, y: 0 });
  placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 200, y: 0 });
  placeThing(world, { actor: "aaron", perspective, thing: "proposal", x: 100, y: 200 });
  relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal" });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  const refs = canvas.connectors.filter(c => c.rel === "references");
  assert.equal(refs.length, 2);
  assert.notEqual(refs[0].fromInstance, refs[1].fromInstance);
  assert.equal(refs[0].toInstance, refs[1].toInstance);
});

test("self-relations skip same-instance pairs", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 0, y: 0 });
  placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 200, y: 0 });
  relateThings(world, { actor: "aaron", from: "customer", rel: "mirrors", to: "customer" });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  const mirrors = canvas.connectors.filter(c => c.rel === "mirrors");
  assert.equal(mirrors.length, 2);
  assert(mirrors.every(c => c.fromInstance !== c.toInstance));
});

test("removing one of two duplicate instances leaves the other", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  const first = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  const second = placeThing(world, { actor: "aaron", perspective, thing: "customer" }).body.instance;
  removeInstance(world, { actor: "aaron", perspective, instance: first });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.deepEqual(canvas.instances.map(i => i.id), [second].sort());
  assert.equal(canvas.availableThings.find(t => t.id === "customer").placed, 1);
});

test("perspective.grid is null until witnessed and reflects the latest grid", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  assert.equal(canvasProjection(world.allWitnesses(), perspective).perspective.grid, null);
  setGrid(world, { actor: "aaron", perspective, snap: true, size: 20 });
  setGrid(world, { actor: "aaron", perspective, snap: false, size: 40 });
  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.deepEqual(canvas.perspective.grid, { snap: false, size: 40 });
  assert.equal(canvas.connectors.some(c => c.rel === "hasGrid"), false);
});

test("replay determinism: a world rebuilt from the same witness log projects identically", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "witness-canvas-"));
  const logPath = path.join(dir, "witness-log.jsonl");

  const world = seededWorld({ witnessLogPath: logPath });
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  const instance = placeThing(world, { actor: "aaron", perspective, thing: "customer", x: 11, y: 22 }).body.instance;
  moveInstance(world, { actor: "aaron", perspective, instance, x: 77, y: 88 });
  relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal" });
  const other = placeThing(world, { actor: "aaron", perspective, thing: "proposal", x: 1, y: 2 }).body.instance;
  const clone = duplicateInstance(world, { actor: "aaron", perspective, instance }).body.instance;
  moveManyInstances(world, { actor: "aaron", perspective, moves: [{ instance: other, x: 400, y: 410 }, { instance: clone, x: 500, y: 510 }] });
  setGrid(world, { actor: "aaron", perspective, snap: true, size: 20 });
  batchApply(world, {
    actor: "aaron",
    perspective,
    moves: [{ instance: clone, x: 600, y: 610 }],
    styles: [{ instance: other, style: { color: "#ddeeff" } }],
    camera: { x: 12, y: 13, zoom: 1.5 },
    grid: { snap: false, size: 40 }
  });
  const before = canvasProjection(world.allWitnesses(), perspective);

  const replayed = createWorld({ witnessLogPath: logPath });
  const after = canvasProjection(replayed.allWitnesses(), perspective);
  assert.deepEqual(after, before);
  assert.equal(after.instances.find(i => i.id === instance).x, 77);
});

test("thingDetails lists reality relations without perspective geometry", () => {
  const world = seededWorld();
  const perspective = createPerspective(world, { actor: "aaron", title: "Sales View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "customer" });
  relateThings(world, { actor: "aaron", from: "customer", rel: "references", to: "proposal" });
  const details = thingDetails(world.allWitnesses(), "customer");
  assert(details.relations.some(r => r.rel === "references"));
  assert.equal(details.relations.some(r => r.rel === "hasGeometry"), false);
});

test("asset things project as first-class canvas nodes with metadata and context", () => {
  const world = seededWorld();
  world.emit({
    process: "defineContext",
    actor: "aaron",
    claims: [
      thing("context:files"),
      relation("aaron", "owns", "context:files"),
      relation("context:files", "hasModuleKind", "context"),
      relation("context:files", "contextActor", "aaron")
    ],
    body: { id: "context:files", label: "Files", actor: "aaron", parent: null, owner: "aaron", stewards: [] }
  });
  const perspective = createPerspective(world, { actor: "aaron", title: "Files View", context: "context:files" }).body.id;
  world.emit({
    process: "asset.upload",
    actor: "aaron",
    claims: [
      thing("asset:brief"),
      relation("aaron", "owns", "asset:brief"),
      relation("asset:brief", "hasModuleKind", "asset"),
      relation("asset:brief", "hasTitle", "brief.pdf"),
      relation("asset:brief", "inContext", "context:files")
    ],
    body: {
      id: "asset:brief",
      originalName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storageKey: "asset:brief/blob",
      visibility: "private",
      context: "context:files",
      contentUrl: "/api/assets/asset%3Abrief/content"
    }
  });
  world.emit({
    process: "asset.ingest.enqueue",
    actor: "aaron",
    claims: [],
    body: {
      id: "asset:brief",
      serverRunner: "server.main",
      jobId: "job:asset-brief"
    }
  });
  world.emit({
    process: "jobs.queue.enqueue",
    actor: "aaron",
    claims: [
      thing("job:asset-brief"),
      relation("job:asset-brief", "hasModuleKind", "job"),
      relation("aaron", "owns", "job:asset-brief"),
      relation("job:asset-brief", "hasTitle", "asset.ingest.process")
    ],
    body: {
      id: "job:asset-brief",
      serverRunner: "server.main",
      actor: "aaron",
      handler: "asset.ingest.process",
      payload: { assetId: "asset:brief" },
      createdAt: "2026-01-01T00:00:00.000Z",
      availableAt: "2026-01-01T00:00:00.000Z",
      maxAttempts: 3,
      retryDelayMs: 50
    }
  });
  world.emit({
    process: "jobs.queue.succeeded",
    actor: "aaron",
    claims: [],
    body: {
      id: "job:asset-brief",
      serverRunner: "server.main",
      actor: "aaron",
      handler: "asset.ingest.process",
      attempt: 1,
      completedAt: "2026-01-01T00:00:01.000Z"
    }
  });
  world.emit({
    process: "asset.ingest.succeeded",
    actor: "aaron",
    claims: [],
    body: {
      id: "asset:brief",
      jobId: "job:asset-brief",
      attempt: 1,
      textStatus: "extracted",
      textBytes: 1024,
      textRef: "asset:brief/derived/text.txt",
      derivedMetadata: {
        kind: "pdf",
        pageCount: 1,
        lineCount: 1,
        wordCount: 2,
        charCount: 11
      },
      thumbnailStatus: "ready",
      thumbnailRef: "asset:brief/derived/thumbnail.svg",
      thumbnailUrl: "/api/assets/asset%3Abrief/thumbnail",
      imageWidth: 640,
      imageHeight: 480,
      searchStatus: "not-built",
      completedAt: "2026-01-01T00:00:01.000Z"
    }
  });
  placeThing(world, { actor: "aaron", perspective, thing: "asset:brief", x: 12, y: 34 });

  const canvas = canvasProjection(world.allWitnesses(), perspective);
  assert.equal(canvas.perspective.context, "context:files");
  assert.equal(canvas.instances[0].kind, "asset");
  assert.equal(canvas.instances[0].asset.mimeType, "application/pdf");
  assert.equal(canvas.instances[0].asset.context, "context:files");
  assert.equal(canvas.instances[0].asset.contextTitle, "Files");
  assert.equal(canvas.instances[0].asset.processingStatus, "succeeded");
  assert.equal(canvas.instances[0].asset.textStatus, "extracted");
  assert.equal(canvas.instances[0].asset.textUrl, "/api/assets/asset%3Abrief/text");
  assert.equal(canvas.instances[0].asset.derivedMetadata.pageCount, 1);
  assert.equal(canvas.instances[0].asset.derivedMetadata.kind, "pdf");
  assert.equal(canvas.instances[0].asset.thumbnailUrl, "/api/assets/asset%3Abrief/thumbnail");
  assert.equal(canvas.instances[0].asset.imageWidth, 640);
  assert.equal(canvas.instances[0].asset.imageHeight, 480);
  assert.equal(canvas.availableThings.find(row => row.id === "asset:brief").kind, "asset");

  const details = thingDetails(world.allWitnesses(), "asset:brief");
  assert.equal(details.kind, "asset");
  assert.equal(details.context, "context:files");
  assert.equal(details.asset.contextTitle, "Files");
  assert.equal(details.asset.storageKey, "asset:brief/blob");
  assert.equal(details.asset.textRef, "asset:brief/derived/text.txt");
  assert.equal(details.asset.textUrl, "/api/assets/asset%3Abrief/text");
  assert.equal(details.asset.derivedMetadata.pageCount, 1);
  assert.equal(details.asset.thumbnailRef, "asset:brief/derived/thumbnail.svg");
});

test("asset attachments project on both the target thing and the asset", () => {
  const world = seededWorld();
  world.emit({
    process: "asset.upload",
    actor: "aaron",
    claims: [
      thing("asset:brief"),
      relation("aaron", "owns", "asset:brief"),
      relation("asset:brief", "hasModuleKind", "asset"),
      relation("asset:brief", "hasTitle", "brief.pdf")
    ],
    body: {
      id: "asset:brief",
      originalName: "brief.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      storageKey: "asset:brief/blob",
      visibility: "private",
      context: null,
      contentUrl: "/api/assets/asset%3Abrief/content"
    }
  });
  attachAsset(world, { actor: "aaron", asset: "asset:brief", target: "proposal" });

  const details = thingDetails(world.allWitnesses(), "proposal");
  assert.equal(details.attachedAssets.length, 1);
  assert.equal(details.attachedAssets[0].id, "asset:brief");

  const assetDetails = thingDetails(world.allWitnesses(), "asset:brief");
  assert.deepEqual(assetDetails.attachedTo, ["proposal"]);
  assert.deepEqual(assetDetails.attachedToRows, [{
    id: "proposal",
    title: "proposal",
    kind: null,
    context: null,
    contextTitle: null
  }]);
  assert.equal(assetDetails.asset.attachedToRows[0].title, "proposal");
  assert.equal(assetDetails.asset.attachmentCount, 1);
});

test("asset repair affordances project for retryable ingest and manual search refresh states", () => {
  const world = seededWorld();
  world.emit({
    process: "asset.upload",
    actor: "aaron",
    claims: [
      thing("asset:repairable"),
      relation("aaron", "owns", "asset:repairable"),
      relation("asset:repairable", "hasModuleKind", "asset"),
      relation("asset:repairable", "hasTitle", "repairable.txt")
    ],
    body: {
      id: "asset:repairable",
      originalName: "repairable.txt",
      mimeType: "text/plain",
      sizeBytes: 64,
      storageKey: "asset:repairable/blob",
      visibility: "private",
      context: "context:files",
      contentUrl: "/api/assets/asset%3Arepairable/content"
    }
  });
  world.emit({
    process: "asset.ingest.enqueue.failed",
    actor: "aaron",
    claims: [],
    body: {
      id: "asset:repairable",
      reason: "queue unavailable"
    }
  });
  world.emit({
    process: "asset.search.reindex.failed",
    actor: "aaron",
    claims: [],
    body: {
      id: "asset:repairable",
      reason: "search index not built"
    }
  });
  world.emit({
    process: "asset.upload",
    actor: "aaron",
    claims: [
      thing("asset:manual"),
      relation("aaron", "owns", "asset:manual"),
      relation("asset:manual", "hasModuleKind", "asset"),
      relation("asset:manual", "hasTitle", "manual.txt")
    ],
    body: {
      id: "asset:manual",
      originalName: "manual.txt",
      mimeType: "text/plain",
      sizeBytes: 32,
      storageKey: "asset:manual/blob",
      visibility: "private",
      context: "context:files",
      contentUrl: "/api/assets/asset%3Amanual/content"
    }
  });
  world.emit({
    process: "asset.ingest.succeeded",
    actor: "aaron",
    claims: [],
    body: {
      id: "asset:manual",
      textStatus: "extracted",
      textRef: "asset:manual/derived/text.txt",
      textExtractor: "text",
      searchStatus: "manual",
      searchPolicy: "manual",
      completedAt: "2026-01-01T00:00:00.000Z"
    }
  });

  const details = thingDetails(world.allWitnesses(), "asset:repairable");
  assert.equal(details.asset.canRetryIngest, true);
  assert.equal(details.asset.ingestRetryUrl, "/api/assets/asset%3Arepairable/ingest/retry");
  assert.equal(details.asset.canRefreshSearch, true);
  assert.equal(details.asset.searchReindexUrl, "/api/assets/asset%3Arepairable/search/reindex");
  const manualDetails = thingDetails(world.allWitnesses(), "asset:manual");
  assert.equal(manualDetails.asset.canRetryIngest, false);
  assert.equal(manualDetails.asset.canRefreshSearch, true);
  assert.equal(manualDetails.asset.searchReindexUrl, "/api/assets/asset%3Amanual/search/reindex");

  const perspective = createPerspective(world, { actor: "aaron", title: "Repair View" }).body.id;
  placeThing(world, { actor: "aaron", perspective, thing: "asset:repairable", x: 32, y: 48 });
  placeThing(world, { actor: "aaron", perspective, thing: "asset:manual", x: 96, y: 48 });
  const assetRow = canvasProjection(world.allWitnesses(), perspective).availableThings.find(row => row.id === "asset:repairable");
  assert(assetRow);
  assert.equal(assetRow.asset.canRetryIngest, true);
  assert.equal(assetRow.asset.canRefreshSearch, true);
  const manualRow = canvasProjection(world.allWitnesses(), perspective).availableThings.find(row => row.id === "asset:manual");
  assert(manualRow);
  assert.equal(manualRow.asset.canRefreshSearch, true);
});
