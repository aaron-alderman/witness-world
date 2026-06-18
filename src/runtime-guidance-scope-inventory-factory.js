import {
  buildGuidanceScopeInventoryRowsFromHelpers,
  guidanceScopeInventoryStatus
} from "./runtime-guidance-scope-inventory.js";

export function renderGuidanceScopeInventoryFactory() {
  return String.raw`
    const SCOPE_KIND_ORDER = Object.freeze({
      world: 0,
      page: 1,
      chapter: 2,
      section: 3,
      widget: 4
    });
    const guidanceScopeInventoryStatus = ${guidanceScopeInventoryStatus.toString()};
    const buildGuidanceScopeInventoryRowsFromHelpers = ${buildGuidanceScopeInventoryRowsFromHelpers.toString()};
  `;
}