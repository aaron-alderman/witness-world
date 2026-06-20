export const OPERATOR_WORKBENCH_IPC_CHANNELS = Object.freeze({
  getSnapshot: "witness:operator-workbench:get-snapshot",
  runCommand: "witness:operator-workbench:run-command",
  dispatchIntent: "witness:operator-workbench:dispatch-intent",
  updateDisplaySettings: "witness:operator-workbench:update-display-settings",
  getAutocomplete: "witness:operator-workbench:get-autocomplete"
});

export function createWitnessOperatorWorkbenchApi({
  invoke
}) {
  return Object.freeze({
    getSnapshot: () => invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getSnapshot),
    runCommand: command => invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.runCommand, { command }),
    dispatchIntent: intent => invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.dispatchIntent, intent),
    updateDisplaySettings: patch => invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.updateDisplaySettings, patch),
    getAutocomplete: line => invoke(OPERATOR_WORKBENCH_IPC_CHANNELS.getAutocomplete, { line })
  });
}
