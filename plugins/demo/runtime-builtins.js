export const DEMO_RUNTIME_BUILTIN_SEEDS = Object.freeze({
  valueTypes: Object.freeze([
    { id: "todo.id", label: "Todo Id", compatibleWith: ["textual"], editor: { control: "text" } },
    { id: "todo.title", label: "Todo Title", compatibleWith: ["textual"], editor: { control: "text" } },
    { id: "todo.done", label: "Todo Done", compatibleWith: ["boolean"], editor: { control: "checkbox" } }
  ]),
  processSpecs: Object.freeze([
    {
      id: "todo_create_spec",
      process: "todo.create",
      inputs: [
        { name: "id", accepts: "todo.id", required: false },
        { name: "title", accepts: "todo.title", required: true },
        { name: "done", accepts: "todo.done", required: false }
      ],
      outputs: [
        { name: "id", accepts: "todo.id", required: true },
        { name: "title", accepts: "todo.title", required: true },
        { name: "done", accepts: "todo.done", required: true }
      ]
    },
    {
      id: "todo_update_spec",
      process: "todo.update",
      inputs: [
        { name: "id", accepts: "todo.id", required: true },
        { name: "title", accepts: "todo.title", required: false },
        { name: "done", accepts: "todo.done", required: false }
      ],
      outputs: [
        { name: "id", accepts: "todo.id", required: true },
        { name: "title", accepts: "todo.title", required: true },
        { name: "done", accepts: "todo.done", required: true }
      ]
    },
    {
      id: "todo_delete_spec",
      process: "todo.delete",
      inputs: [
        { name: "id", accepts: "todo.id", required: true }
      ],
      outputs: [
        { name: "id", accepts: "todo.id", required: true }
      ]
    }
  ])
});
