export const MCP_AUTHORING_RUNTIME_BUILTIN_SEEDS = Object.freeze({
  valueTypes: Object.freeze([
    { id: "mcpServer.id", label: "MCP Server Id", compatibleWith: ["textual"], editor: { control: "text" } },
    { id: "mcpServer.label", label: "MCP Server Label", compatibleWith: ["textual"], editor: { control: "text" } },
    { id: "mcpServer.transport", label: "MCP Transport", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["stdio", "http"] } },
    { id: "mcpServer.tool", label: "MCP Tool Name", compatibleWith: ["textual"], editor: { control: "text" } },
    { id: "mcpServer.actingMode", label: "MCP Tool Acting Mode", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["delegated", "service"] } },
    { id: "mcpServer.identity", label: "MCP Service Identity", compatibleWith: ["textual"], editor: { control: "text" } }
  ]),
  processSpecs: Object.freeze([
    {
      id: "mcp_server_define_spec",
      process: "mcpServer.define",
      inputs: [
        { name: "id", accepts: "mcpServer.id", required: true },
        { name: "label", accepts: "mcpServer.label", required: false },
        { name: "serverRunner", accepts: "serverRunner.id", required: false },
        { name: "serverRunnerRef", accepts: "context.name", required: false },
        { name: "serviceIdentity", accepts: "mcpServer.identity", required: false },
        { name: "transportsJson", accepts: "json.text", required: false },
        { name: "context", accepts: "context.id", required: false }
      ],
      outputs: [{ name: "id", accepts: "mcpServer.id", required: true }]
    },
    {
      id: "mcp_tool_install_spec",
      process: "mcpTool.install",
      inputs: [
        { name: "server", accepts: "mcpServer.id", required: false },
        { name: "serverRef", accepts: "context.name", required: false },
        { name: "tool", accepts: "mcpServer.tool", required: true },
        { name: "actingMode", accepts: "mcpServer.actingMode", required: false },
        { name: "scopeContextsJson", accepts: "json.text", required: false },
        { name: "scopeTargetsJson", accepts: "json.text", required: false },
        { name: "context", accepts: "context.id", required: false }
      ],
      outputs: [{ name: "server", accepts: "mcpServer.id", required: true }]
    },
    {
      id: "mcp_tool_remove_spec",
      process: "mcpTool.remove",
      inputs: [
        { name: "server", accepts: "mcpServer.id", required: false },
        { name: "serverRef", accepts: "context.name", required: false },
        { name: "tool", accepts: "mcpServer.tool", required: true },
        { name: "context", accepts: "context.id", required: false }
      ],
      outputs: [{ name: "server", accepts: "mcpServer.id", required: true }]
    }
  ])
});
