export const TUTORIAL_RUNTIME_BUILTIN_SEEDS = Object.freeze({
  valueTypes: Object.freeze([
    { id: "widget.tutorialTarget", label: "Widget Tutorial Target", compatibleWith: ["textual"], editor: { control: "text" } }
  ]),
  processSpecs: Object.freeze([
    {
      id: "tutorial_widget_target_spec",
      process: "widget.define",
      inputs: [
        { name: "id", accepts: "widget.id", required: true },
        { name: "tutorialTarget", accepts: "widget.tutorialTarget", required: true }
      ],
      outputs: [{ name: "id", accepts: "widget.id", required: true }]
    }
  ])
});
