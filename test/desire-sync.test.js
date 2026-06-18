import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  compileRvmFileToDesirePlus,
  compileRvmToDesirePlus,
  createDesireRegistriesFromPluginExtensions,
  createRvmFormRegistry,
  normalizeDesirePlusToDesire,
  serializeDesirePlusToRvm
} from "../src/desire/index.js";
import { desireExtensions as sqlDesireExtensions } from "../plugins/sql/runtime.js";
import { desireExtensions as pipelineDesireExtensions } from "../plugins/pipeline-runtime/runtime.js";

const EXAMPLE_SYNC_FILE = path.join(process.cwd(), "example-ports", "engentus-pipeline", "ingest-sensor-sync.rvm");

function pluginRegistries() {
  return createDesireRegistriesFromPluginExtensions({
    desireExtensions: {
      rvmForms: [
        ...(sqlDesireExtensions.rvmForms ?? []),
        ...(pipelineDesireExtensions.rvmForms ?? [])
      ]
    }
  });
}

function residualSignature(residual) {
  return {
    kind: residual.body.declarationKind,
    name: residual.name,
    values: residual.body.values
  };
}

test("plugin-owned sql_table declarations normalize through plugin residuals", () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = compileRvmToDesirePlus(`
sql_table RawTelemetry {
  binding source_mysql
  provider mysql
  schema engentus
  table Transactions_IMU
  column tx_gateway_id varchar
  column tx_timestamp_start bigint
  key tx_gateway_id
}
`, { file: "C:/demo/sql-table.rvm", rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });

  assert.deepEqual(desire.nodes, []);
  assert.deepEqual(desire.runtimeResiduals.map(residualSignature), [{
    kind: "sql_table",
    name: "RawTelemetry",
    values: {
      name: "RawTelemetry",
      binding: "source_mysql",
      provider: "mysql",
      schema: "engentus",
      table: "Transactions_IMU",
      columns: [
        { name: "tx_gateway_id", type: "varchar" },
        { name: "tx_timestamp_start", type: "bigint" }
      ],
      keys: ["tx_gateway_id"]
    }
  }]);
});

test("plugin-owned pipeline forms serialize, validate, and normalize through plugin residuals", () => {
  const { rvmFormRegistry } = pluginRegistries();
  const source = `
sync EngentusSensorIngest {
  source {
    capability db.sql
    binding source_mysql
    dataset Transactions_IMU
  }
  output CanonicalSensors
  output CanonicalSensorSamples
  trigger manual
  trigger scheduled
  progress {
    kind monotonic
    field tx_timestamp_start
    replay_window_ms 10050
  }
  consistency eventual
}

sync_output CanonicalSensors {
  sync EngentusSensorIngest
  target {
    capability db.sql
    binding warehouse_pg
    dataset engentus.sensors
  }
  write_mode upsert
  key source_device_id
  key source_sensor_id
  key sensor_type
  field source_device_id from tx_gateway_id
  field source_sensor_id from tx_IMU_device_id
  field sensor_type literal "imu"
}

sync_output CanonicalSensorSamples {
  sync EngentusSensorIngest
  target {
    capability db.sql
    binding warehouse_pg
    dataset engentus.sensor_data
  }
  write_mode insert_ignore
  key sensor_id
  key timestamp
  field sensor_id derive sensor_identity_lookup
  arg source_device_id tx_gateway_id
  arg source_sensor_id tx_IMU_device_id
  arg sensor_type "imu"
  field timestamp derive sample_timestamp
  arg start tx_timestamp_start
  arg counter tx_sample_counter
  arg interval_ms 50
  arg epoch_unit auto
  field value from tx_sample_IMU
}`.trim();

  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/plugin-sync.rvm", rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });

  assert.equal(desire.nodes.length, 0);
  assert.deepEqual(desire.runtimeResiduals.map(residualSignature), [
    {
      kind: "sync",
      name: "EngentusSensorIngest",
      values: {
        name: "EngentusSensorIngest",
        source: {
          capability: "db.sql",
          binding: "source_mysql",
          dataset: "Transactions_IMU"
        },
        outputs: ["CanonicalSensors", "CanonicalSensorSamples"],
        triggers: ["manual", "scheduled"],
        progress: {
          kind: "monotonic",
          field: "tx_timestamp_start",
          replayWindowMs: 10050
        },
        consistency: "eventual"
      }
    },
    {
      kind: "sync_output",
      name: "CanonicalSensors",
      values: {
        name: "CanonicalSensors",
        sync: "EngentusSensorIngest",
        target: {
          capability: "db.sql",
          binding: "warehouse_pg",
          dataset: "engentus.sensors"
        },
        writeMode: "upsert",
        keys: ["source_device_id", "source_sensor_id", "sensor_type"],
        fields: [
          { targetField: "source_device_id", kind: "from", sourceField: "tx_gateway_id" },
          { targetField: "source_sensor_id", kind: "from", sourceField: "tx_IMU_device_id" },
          { targetField: "sensor_type", kind: "literal", literal: "imu" }
        ]
      }
    },
    {
      kind: "sync_output",
      name: "CanonicalSensorSamples",
      values: {
        name: "CanonicalSensorSamples",
        sync: "EngentusSensorIngest",
        target: {
          capability: "db.sql",
          binding: "warehouse_pg",
          dataset: "engentus.sensor_data"
        },
        writeMode: "insert_ignore",
        keys: ["sensor_id", "timestamp"],
        fields: [
          {
            targetField: "sensor_id",
            kind: "derive",
            derive: "sensor_identity_lookup",
            args: {
              source_device_id: "tx_gateway_id",
              source_sensor_id: "tx_IMU_device_id",
              sensor_type: "imu"
            }
          },
          {
            targetField: "timestamp",
            kind: "derive",
            derive: "sample_timestamp",
            args: {
              start: "tx_timestamp_start",
              counter: "tx_sample_counter",
              interval_ms: 50,
              epoch_unit: "auto"
            }
          },
          {
            targetField: "value",
            kind: "from",
            sourceField: "tx_sample_IMU"
          }
        ]
      }
    }
  ]);

  const serialized = serializeDesirePlusToRvm({
    ...desirePlus,
    nodes: desirePlus.nodes.map(node => ({
      ...node,
      payload: { ...node.payload, raw: "", header: "" }
    }))
  }, { rvmFormRegistry });
  assert.match(serialized, /sync EngentusSensorIngest \{/);
  assert.match(serialized, /sync_output CanonicalSensorSamples \{/);
  assert.match(serialized, /field sensor_id derive sensor_identity_lookup/);

  const reparsed = compileRvmToDesirePlus(serialized, { file: "C:/demo/plugin-sync.rvm", rvmFormRegistry });
  assert.deepEqual(
    normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry }).runtimeResiduals.map(residualSignature),
    normalizeDesirePlusToDesire(reparsed, { rvmFormRegistry }).runtimeResiduals.map(residualSignature)
  );
});

test("plugin-owned pipeline forms fail clearly when the plugin is unavailable", () => {
  const rvmFormRegistry = createRvmFormRegistry()
    .registerUnresolved("sync", { pluginId: "plugin.pipeline-runtime" })
    .registerUnresolved("sync_output", { pluginId: "plugin.pipeline-runtime" });

  assert.throws(
    () => compileRvmToDesirePlus(`
sync MissingPluginSync {
  source {
    capability db.sql
    binding source_mysql
    dataset Transactions_IMU
  }
  output MissingPluginOutput
  progress {
    kind monotonic
    field tx_timestamp_start
  }
  consistency eventual
}
`, { file: "C:/demo/missing-plugin-sync.rvm", rvmFormRegistry }),
    /RVM form sync requires plugin\.pipeline-runtime/
  );
});

test("checked-in Engentus sync example compiles through the pipeline plugin", async () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = await compileRvmFileToDesirePlus(EXAMPLE_SYNC_FILE, { rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });

  assert.deepEqual(
    desire.runtimeResiduals.map(residual => residual.body.declarationKind),
    ["sync", "sync_output", "sync_output"]
  );
  assert.equal(desire.runtimeResiduals.some(residual => residual.name === "EngentusImuSensorIngest"), true);
});
