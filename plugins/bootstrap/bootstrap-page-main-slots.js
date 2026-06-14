import {
  buildBootstrapPageMainReplacementContent
} from "./bootstrap-page-main-replacement-content.js";
import {
  buildBootstrapPageMainSeedState
} from "./bootstrap-page-main-seed-state.js";
import {
  loadBootstrapPageSlotDefinitions,
  renderBootstrapPageSlotDefinitions
} from "./bootstrap-page-slot-manifest.js";

const bootstrapPageMainSlotDefinitions = loadBootstrapPageSlotDefinitions({
  manifestFile: "bootstrap-page-main-slots.wtoml"
});

export function buildBootstrapPageMainSlots({
  bootstrapState = null,
  bootstrapModel = null,
  requestUrl = "/_bootstrap",
  guidance = null
} = {}) {
  const initialStateBySource = buildBootstrapPageMainSeedState({
    bootstrapState,
    bootstrapModel,
    requestUrl
  });
  const replacementContentBySource = buildBootstrapPageMainReplacementContent({ guidance });
  return renderBootstrapPageSlotDefinitions(bootstrapPageMainSlotDefinitions, {
    initialStateBySource,
    replacementContentBySource
  });
}
