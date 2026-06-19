// Hearth plugin — a chore-scoped projection over the witness log.
//
// `hearth.choreList` is the one piece that's honestly JS-not-DESIRE: projection
// LOGIC. The platform invokes it BY NAME from an authored `project.read` step, so
// the authoring stays declarative; only the read model itself is code. It filters
// chore.add witnesses into a clean { chores: [{ id, text }] }. Append-only /
// ever-growing for now — no completion yet, so nothing is filtered out.

export const bundleId = "bundle-hearth";

export function choreListReadModel(witnesses = []) {
  // A chore's identity IS its birth witness: the kernel already minted a unique
  // id for the chore.add witness, so we key on witness.id — nothing to invent.
  // Append-only / ever-growing (log order); actor falls out of the witness too.
  const chores = [];
  for (const witness of witnesses) {
    if (witness?.process === "chore.add") {
      chores.push({ id: witness.id, text: witness.body?.text ?? "", addedBy: witness.actor ?? null });
    }
  }
  return { chores };
}

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([]),
  handlerMetadata: Object.freeze({})
});
export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze([]);
export const providers = Object.freeze([
  {
    kind: "moduleProjectors",
    id: "hearth.projections",
    projectors: { "hearth.choreList": choreListReadModel }
  }
]);

// This bundle contributes only a projector — no route handlers.
export function createHandlers() {
  return {};
}

export default { bundleId, handlerCatalog, routes, surfaces, capabilities, providers, createHandlers };
