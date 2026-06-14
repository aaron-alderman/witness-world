import { renderBootstrapGuidanceCard } from "../../src/runtime-guidance-bootstrap-ui.js";

export function buildBootstrapPageMainReplacementContent({
  guidance = null
} = {}) {
  return {
    guidanceCard: guidance ? renderBootstrapGuidanceCard(guidance) : ""
  };
}
