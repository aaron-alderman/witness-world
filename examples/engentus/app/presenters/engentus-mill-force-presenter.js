export async function bootstrapSurfacePage() {
  const marker = document.querySelector("#view-mill-force");
  if (!marker || marker.dataset.presenterBootstrapped === "true") return;
  marker.dataset.presenterBootstrapped = "true";
  await import("./reference/mill_force_main.js");
}
