import {
  applyEngentusTokenBindingsToCssBundle,
  applyEngentusTokenPatch,
  buildEngentusTokenCatalog,
  createEngentusAppliedWcssFromDocument,
  loadEngentusCanonicalWcss,
  loadEngentusGeneratedCssBundle,
  loadEngentusStyleSwitchManifest
} from "./engentus-style-application.js";

async function buildFilesForDocument(document) {
  const [switchManifest, authoredPlan] = await Promise.all([
    loadEngentusStyleSwitchManifest(),
    Promise.resolve(createEngentusAppliedWcssFromDocument(document))
  ]);
  const bundle = await loadEngentusGeneratedCssBundle({
    authoredPlan,
    switchManifest
  });
  return applyEngentusTokenBindingsToCssBundle(bundle.files, document);
}

export async function loadEngentusWcssAuthoringAdapter(_context = {}) {
  const document = await loadEngentusCanonicalWcss();
  return {
    document,
    tokenCatalog: buildEngentusTokenCatalog(document),
    applyTokenPatch({ ops }) {
      return applyEngentusTokenPatch(document, { ops });
    },
    async buildStylesheets({ document: targetDocument }) {
      const files = await buildFilesForDocument(targetDocument);
      return {
        files: {
          shell: files["engentus-shell.css"],
          chart: files["engentus-chart-pages.css"]
        }
      };
    }
  };
}

export async function buildEngentusGeneratedStylesheets(_context = {}) {
  const adapter = await loadEngentusWcssAuthoringAdapter();
  return adapter.buildStylesheets({ document: adapter.document });
}
