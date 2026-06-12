import { defineTrait, defineValueType, defineProcessSpec } from "./type-model.js";
import { defineCapability } from "./modules.js";

const TRAITS = [
  { id: "textual", label: "Textual" },
  { id: "numeric", label: "Numeric" },
  { id: "boolean", label: "Boolean" },
  { id: "color", label: "Color" },
  { id: "enumerated", label: "Enumerated" }
];

const VALUE_TYPES = [
  { id: "widget.kind", label: "Widget Kind", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["Page", "Box", "Section", "Heading", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"] } },
  { id: "widget.id", label: "Widget Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.parent", label: "Parent Widget", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.order", label: "Widget Order", compatibleWith: ["numeric"], editor: { control: "number" } },
  { id: "widget.text", label: "Widget Text", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.title", label: "Widget Title", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.class", label: "Widget Class", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.hidden", label: "Widget Hidden", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.role", label: "Widget Role", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.href", label: "Widget Href", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.name", label: "Widget Name", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.placeholder", label: "Widget Placeholder", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.autocomplete", label: "Widget Autocomplete", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.type", label: "Widget Type", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.action", label: "Widget Action", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.label", label: "Widget Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.valueType", label: "Widget Value Type", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.dataId", label: "Widget Data Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.dataDone", label: "Widget Data Done", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.tutorialTarget", label: "Widget Tutorial Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.eventSoul", label: "Widget Event Soul", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.eventVersion", label: "Widget Event Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.template", label: "Widget Template", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.attach", label: "Widget Attach", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.level", label: "Widget Level", compatibleWith: ["numeric"], editor: { control: "number" } },
  { id: "identity.id", label: "Identity Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.actor", label: "Identity Actor", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.label", label: "Identity Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.username", label: "Identity Username", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.password", label: "Identity Password", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.context", label: "Identity Home Context", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.perspective", label: "Identity Perspective", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.id", label: "Program Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.event", label: "Program Event", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.op", label: "Program Operation", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["initSession", "setSession", "logout", "setText", "setValue", "fetchJson", "renderCollection", "renderWorldGraph", "readForm", "refreshProjection", "reloadPage", "postJson", "patchJson", "deleteJson", "clearForm", "run"] } },
  { id: "route.id", label: "Route Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.path", label: "Route Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.serves", label: "Route Serves", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.method", label: "Route Method", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["GET", "POST", "PATCH", "DELETE"] } },
  { id: "route.handler", label: "Route Handler", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.id", label: "Server Runner Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.handlerSet", label: "Handler Set", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.host", label: "Host Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.storage", label: "Storage Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.runtimeConfig", label: "Runtime Config JSON", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "mcpServer.id", label: "MCP Server Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "mcpServer.label", label: "MCP Server Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "mcpServer.transport", label: "MCP Transport", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["stdio", "http"] } },
  { id: "mcpServer.tool", label: "MCP Tool Name", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "mcpServer.actingMode", label: "MCP Tool Acting Mode", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["delegated", "service"] } },
  { id: "mcpServer.identity", label: "MCP Service Identity", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "context.id", label: "Context Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "context.label", label: "Context Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "context.name", label: "Context Name", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "perspective.id", label: "Perspective Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "perspective.title", label: "Perspective Title", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.id", label: "Capability Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.label", label: "Capability Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.version", label: "Capability Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.target", label: "Capability Install Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "capability.targetKind", label: "Capability Install Target Kind", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["context", "serverRunner", "routePage"] } },
  { id: "stewardship.actor", label: "Steward Actor", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "stewardship.target", label: "Stewardship Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "stewardship.targetKind", label: "Stewardship Target Kind", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "proposal.id", label: "Proposal Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "proposal.process", label: "Proposal Target Process", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "proposal.kind", label: "Proposal Target Kind", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "authority.id", label: "Authority Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "json.text", label: "JSON Text", compatibleWith: ["textual"], editor: { control: "text" } }
];

const PROCESS_SPECS = [
  {
    id: "widget_define_spec",
    process: "widget.define",
    inputs: [
      { name: "id", accepts: "widget.id", required: false },
      { name: "kind", accepts: "widget.kind", required: true },
      { name: "parent", accepts: "widget.parent", required: false },
      { name: "parentRef", accepts: "context.name", required: false },
      { name: "order", accepts: "widget.order", required: false },
      { name: "text", accepts: "widget.text", required: false },
      { name: "title", accepts: "widget.title", required: false },
      { name: "class", accepts: "widget.class", required: false },
      { name: "role", accepts: "widget.role", required: false },
      { name: "href", accepts: "widget.href", required: false },
      { name: "name", accepts: "widget.name", required: false },
      { name: "placeholder", accepts: "widget.placeholder", required: false },
      { name: "autocomplete", accepts: "widget.autocomplete", required: false },
      { name: "type", accepts: "widget.type", required: false },
      { name: "action", accepts: "widget.action", required: false },
      { name: "label", accepts: "widget.label", required: false },
      { name: "valueType", accepts: "widget.valueType", required: false },
      { name: "dataId", accepts: "widget.dataId", required: false },
      { name: "dataDone", accepts: "widget.dataDone", required: false },
      { name: "tutorialTarget", accepts: "widget.tutorialTarget", required: false },
      { name: "eventSoul", accepts: "widget.eventSoul", required: false },
      { name: "eventVersion", accepts: "widget.eventVersion", required: false },
      { name: "context", accepts: "context.id", required: false },
      { name: "template", accepts: "widget.template", required: false },
      { name: "attach", accepts: "widget.attach", required: false },
      { name: "level", accepts: "widget.level", required: false }
    ],
    outputs: [
      { name: "id", accepts: "widget.id", required: true },
      { name: "kind", accepts: "widget.kind", required: true },
      { name: "parent", accepts: "widget.parent", required: false },
      { name: "order", accepts: "widget.order", required: false },
      { name: "text", accepts: "widget.text", required: false }
    ]
  },
  {
    id: "widget_update_spec",
    process: "widget.update",
    inputs: [
      { name: "id", accepts: "widget.id", required: true },
      { name: "text", accepts: "widget.text", required: false },
      { name: "title", accepts: "widget.title", required: false },
      { name: "class", accepts: "widget.class", required: false },
      { name: "hidden", accepts: "widget.hidden", required: false }
    ],
    outputs: [
      { name: "id", accepts: "widget.id", required: true },
      { name: "text", accepts: "widget.text", required: false },
      { name: "title", accepts: "widget.title", required: false },
      { name: "class", accepts: "widget.class", required: false },
      { name: "hidden", accepts: "widget.hidden", required: false }
    ]
  },
  {
    id: "identity_define_spec",
    process: "identity.define",
    inputs: [
      { name: "id", accepts: "identity.id", required: true },
      { name: "actor", accepts: "identity.actor", required: true },
      { name: "label", accepts: "identity.label", required: true },
      { name: "username", accepts: "identity.username", required: true },
      { name: "password", accepts: "identity.password", required: true },
      { name: "homeContext", accepts: "identity.context", required: false },
      { name: "homePerspective", accepts: "identity.perspective", required: false }
    ],
    outputs: [{ name: "id", accepts: "identity.id", required: true }]
  },
  {
    id: "identity_update_spec",
    process: "identity.update",
    inputs: [
      { name: "id", accepts: "identity.id", required: true },
      { name: "label", accepts: "identity.label", required: false },
      { name: "username", accepts: "identity.username", required: false },
      { name: "password", accepts: "identity.password", required: false },
      { name: "homeContext", accepts: "identity.context", required: false },
      { name: "homePerspective", accepts: "identity.perspective", required: false }
    ],
    outputs: [{ name: "id", accepts: "identity.id", required: true }]
  },
  {
    id: "context_define_spec",
    process: "context.define",
    inputs: [
      { name: "id", accepts: "context.id", required: true },
      { name: "label", accepts: "context.label", required: false },
      { name: "parent", accepts: "context.id", required: false },
      { name: "owner", accepts: "authority.id", required: false },
      { name: "stewardsJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "id", accepts: "context.id", required: true }]
  },
  {
    id: "perspective_define_spec",
    process: "perspective.define",
    inputs: [
      { name: "id", accepts: "perspective.id", required: true },
      { name: "title", accepts: "perspective.title", required: true },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "perspective.id", required: true }]
  },
  {
    id: "stewardship_grant_spec",
    process: "stewardship.grant",
    inputs: [
      { name: "steward", accepts: "stewardship.actor", required: true },
      { name: "target", accepts: "stewardship.target", required: true },
      { name: "targetKind", accepts: "stewardship.targetKind", required: false }
    ],
    outputs: [{ name: "target", accepts: "stewardship.target", required: true }]
  },
  {
    id: "stewardship_revoke_spec",
    process: "stewardship.revoke",
    inputs: [
      { name: "steward", accepts: "stewardship.actor", required: true },
      { name: "target", accepts: "stewardship.target", required: true },
      { name: "targetKind", accepts: "stewardship.targetKind", required: false }
    ],
    outputs: [{ name: "target", accepts: "stewardship.target", required: true }]
  },
  {
    id: "proposal_create_spec",
    process: "proposal.create",
    inputs: [
      { name: "id", accepts: "proposal.id", required: true },
      { name: "targetProcess", accepts: "proposal.process", required: true },
      { name: "targetKind", accepts: "proposal.kind", required: true },
      { name: "targetId", accepts: "stewardship.target", required: false },
      { name: "bodyJson", accepts: "json.text", required: true },
      { name: "reason", accepts: "widget.text", required: false }
    ],
    outputs: [{ name: "id", accepts: "proposal.id", required: true }]
  },
  {
    id: "proposal_approve_spec",
    process: "proposal.approve",
    inputs: [
      { name: "id", accepts: "proposal.id", required: true }
    ],
    outputs: [{ name: "id", accepts: "proposal.id", required: true }]
  },
  {
    id: "proposal_reject_spec",
    process: "proposal.reject",
    inputs: [
      { name: "id", accepts: "proposal.id", required: true },
      { name: "reason", accepts: "widget.text", required: false }
    ],
    outputs: [{ name: "id", accepts: "proposal.id", required: true }]
  },
  {
    id: "frontend_program_define_spec",
    process: "frontendProgram.define",
    inputs: [
      { name: "id", accepts: "program.id", required: true },
      { name: "rootWidget", accepts: "widget.id", required: false },
      { name: "rootWidgetRef", accepts: "context.name", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "program.id", required: true }]
  },
  {
    id: "frontend_step_define_spec",
    process: "frontendStep.define",
    inputs: [
      { name: "program", accepts: "program.id", required: true },
      { name: "event", accepts: "program.event", required: true },
      { name: "op", accepts: "program.op", required: true },
      { name: "order", accepts: "widget.order", required: false },
      { name: "paramsJson", accepts: "json.text", required: false },
      { name: "whenJson", accepts: "json.text", required: false },
      { name: "repeatJson", accepts: "json.text", required: false },
      { name: "afterJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "program", accepts: "program.id", required: true }]
  },
  {
    id: "route_define_spec",
    process: "route.define",
    inputs: [
      { name: "id", accepts: "route.id", required: true },
      { name: "path", accepts: "route.path", required: true },
      { name: "serves", accepts: "route.serves", required: false },
      { name: "servesRef", accepts: "context.name", required: false },
      { name: "method", accepts: "route.method", required: true },
      { name: "handler", accepts: "route.handler", required: true },
      { name: "rootWidgetRef", accepts: "context.name", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "route.id", required: true }]
  },
  {
    id: "serve_define_spec",
    process: "serve.define",
    inputs: [
      { name: "serverRunner", accepts: "serverRunner.id", required: false },
      { name: "serverRunnerRef", accepts: "context.name", required: false },
      { name: "route", accepts: "route.id", required: false },
      { name: "routeRef", accepts: "context.name", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "route", accepts: "route.id", required: true }]
  },
  {
    id: "server_runner_define_spec",
    process: "serverRunner.define",
    inputs: [
      { name: "id", accepts: "serverRunner.id", required: true },
      { name: "backendHost", accepts: "serverRunner.host", required: false },
      { name: "backendHostRef", accepts: "context.name", required: false },
      { name: "frontendHost", accepts: "serverRunner.host", required: false },
      { name: "frontendHostRef", accepts: "context.name", required: false },
      { name: "handlerSet", accepts: "serverRunner.handlerSet", required: false },
      { name: "todoProjection", accepts: "serverRunner.storage", required: false },
      { name: "privateNotesProjection", accepts: "serverRunner.storage", required: false },
      { name: "runtimeConfigJson", accepts: "json.text", required: false },
      { name: "allowActorHeader", accepts: "widget.attach", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "serverRunner.id", required: true }]
  },
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
      { name: "server", accepts: "mcpServer.id", required: true },
      { name: "tool", accepts: "mcpServer.tool", required: true },
      { name: "actingMode", accepts: "mcpServer.actingMode", required: false },
      { name: "scopeContextsJson", accepts: "json.text", required: false },
      { name: "scopeTargetsJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "server", accepts: "mcpServer.id", required: true }]
  },
  {
    id: "mcp_tool_remove_spec",
    process: "mcpTool.remove",
    inputs: [
      { name: "server", accepts: "mcpServer.id", required: true },
      { name: "tool", accepts: "mcpServer.tool", required: true }
    ],
    outputs: [{ name: "server", accepts: "mcpServer.id", required: true }]
  },
  {
    id: "context_bind_spec",
    process: "context.bind",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "name", accepts: "context.name", required: true },
      { name: "target", accepts: "authority.id", required: true }
    ],
    outputs: [{ name: "target", accepts: "authority.id", required: true }]
  },
  {
    id: "context_unbind_spec",
    process: "context.unbind",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "name", accepts: "context.name", required: true },
      { name: "target", accepts: "authority.id", required: true }
    ],
    outputs: [{ name: "target", accepts: "authority.id", required: true }]
  },
  {
    id: "context_export_spec",
    process: "context.export",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "name", accepts: "context.name", required: true },
      { name: "target", accepts: "authority.id", required: true }
    ],
    outputs: [{ name: "target", accepts: "authority.id", required: true }]
  },
  {
    id: "context_unexport_spec",
    process: "context.unexport",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "name", accepts: "context.name", required: true },
      { name: "target", accepts: "authority.id", required: true }
    ],
    outputs: [{ name: "target", accepts: "authority.id", required: true }]
  },
  {
    id: "context_import_spec",
    process: "context.import",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "sourceContext", accepts: "context.id", required: true },
      { name: "exportName", accepts: "context.name", required: true },
      { name: "name", accepts: "context.name", required: false }
    ],
    outputs: [{ name: "context", accepts: "context.id", required: true }]
  },
  {
    id: "context_unimport_spec",
    process: "context.unimport",
    inputs: [
      { name: "context", accepts: "context.id", required: true },
      { name: "sourceContext", accepts: "context.id", required: true },
      { name: "exportName", accepts: "context.name", required: true },
      { name: "name", accepts: "context.name", required: false }
    ],
    outputs: [{ name: "context", accepts: "context.id", required: true }]
  },
  {
    id: "capability_define_spec",
    process: "capability.define",
    inputs: [
      { name: "id", accepts: "capability.id", required: true },
      { name: "label", accepts: "capability.label", required: true },
      { name: "version", accepts: "capability.version", required: false },
      { name: "provenanceJson", accepts: "json.text", required: false },
      { name: "dependsOnJson", accepts: "json.text", required: false },
      { name: "publicApiJson", accepts: "json.text", required: false },
      { name: "configJson", accepts: "json.text", required: false },
      { name: "internalsJson", accepts: "json.text", required: false },
      { name: "authorityJson", accepts: "json.text", required: false },
      { name: "placementJson", accepts: "json.text", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "capability.id", required: true }]
  },
  {
    id: "capability_install_spec",
    process: "capability.install",
    inputs: [
      { name: "capability", accepts: "capability.id", required: true },
      { name: "target", accepts: "capability.target", required: true },
      { name: "targetKind", accepts: "capability.targetKind", required: true }
    ],
    outputs: [{ name: "capability", accepts: "capability.id", required: true }]
  },
  {
    id: "capability_remove_spec",
    process: "capability.remove",
    inputs: [
      { name: "capability", accepts: "capability.id", required: true },
      { name: "target", accepts: "capability.target", required: true },
      { name: "targetKind", accepts: "capability.targetKind", required: true }
    ],
    outputs: [{ name: "capability", accepts: "capability.id", required: true }]
  }
];

const BUILTIN_CAPABILITIES = [
  {
    id: "http.serve",
    label: "HTTP Serve",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "network.listen", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "runtime.config",
    label: "Runtime Config",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    providerAdapters: [
      { id: "inline", label: "Inline Config", kind: "local", status: "shipped", default: true },
      { id: "env-secret-ref", label: "Environment Secret Ref", kind: "environment", status: "shipped", requires: ["secret.access"] }
    ],
    witnessContract: {
      read: ["runtimeConfig.read", "runtimeConfig.read.failed"],
      failure: ["server.start.failed"],
      externalRefs: ["secretRef"]
    },
    authority: [{ name: "secret.access", accepts: "authority.id", required: true }],
    placement: ["serverRunner"]
  },
  {
    id: "fs.json.read",
    label: "JSON File Read",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "filesystem.read", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "fs.json.write",
    label: "JSON File Write",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "filesystem.write", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner"]
  },
  {
    id: "fs.blob",
    label: "Blob File Storage",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    providerAdapters: [
      { id: "local-disk", label: "Local Disk", kind: "local", status: "shipped", default: true, requires: ["filesystem.read", "filesystem.write"] },
      { id: "hosted-object-store", label: "Hosted Object Store", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        read: ["fs.blob.list", "fs.blob.meta", "fs.blob.read", "fs.blob.list.failed", "fs.blob.meta.failed", "fs.blob.read.failed"],
        success: ["fs.blob.write", "fs.blob.delete"],
        failure: ["fs.blob.write.failed", "fs.blob.delete.failed"]
      },
      externalRefs: ["storageKey", "blobRef", "contentUrl"]
    },
    authority: [
      { name: "filesystem.read", accepts: "authority.id", required: true },
      { name: "filesystem.write", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "fs.stream",
    label: "Stream File Storage",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    providerAdapters: [
      { id: "local-disk", label: "Local Disk", kind: "local", status: "shipped", default: true, requires: ["filesystem.read", "filesystem.write"] },
      { id: "hosted-object-store", label: "Hosted Object Store", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        read: ["fs.stream.read", "fs.stream.read.failed"],
        success: ["fs.stream.write", "fs.stream.copy"],
        failure: ["fs.stream.write.failed", "fs.stream.copy.failed"]
      }
    },
    authority: [
      { name: "filesystem.read", accepts: "authority.id", required: true },
      { name: "filesystem.write", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "upload.asset",
    label: "Asset Upload",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["fs.blob", "fs.stream"],
    providerAdapters: [
      { id: "local-disk", label: "Local Disk", kind: "local", status: "shipped", default: true, requires: ["filesystem.write"] },
      { id: "hosted-object-store", label: "Hosted Object Store", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        read: ["asset.content.read", "asset.content.read.failed", "asset.thumbnail.read", "asset.thumbnail.read.failed", "asset.attachments.read", "asset.attachments.read.failed"],
        attempt: ["asset.ingest.enqueue", "asset.ingest.retry", "asset.ingest.start"],
        success: ["asset.upload", "asset.ingest.succeeded", "asset.attach", "asset.detach"],
        failure: ["asset.upload.failed", "asset.ingest.enqueue.failed", "asset.ingest.retry.failed", "asset.ingest.failed", "asset.attach.failed", "asset.detach.failed"]
      },
      externalRefs: ["storageKey", "contentUrl", "textRef", "thumbnailRef", "thumbnailUrl"]
    },
    authority: [
      { name: "filesystem.write", accepts: "authority.id", required: true },
      { name: "network.listen", accepts: "authority.id", required: true }
    ],
    placement: ["serverRunner"]
  },
  {
    id: "jobs.queue",
    label: "Jobs Queue",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    providerAdapters: [
      { id: "in-process", label: "In-Process Worker", kind: "local", status: "shipped", default: true },
      { id: "external-queue", label: "External Queue", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        intent: ["jobs.queue.enqueue", "jobs.queue.enqueue.failed"],
        attempt: ["jobs.queue.start"],
        retry: ["jobs.queue.retry"],
        success: ["jobs.queue.succeeded"],
        failure: ["jobs.queue.deadLetter"]
      },
      externalRefs: ["idempotencyKey"]
    },
    authority: [{ name: "runtime.schedule", accepts: "authority.id", required: true }],
    placement: ["serverRunner"]
  },
  {
    id: "db.sql",
    label: "SQL Database",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["runtime.config"],
    providerAdapters: [
      { id: "sqlite", label: "SQLite", kind: "local", status: "shipped", default: true, requires: ["filesystem.read", "filesystem.write"] },
      { id: "postgres", label: "Postgres", kind: "hosted", status: "contract", requires: ["network.fetch", "secret.access"] },
      { id: "mysql", label: "MySQL", kind: "hosted", status: "contract", requires: ["network.fetch", "secret.access"] }
    ],
    witnessContract: {
      processes: {
        read: ["db.sql.inspect", "db.sql.inspect.failed"],
        attempt: ["db.sql.datasource.resolve", "db.sql.migrate", "db.sql.query", "db.sql.command", "db.sql.transaction"],
        success: ["db.sql.datasource.resolve", "db.sql.migrate", "db.sql.query", "db.sql.command", "db.sql.transaction"],
        failure: ["db.sql.datasource.resolve.failed", "db.sql.migrate.failed", "db.sql.query.failed", "db.sql.command.failed", "db.sql.transaction.failed"]
      },
      externalRefs: ["datasource", "provider"]
    },
    authority: [
      { name: "secret.access", accepts: "authority.id", required: true },
      { name: "filesystem.read", accepts: "authority.id", required: false },
      { name: "filesystem.write", accepts: "authority.id", required: false },
      { name: "network.fetch", accepts: "authority.id", required: false }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "auth.oauth",
    label: "OAuth Authentication",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["runtime.config"],
    providerAdapters: [
      { id: "stub", label: "Stub Provider", kind: "stub", status: "shipped", default: true },
      { id: "oauth-provider", label: "Hosted OAuth Provider", kind: "hosted", status: "contract", requires: ["network.fetch", "secret.access"] }
    ],
    witnessContract: {
      processes: {
        intent: ["auth.oauth.start", "auth.oauth.start.failed"],
        attempt: ["auth.oauth.callback", "auth.oauth.callback.failed"],
        success: ["auth.oauth.link", "auth.oauth.session"],
        failure: ["auth.oauth.link.failed", "auth.oauth.session.failed"]
      },
      externalRefs: ["providerAccountId", "state"]
    },
    authority: [
      { name: "secret.access", accepts: "authority.id", required: true },
      { name: "network.fetch", accepts: "authority.id", required: true }
    ],
    placement: ["serverRunner"]
  },
  {
    id: "search.index",
    label: "Search Index",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    providerAdapters: [
      { id: "local-text", label: "Local Text Index", kind: "local", status: "shipped", default: true, requires: ["filesystem.read", "filesystem.write"] },
      { id: "hosted-search", label: "Hosted Search", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        read: ["search.index.inspect", "search.index.inspect.failed", "search.index.query", "search.index.query.failed"],
        attempt: ["search.index.build", "search.index.reindex", "asset.search.reindex"],
        success: ["search.index.build", "search.index.reindex", "asset.search.reindex"],
        failure: ["search.index.build.failed", "search.index.reindex.failed", "asset.search.reindex.failed"]
      }
    },
    authority: [
      { name: "filesystem.read", accepts: "authority.id", required: true },
      { name: "filesystem.write", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "http.outbound",
    label: "HTTP Outbound",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["runtime.config"],
    providerAdapters: [
      { id: "native-fetch", label: "Native Fetch", kind: "network", status: "shipped", default: true, requires: ["network.fetch"] },
      { id: "stub", label: "Stub Transport", kind: "stub", status: "shipped" }
    ],
    witnessContract: {
      processes: {
        intent: ["http.outbound.request", "http.outbound.request.failed"],
        attempt: ["http.outbound.attempt"],
        retry: ["http.outbound.retry"],
        success: ["http.outbound.succeeded"],
        failure: ["http.outbound.failed"]
      },
      externalRefs: ["externalRefId", "correlationId"]
    },
    authority: [
      { name: "network.fetch", accepts: "authority.id", required: true },
      { name: "secret.access", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "webhook.inbound",
    label: "Webhook Inbound",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["runtime.config", "jobs.queue"],
    providerAdapters: [
      { id: "hmac-shared-secret", label: "HMAC Shared Secret", kind: "local", status: "shipped", default: true, requires: ["network.listen", "secret.access"] },
      { id: "provider-signature-scheme", label: "Provider Signature Scheme", kind: "hosted", status: "contract" }
    ],
    witnessContract: {
      processes: {
        intent: ["webhook.inbound.receive", "webhook.inbound.receive.failed"],
        attempt: ["webhook.inbound.accepted"],
        success: ["webhook.inbound.processed"],
        failure: ["webhook.inbound.verify.failed", "webhook.inbound.replay.failed", "webhook.inbound.accept.failed", "webhook.inbound.process.failed"]
      },
      externalRefs: ["deliveryId", "correlationId"]
    },
    authority: [
      { name: "network.listen", accepts: "authority.id", required: true },
      { name: "secret.access", accepts: "authority.id", required: true }
    ],
    placement: ["serverRunner"]
  },
  {
    id: "notify.email",
    label: "Email Notifications",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["jobs.queue", "runtime.config"],
    providerAdapters: [
      { id: "stub", label: "Stub Email", kind: "stub", status: "shipped", default: true },
      { id: "hosted-email-provider", label: "Hosted Email Provider", kind: "hosted", status: "contract", requires: ["network.fetch", "secret.access"] }
    ],
    witnessContract: {
      processes: {
        intent: ["notify.email.enqueue", "notify.email.enqueue.failed"],
        retry: ["jobs.queue.retry"],
        success: ["notify.email.send"],
        failure: ["notify.email.render.failed", "jobs.queue.deadLetter"]
      },
      externalRefs: ["providerMessageId"]
    },
    authority: [
      { name: "secret.access", accepts: "authority.id", required: true },
      { name: "network.fetch", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "notify.sms",
    label: "SMS Notifications",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    dependsOn: ["jobs.queue", "runtime.config"],
    providerAdapters: [
      { id: "stub", label: "Stub SMS", kind: "stub", status: "shipped", default: true },
      { id: "hosted-sms-provider", label: "Hosted SMS Provider", kind: "hosted", status: "contract", requires: ["network.fetch", "secret.access"] }
    ],
    witnessContract: {
      processes: {
        intent: ["notify.sms.enqueue", "notify.sms.enqueue.failed"],
        retry: ["jobs.queue.retry"],
        success: ["notify.sms.send"],
        failure: ["notify.sms.render.failed", "jobs.queue.deadLetter"]
      },
      externalRefs: ["providerMessageId"]
    },
    authority: [
      { name: "secret.access", accepts: "authority.id", required: true },
      { name: "network.fetch", accepts: "authority.id", required: true }
    ],
    placement: ["context", "serverRunner"]
  },
  {
    id: "dom.render",
    label: "DOM Render",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "browser.dom", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner", "routePage"]
  },
  {
    id: "http.fetch",
    label: "HTTP Fetch",
    version: "builtin",
    provenance: { source: "runtime", builtin: true },
    authority: [{ name: "network.fetch", accepts: "authority.id", required: true }],
    placement: ["context", "serverRunner", "routePage"]
  }
];

export function ensureRuntimeBuiltins(world, { actor = "system" } = {}) {
  const witnesses = world.allWitnesses();
  const definedTraits = new Set(
    witnesses.filter(w => w.process === "defineTrait" && w.body?.id).map(w => w.body.id)
  );
  const definedValueTypes = new Set(
    witnesses.filter(w => w.process === "defineValueType" && w.body?.id).map(w => w.body.id)
  );
  const definedProcessSpecs = new Set(
    witnesses.filter(w => w.process === "defineProcessSpec" && w.body?.id).map(w => w.body.id)
  );
  const definedCapabilities = new Set(
    witnesses.filter(w => w.process === "defineCapability" && w.body?.id).map(w => w.body.id)
  );

  for (const trait of TRAITS) {
    if (definedTraits.has(trait.id)) continue;
    defineTrait(world, { actor, id: trait.id, label: trait.label, owner: actor });
  }
  for (const valueType of VALUE_TYPES) {
    if (definedValueTypes.has(valueType.id)) continue;
    defineValueType(world, { actor, id: valueType.id, label: valueType.label, compatibleWith: valueType.compatibleWith, editor: valueType.editor, owner: actor });
  }
  for (const spec of PROCESS_SPECS) {
    if (definedProcessSpecs.has(spec.id)) continue;
    defineProcessSpec(world, { actor, id: spec.id, process: spec.process, inputs: spec.inputs, outputs: spec.outputs, owner: actor });
  }
  for (const capability of BUILTIN_CAPABILITIES) {
    if (definedCapabilities.has(capability.id)) continue;
    defineCapability(world, { actor, ...capability, owner: actor });
  }
}
