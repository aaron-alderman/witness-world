import { operatorWorkbenchRvmForms } from "./desire-rvm.js";

function applyOperatorWorkbenchDeclaration() {
  return [];
}

export const desireExtensions = Object.freeze({
  rvmForms: operatorWorkbenchRvmForms,
  runtimeDeclarations: Object.freeze([
    Object.freeze({ kind: "operator_dataset", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_screen", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_screen_section", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_overlay", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_handle", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_surface", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_viewport", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_setup", apply: applyOperatorWorkbenchDeclaration })
  ])
});

export default {
  desireExtensions
};
