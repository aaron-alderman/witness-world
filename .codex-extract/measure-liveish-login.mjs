import path from "node:path";
import { performance } from "node:perf_hooks";
import { loadAppProject } from "./src/app-project.js";
import { AppSnapshotManager } from "./src/app-snapshot-manager.js";
import { renderSurfacePage } from "./src/runtime-surface-page.js";
import { normalizePathname } from "./src/runtime-surface-shell.js";
import { createSurfaceCapabilityRenderer } from "./plugins/chart-runtime/runtime.js";
const appPath = path.join(process.cwd(), "examples", "engentus", "app.wtoml");
const appProject = await loadAppProject(appPath);
const manager = await AppSnapshotManager.create({ appProject, runtimeProfile: "full", runtimePluginIds: [], devMode: false, logger: { error() {}, warn() {}, info() {}, debug() {} } });
try {
  const world = manager.getActiveSnapshot().world;
  const route = world.allWitnesses().find(w => w.process === "defineRoute" && w.body?.path === "/engentus");
  const rendererProvider = { id: "chart-runtime.surfaceCapabilityRenderer", capability: "chart.render", factory: createSurfaceCapabilityRenderer };
  const t0 = performance.now();
  const html = renderSurfacePage(world, {
    rootSurfaceId: route.body.params.rootSurface,
    requestPathname: normalizePathname("/engentus"),
    route: route.body,
    routeStateDescriptor: route.body.params.routeState,
    browserRuntimeCapabilities: ["chart.render"],
    surfaceCapabilityRenderers: [rendererProvider]
  });
  const dt = performance.now() - t0;
  console.log(JSON.stringify({ renderMs: Number(dt.toFixed(1)), bytes: html.length, hasChartClient: html.includes('chart-client.js') }, null, 2));
} finally { manager.close(); }
