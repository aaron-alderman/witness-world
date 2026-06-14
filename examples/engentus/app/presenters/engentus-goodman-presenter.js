export async function bootstrapSurfacePage() {
  const marker = document.querySelector("#view-goodman");
  if (!marker || marker.dataset.presenterBootstrapped === "true") return;
  marker.dataset.presenterBootstrapped = "true";
  await import("./reference/main.js");
}
