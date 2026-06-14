import { renderEdenPageDocument } from "./eden-page-document.js";
import { renderEdenPageScript } from "./eden-page-script.js";
import { EDEN_PAGE_CSS } from "./eden-page-styles.js";

export function renderEdenPage({ model }) {
  return renderEdenPageDocument({
    title: model?.neighborhood?.title || "Eden Canvas",
    css: EDEN_PAGE_CSS,
    neighborhoodTitle: model?.neighborhood?.title || "First Neighbourhood",
    clientJs: renderEdenPageScript({ model })
  });
}
