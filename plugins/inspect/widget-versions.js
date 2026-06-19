import {
  requestWidgetVersionActivationShared,
  rollbackWidgetVersionShared
} from "../../src/widget-evolution.js";

export function requestWidgetVersionActivation(world, { actor, soul, version }) {
  return requestWidgetVersionActivationShared(world, { actor, soul, version });
}

export function rollbackWidgetVersion(world, { actor, soul }) {
  return rollbackWidgetVersionShared(world, { actor, soul });
}
