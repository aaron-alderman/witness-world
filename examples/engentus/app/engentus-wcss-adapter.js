import { loadEngentusGeneratedCssBundle } from "./engentus-style-application.js";

export async function buildEngentusGeneratedStylesheets(_context = {}) {
  const bundle = await loadEngentusGeneratedCssBundle();
  return {
    files: {
      shell: bundle.files["engentus-shell.css"],
      chart: bundle.files["engentus-chart-pages.css"]
    }
  };
}
