import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapDomHelpers,
  renderBootstrapDomHelpersFactory
} from "./bootstrap-dom-helpers.js";

class FakeOption {
  constructor(label, value) {
    this.label = label;
    this.text = label;
    this.value = value;
  }
}

class FakeSelect {
  constructor(value = "") {
    this.value = value;
    this.options = [];
  }

  set innerHTML(value) {
    this._innerHTML = value;
    if (value === "") this.options = [];
  }

  get innerHTML() {
    return this._innerHTML || "";
  }

  append(option) {
    this.options.push(option);
  }
}

function withDomGlobals(callback) {
  const previousCss = globalThis.CSS;
  const previousOption = globalThis.Option;
  globalThis.CSS = { escape: value => String(value) };
  globalThis.Option = FakeOption;
  try {
    callback();
  } finally {
    globalThis.CSS = previousCss;
    globalThis.Option = previousOption;
  }
}

test("bootstrap DOM helpers provide shared mechanical DOM reads and writes", () => {
  withDomGlobals(() => {
    const statusNode = { textContent: "" };
    const runnerSelect = new FakeSelect("runner.two");
    const submitButton = { disabled: false };
    const form = {
      elements: {
        namedItem(name) {
          return form.fields[name] || null;
        }
      },
      fields: {
        serviceIdentity: { value: "identity.demo" }
      },
      querySelector(selector) {
        if (selector === '[name="serviceIdentity"]') return this.fields.serviceIdentity;
        if (selector === 'button[type="submit"]') return submitButton;
        return null;
      }
    };
    const nodes = new Map([
      ["runtime-plugin-install-proposal-help", statusNode],
      ["runtime-plugin-install-proposal-runner", runnerSelect],
      ["mcp-server-proposal-form", form]
    ]);
    const helpers = createBootstrapDomHelpers({
      document: {
        getElementById(id) {
          return nodes.get(id) || null;
        }
      }
    });

    assert.equal(helpers.byId("runtime-plugin-install-proposal-help"), statusNode);

    helpers.setStatus("runtime-plugin-install-proposal-help", "Installable on full.");
    assert.equal(statusNode.textContent, "Installable on full.");

    assert.equal(helpers.formField(form, "serviceIdentity"), form.fields.serviceIdentity);
    assert.equal(helpers.readFieldValue("mcp-server-proposal-form", "serviceIdentity"), "identity.demo");

    helpers.fillSelect(
      "runtime-plugin-install-proposal-runner",
      [{ value: "runner.one", label: "runner.one" }, { value: "runner.two", label: "runner.two" }],
      row => row.value,
      row => row.label,
      { includeBlank: false }
    );
    assert.deepEqual(runnerSelect.options.map(option => option.value), ["runner.one", "runner.two"]);
    assert.equal(helpers.readSelectValue("runtime-plugin-install-proposal-runner"), "runner.two");

    helpers.setSelectedValue("runtime-plugin-install-proposal-runner", "runner.one");
    assert.equal(runnerSelect.value, "runner.one");
    helpers.setSelectedValue("runtime-plugin-install-proposal-runner", "runner.missing");
    assert.equal(runnerSelect.value, "runner.one");

    helpers.setSubmitDisabled("mcp-server-proposal-form", true);
    assert.equal(submitButton.disabled, true);
  });
});

test("bootstrap DOM helper factory exposes the shared browser seam", () => {
  const factory = renderBootstrapDomHelpersFactory();

  assert.equal(factory.includes("const createBootstrapDomHelpers ="), true);
  assert.equal(factory.includes("setSubmitDisabled"), true);
  assert.equal(factory.includes("readFieldValue"), true);
});
