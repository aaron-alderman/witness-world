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
  { id: "widget.kind", label: "Widget Kind", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["Fragment", "Page", "Box", "Section", "Header", "Heading", "Paragraph", "Small", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"] } },
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
  { id: "widget.eventSoul", label: "Widget Event Soul", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.eventVersion", label: "Widget Event Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "widget.template", label: "Widget Template", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.attach", label: "Widget Attach", compatibleWith: ["boolean"], editor: { control: "checkbox" } },
  { id: "widget.level", label: "Widget Level", compatibleWith: ["numeric"], editor: { control: "number" } },
  { id: "widget.guidanceTarget", label: "Widget Guidance Target", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.id", label: "Identity Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.actor", label: "Identity Actor", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.label", label: "Identity Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.username", label: "Identity Username", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.password", label: "Identity Password", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.context", label: "Identity Home Context", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "identity.perspective", label: "Identity Perspective", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.id", label: "Program Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.event", label: "Program Event", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "program.op", label: "Program Operation", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["initSession", "setSession", "logout", "setText", "setValue", "fetchJson", "renderCollection", "renderWorldGraph", "readForm", "refreshProjection", "navigate", "setQueryParam", "dispatchDomEvent", "reloadPage", "postJson", "patchJson", "deleteJson", "clearForm", "run"] } },
  { id: "backendProgram.soul", label: "Backend Program Soul", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "backendProgram.version", label: "Backend Program Version", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "backendProgram.label", label: "Backend Program Label", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "backendProgram.transitionStrategy", label: "Backend Program Transition Strategy", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["compatible", "migrate", "block", "fork"] } },
  { id: "backendProgram.op", label: "Backend Program Operation", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["request.readJson", "state.assign", "handler.invoke", "response.json", "response.error", "run"] } },
  { id: "route.id", label: "Route Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.path", label: "Route Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.serves", label: "Route Serves", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.method", label: "Route Method", compatibleWith: ["textual", "enumerated"], editor: { control: "select", options: ["GET", "POST", "PATCH", "DELETE"] } },
  { id: "route.handler", label: "Route Handler", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "route.backendProgramSoul", label: "Route Backend Program Soul", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.id", label: "Server Runner Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.handlerSet", label: "Handler Set", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.host", label: "Host Id", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.storage", label: "Storage Path", compatibleWith: ["textual"], editor: { control: "text" } },
  { id: "serverRunner.runtimeConfig", label: "Runtime Config JSON", compatibleWith: ["textual"], editor: { control: "text" } },
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
      { name: "eventSoul", accepts: "widget.eventSoul", required: false },
      { name: "eventVersion", accepts: "widget.eventVersion", required: false },
      { name: "context", accepts: "context.id", required: false },
      { name: "template", accepts: "widget.template", required: false },
      { name: "attach", accepts: "widget.attach", required: false },
      { name: "level", accepts: "widget.level", required: false },
      { name: "guidanceTarget", accepts: "widget.guidanceTarget", required: false }
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
    id: "backend_program_define_spec",
    process: "backendProgram.define",
    inputs: [
      { name: "soul", accepts: "backendProgram.soul", required: true },
      { name: "label", accepts: "backendProgram.label", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "soul", accepts: "backendProgram.soul", required: true }]
  },
  {
    id: "backend_program_version_define_spec",
    process: "backendProgramVersion.define",
    inputs: [
      { name: "soul", accepts: "backendProgram.soul", required: true },
      { name: "version", accepts: "backendProgram.version", required: true },
      { name: "index", accepts: "widget.order", required: false },
      { name: "transitionFrom", accepts: "backendProgram.version", required: false },
      { name: "transitionStrategy", accepts: "backendProgram.transitionStrategy", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "version", accepts: "backendProgram.version", required: true }]
  },
  {
    id: "backend_step_define_spec",
    process: "backendStep.define",
    inputs: [
      { name: "version", accepts: "backendProgram.version", required: true },
      { name: "event", accepts: "program.event", required: true },
      { name: "op", accepts: "backendProgram.op", required: true },
      { name: "order", accepts: "widget.order", required: false },
      { name: "paramsJson", accepts: "json.text", required: false },
      { name: "whenJson", accepts: "json.text", required: false },
      { name: "repeatJson", accepts: "json.text", required: false },
      { name: "afterJson", accepts: "json.text", required: false }
    ],
    outputs: [{ name: "version", accepts: "backendProgram.version", required: true }]
  },
  {
    id: "backend_program_version_activate_spec",
    process: "backendProgramVersion.activate",
    inputs: [
      { name: "soul", accepts: "backendProgram.soul", required: true },
      { name: "version", accepts: "backendProgram.version", required: true }
    ],
    outputs: [{ name: "soul", accepts: "backendProgram.soul", required: true }]
  },
  {
    id: "backend_program_version_rollback_spec",
    process: "backendProgramVersion.rollback",
    inputs: [
      { name: "soul", accepts: "backendProgram.soul", required: true }
    ],
    outputs: [{ name: "soul", accepts: "backendProgram.soul", required: true }]
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
      { name: "backendProgramSoul", accepts: "route.backendProgramSoul", required: false },
      { name: "backendProgramSoulRef", accepts: "context.name", required: false },
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
      { name: "runtimeConfigJson", accepts: "json.text", required: false },
      { name: "allowActorHeader", accepts: "widget.attach", required: false },
      { name: "context", accepts: "context.id", required: false }
    ],
    outputs: [{ name: "id", accepts: "serverRunner.id", required: true }]
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

export const CORE_RUNTIME_CAPABILITY_IDS = Object.freeze([
  "http.serve",
  "runtime.config",
  "dom.render",
  "http.fetch"
]);

const BUILTIN_CAPABILITY_BY_ID = new Map(BUILTIN_CAPABILITIES.map(capability => [capability.id, capability]));

function cloneCapabilityDefinition(capability) {
  return capability ? JSON.parse(JSON.stringify(capability)) : null;
}

function seedDefinitionSets(seedContributions = []) {
  const traits = new Map();
  const valueTypes = new Map();
  const processSpecs = new Map();
  const addById = (target, rows = []) => {
    for (const row of rows) {
      const id = typeof row?.id === "string" ? row.id.trim() : "";
      if (!id || target.has(id)) continue;
      target.set(id, row);
    }
  };
  addById(traits, TRAITS);
  addById(valueTypes, VALUE_TYPES);
  addById(processSpecs, PROCESS_SPECS);
  for (const contribution of seedContributions ?? []) {
    addById(traits, contribution?.traits ?? []);
    addById(valueTypes, contribution?.valueTypes ?? []);
    addById(processSpecs, contribution?.processSpecs ?? []);
  }
  return {
    traits: [...traits.values()],
    valueTypes: [...valueTypes.values()],
    processSpecs: [...processSpecs.values()]
  };
}

export function builtinCapabilityDefinitions(capabilityIds = null, capabilityDefinitions = []) {
  const capabilityById = new Map(BUILTIN_CAPABILITY_BY_ID);
  for (const capability of capabilityDefinitions ?? []) {
    if (!capability?.id) continue;
    capabilityById.set(String(capability.id), capability);
  }
  const selectedIds = capabilityIds == null
    ? [...capabilityById.keys()]
    : [...new Set((capabilityIds ?? []).map(id => String(id || "")).filter(Boolean))];
  return selectedIds
    .map(id => cloneCapabilityDefinition(capabilityById.get(id)))
    .filter(Boolean);
}

export function ensureRuntimeBuiltins(world, {
  actor = "system",
  capabilityIds = null,
  capabilityDefinitions = [],
  seedContributions = []
} = {}) {
  const witnesses = world.allWitnesses();
  const seeds = seedDefinitionSets(seedContributions);
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

  for (const trait of seeds.traits) {
    if (definedTraits.has(trait.id)) continue;
    defineTrait(world, { actor, id: trait.id, label: trait.label, owner: actor });
  }
  for (const valueType of seeds.valueTypes) {
    if (definedValueTypes.has(valueType.id)) continue;
    defineValueType(world, { actor, id: valueType.id, label: valueType.label, compatibleWith: valueType.compatibleWith, editor: valueType.editor, owner: actor });
  }
  for (const spec of seeds.processSpecs) {
    if (definedProcessSpecs.has(spec.id)) continue;
    defineProcessSpec(world, { actor, id: spec.id, process: spec.process, inputs: spec.inputs, outputs: spec.outputs, owner: actor });
  }
  for (const capability of builtinCapabilityDefinitions(capabilityIds, capabilityDefinitions)) {
    if (definedCapabilities.has(capability.id)) continue;
    defineCapability(world, { actor, ...capability, owner: actor });
  }
}
