export async function bootstrapSurfacePage() {
  const marker = document.querySelector("#view-mill");
  if (!marker || marker.dataset.presenterBootstrapped === "true") return;
  marker.dataset.presenterBootstrapped = "true";
  await import("./reference/mill_main.js");
}
