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
import {
  createPipelineExecutionPlanProgramFromDesire,
  createPipelineProofProgramFromDesire,
  desireExtensions as pipelineDesireExtensions,
  evaluatePlannedInputTransform,
  evaluatePlannedOutputTransform,
  evaluatePlannedSync,
  evaluatePipelineProof,
  hasPipelineDeriveOperator,
  listPipelineDeriveOperatorIds,
  planInputTransform,
  planOutputTransform,
  planPipelineSync
} from "../plugins/pipeline-runtime/runtime.js";

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

function nodeSignature(node) {
  return {
    kind: node.kind,
    name: node.name
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

test("transform-composed pipeline forms and pipeline tests serialize, validate, and normalize through plugin residuals", () => {
  const { rvmFormRegistry } = pluginRegistries();
  const source = `
sql_table RawTelemetry {
  binding source_mysql
  provider mysql
  schema engentus
  table Transactions_IMU
  column tx_gateway_id varchar
  column tx_IMU_device_id varchar
  column tx_timestamp_start bigint
  column tx_sample_counter int
  column tx_sample_IMU double
  key tx_gateway_id
}

sql_table CanonicalSensorsTable {
  binding warehouse_pg
  provider postgres
  schema engentus
  table sensors
  column device_id varchar
  column source_sensor_id varchar
  column sensor_type varchar
  key device_id
  key source_sensor_id
  key sensor_type
}

sql_table CanonicalSensorDataTable {
  binding warehouse_pg
  provider postgres
  schema engentus
  table sensor_data
  column sensor_id varchar
  column timestamp timestamptz
  column value double
  key sensor_id
  key timestamp
}

input_transform ImuRowsToWorld {
  source RawTelemetry
  emit Device {
    key device_id derive device_identity_key
    arg source_device_id tx_gateway_id
    field source_device_id from tx_gateway_id
  }
  emit Sensor {
    key sensor_id derive sensor_identity_key
    arg source_device_id tx_gateway_id
    arg source_sensor_id tx_IMU_device_id
    arg sensor_type "imu"
    field device_id derive device_identity_key
    arg source_device_id tx_gateway_id
    field source_device_id from tx_gateway_id
    field source_sensor_id from tx_IMU_device_id
    field sensor_type literal "imu"
  }
  emit SensorSample {
    field sensor_id derive sensor_identity_key
    arg source_device_id tx_gateway_id
    arg source_sensor_id tx_IMU_device_id
    arg sensor_type "imu"
    field timestamp derive sample_timestamp
    arg start 1700000000000
    arg counter tx_sample_counter
    arg interval_ms 50
    arg epoch_unit auto
    field value from tx_sample_IMU
  }
}

output_transform CanonicalSensors {
  source Sensor
  target CanonicalSensorsTable
  write_mode upsert
  key device_id from device_id
  key source_sensor_id from source_sensor_id
  key sensor_type from sensor_type
  field device_id from device_id
  field source_sensor_id from source_sensor_id
  field sensor_type from sensor_type
}

output_transform CanonicalSensorSamples {
  source SensorSample
  target CanonicalSensorDataTable
  write_mode insert_ignore
  key sensor_id from sensor_id
  key timestamp from timestamp
  field sensor_id from sensor_id
  field timestamp from timestamp
  field value from value
}

sync EngentusSensorIngest {
  input ImuRowsToWorld
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

pipeline_test EngentusSensorIngestProof {
  subject EngentusSensorIngest
  fixture {
    source_rows RawTelemetry {
      row {
        tx_gateway_id "4EF47C45"
        tx_IMU_device_id "b_AccelX"
        tx_timestamp_start 1700000000000
        tx_sample_counter 1
        tx_sample_IMU 12.5
      }
    }
  }
  expect {
    emit Device {
      row {
        device_id "device:4EF47C45"
        source_device_id "4EF47C45"
      }
    }
    emit Sensor {
      row {
        sensor_id "sensor:4EF47C45:b_AccelX:imu"
        device_id "device:4EF47C45"
        source_device_id "4EF47C45"
        source_sensor_id "b_AccelX"
        sensor_type "imu"
      }
    }
    emit SensorSample {
      row {
        sensor_id "sensor:4EF47C45:b_AccelX:imu"
        timestamp "2023-11-14T22:13:20.000Z"
        value 12.5
      }
    }
    sql_rows CanonicalSensorsTable {
      row {
        device_id "device:4EF47C45"
        source_sensor_id "b_AccelX"
        sensor_type "imu"
      }
    }
    sql_rows CanonicalSensorDataTable {
      row {
        sensor_id "sensor:4EF47C45:b_AccelX:imu"
        timestamp "2023-11-14T22:13:20.000Z"
        value 12.5
      }
    }
  }
}`.trim();

  const desirePlus = compileRvmToDesirePlus(source, { file: "C:/demo/plugin-sync.rvm", rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });

  assert.equal(desire.nodes.length, 0);
  assert.equal(desire.runtimeResiduals.some(residual => residual.body.declarationKind === "pipeline_test"), true);
  assert.equal(
    desire.runtimeResiduals.find(residual => residual.name === "EngentusSensorIngestProof")?.body?.values?.subject,
    "EngentusSensorIngest"
  );

  const serialized = serializeDesirePlusToRvm({
    ...desirePlus,
    nodes: desirePlus.nodes.map(node => ({
      ...node,
      payload: { ...node.payload, raw: "", header: "" }
    }))
  }, { rvmFormRegistry });
  assert.match(serialized, /pipeline_test EngentusSensorIngestProof \{/);
  assert.match(serialized, /source_rows RawTelemetry \{/);
  assert.match(serialized, /sql_rows CanonicalSensorDataTable \{/);

  const reparsed = compileRvmToDesirePlus(serialized, { file: "C:/demo/plugin-sync.rvm", rvmFormRegistry });
  assert.deepEqual(
    normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry }).runtimeResiduals.map(residualSignature),
    normalizeDesirePlusToDesire(reparsed, { rvmFormRegistry }).runtimeResiduals.map(residualSignature)
  );
});

test("pipeline_test validation rejects malformed fixtures, unknown subjects, and unknown derives", () => {
  const { rvmFormRegistry } = pluginRegistries();

  assert.throws(
    () => compileRvmToDesirePlus(`
sql_table RawTelemetry {
  binding source_mysql
  provider mysql
  schema engentus
  table Transactions_IMU
  column tx_timestamp_start bigint
  key tx_timestamp_start
}

input_transform ImuRowsToWorld {
  source RawTelemetry
  emit Device {
    key device_id derive device_identity_key
    arg source_device_id tx_timestamp_start
  }
}

pipeline_test MissingSourceRows {
  subject ImuRowsToWorld
  fixture {
  }
  expect {
    emit Device {
      row {
        device_id "device:1"
      }
    }
  }
}
`, { file: "C:/demo/pipeline-proof-missing-source.rvm", rvmFormRegistry }),
    /must declare source_rows RawTelemetry/
  );

  assert.throws(
    () => compileRvmToDesirePlus(`
pipeline_test UnknownSubject {
  subject NotHere
  fixture {
  }
  expect {
  }
}
`, { file: "C:/demo/pipeline-proof-unknown-subject.rvm", rvmFormRegistry }),
    /references unknown subject NotHere/
  );

  assert.throws(
    () => compileRvmToDesirePlus(`
sql_table RawTelemetry {
  binding source_mysql
  provider mysql
  schema engentus
  table Transactions_IMU
  column tx_gateway_id varchar
  key tx_gateway_id
}

input_transform BadDerive {
  source RawTelemetry
  emit Device {
    key device_id derive missing_operator
    arg source_device_id tx_gateway_id
  }
}

pipeline_test BadDeriveProof {
  subject BadDerive
  fixture {
    source_rows RawTelemetry {
      row {
        tx_gateway_id "x"
      }
    }
  }
  expect {
    emit Device {
      row {
        device_id "x"
      }
    }
  }
}
`, { file: "C:/demo/pipeline-proof-bad-derive.rvm", rvmFormRegistry }),
    /requires unknown derive operator missing_operator/
  );
});

test("pipeline proof runtime evaluates derive operators and exact proof expectations", async () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = await compileRvmFileToDesirePlus(EXAMPLE_SYNC_FILE, { rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });
  const program = createPipelineProofProgramFromDesire(desire);

  assert.equal(hasPipelineDeriveOperator("device_identity_key"), true);
  assert.equal(hasPipelineDeriveOperator("sensor_identity_key"), true);
  assert.equal(hasPipelineDeriveOperator("sample_timestamp"), true);
  assert.deepEqual(
    listPipelineDeriveOperatorIds().sort(),
    ["device_identity_key", "sample_timestamp", "sensor_identity_key"].sort()
  );

  const inputProof = evaluatePipelineProof(program, "EngentusImuRowsToWorldProof");
  assert.equal(inputProof.ok, true);
  assert.deepEqual(inputProof.mismatches, []);
  assert.deepEqual(inputProof.actual.worldEmissions.Device, [{
    device_id: "device:4EF47C45",
    source_device_id: "4EF47C45"
  }]);

  const sensorsProof = evaluatePipelineProof(program, "EngentusCanonicalSensorsProof");
  assert.equal(sensorsProof.ok, true);
  assert.deepEqual(sensorsProof.actual.sqlEmissions.CanonicalSensorsTable, [{
    device_id: "device:4EF47C45",
    source_sensor_id: "b_AccelX",
    sensor_type: "imu"
  }]);

  const samplesProof = evaluatePipelineProof(program, "EngentusCanonicalSensorSamplesProof");
  assert.equal(samplesProof.ok, true);
  assert.deepEqual(samplesProof.actual.sqlEmissions.CanonicalSensorDataTable, [{
    sensor_id: "sensor:4EF47C45:b_AccelX:imu",
    timestamp: "2023-11-14T22:13:20.000Z",
    value: 12.5
  }]);

  const syncProof = evaluatePipelineProof(program, "EngentusImuSensorIngestProof");
  assert.equal(syncProof.ok, true);
  assert.deepEqual(syncProof.mismatches, []);
  assert.deepEqual(syncProof.actual.summary, {
    worldCounts: {
      Device: 1,
      Sensor: 1,
      SensorSample: 1
    },
    sqlCounts: {
      CanonicalSensorsTable: 1,
      CanonicalSensorDataTable: 1
    },
    skipCount: 0
  });
});

test("pipeline planner lowers the canonical IMU sync into a stable execution plan IR", async () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = await compileRvmFileToDesirePlus(EXAMPLE_SYNC_FILE, { rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });
  const planProgram = createPipelineExecutionPlanProgramFromDesire(desire);
  const syncPlan = planPipelineSync(planProgram, "EngentusImuSensorIngest");

  assert.equal(planProgram.syncPlans.has("EngentusImuSensorIngest"), true);
  assert.equal(syncPlan.kind, "pipelineExecutionPlan");
  assert.equal(syncPlan.planKind, "sync");
  assert.equal(syncPlan.syncId, "EngentusImuSensorIngest");
  assert.deepEqual(syncPlan.source, {
    tableId: "RawImuTransactions",
    binding: "source_mysql",
    provider: "mysql",
    schema: "engentus",
    table: "Transactions_IMU",
    columns: [
      { name: "tx_gateway_id", type: "varchar" },
      { name: "tx_IMU_device_id", type: "varchar" },
      { name: "tx_timestamp_start", type: "bigint" },
      { name: "tx_sample_counter", type: "int" },
      { name: "tx_sample_IMU", type: "double" }
    ],
    keys: ["tx_gateway_id"]
  });
  assert.equal(syncPlan.inputTransform.id, "EngentusImuRowsToWorld");
  assert.deepEqual(syncPlan.outputTransforms.map(transform => ({
    id: transform.id,
    sourceShape: transform.sourceShape,
    target: transform.target.tableId,
    writeMode: transform.writeMode
  })), [
    {
      id: "EngentusCanonicalSensors",
      sourceShape: "Sensor",
      target: "CanonicalSensorsTable",
      writeMode: "upsert"
    },
    {
      id: "EngentusCanonicalSensorSamples",
      sourceShape: "SensorSample",
      target: "CanonicalSensorDataTable",
      writeMode: "insert_ignore"
    }
  ]);
  assert.deepEqual(syncPlan.progress, {
    kind: "monotonic",
    field: "tx_timestamp_start",
    replayWindowMs: 10050
  });
  assert.deepEqual(syncPlan.triggers, ["manual", "scheduled"]);
  assert.equal(syncPlan.consistency, "eventual");
  assert.deepEqual(syncPlan.stages.map(stage => stage.kind), [
    "read_sql_rows",
    "emit_world_entities",
    "emit_world_entities",
    "emit_world_stream",
    "write_sql_rows",
    "write_sql_rows"
  ]);
  assert.deepEqual(syncPlan.stages.filter(stage => stage.kind === "write_sql_rows").map(stage => ({
    sourceShape: stage.sourceShape,
    target: stage.target.tableId,
    writeMode: stage.writeMode
  })), [
    {
      sourceShape: "Sensor",
      target: "CanonicalSensorsTable",
      writeMode: "upsert"
    },
    {
      sourceShape: "SensorSample",
      target: "CanonicalSensorDataTable",
      writeMode: "insert_ignore"
    }
  ]);
});

test("planned execution preserves the same outputs as direct pipeline proofs", async () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = await compileRvmFileToDesirePlus(EXAMPLE_SYNC_FILE, { rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });
  const proofProgram = createPipelineProofProgramFromDesire(desire);
  const planProgram = createPipelineExecutionPlanProgramFromDesire(desire);

  const inputFixture = proofProgram.tests.get("EngentusImuRowsToWorldProof")?.fixture;
  const inputProof = evaluatePipelineProof(proofProgram, "EngentusImuRowsToWorldProof");
  const inputPlan = planInputTransform(planProgram, "EngentusImuRowsToWorld");
  const inputPlanned = evaluatePlannedInputTransform(inputPlan, inputFixture);
  assert.deepEqual(inputPlanned, inputProof.actual);

  const sensorsFixture = proofProgram.tests.get("EngentusCanonicalSensorsProof")?.fixture;
  const sensorsProof = evaluatePipelineProof(proofProgram, "EngentusCanonicalSensorsProof");
  const sensorsPlan = planOutputTransform(planProgram, "EngentusCanonicalSensors");
  const sensorsPlanned = evaluatePlannedOutputTransform(sensorsPlan, sensorsFixture);
  assert.deepEqual(sensorsPlanned, sensorsProof.actual);

  const samplesFixture = proofProgram.tests.get("EngentusCanonicalSensorSamplesProof")?.fixture;
  const samplesProof = evaluatePipelineProof(proofProgram, "EngentusCanonicalSensorSamplesProof");
  const samplesPlan = planOutputTransform(planProgram, "EngentusCanonicalSensorSamples");
  const samplesPlanned = evaluatePlannedOutputTransform(samplesPlan, samplesFixture);
  assert.deepEqual(samplesPlanned, samplesProof.actual);

  const syncFixture = proofProgram.tests.get("EngentusImuSensorIngestProof")?.fixture;
  const syncProof = evaluatePipelineProof(proofProgram, "EngentusImuSensorIngestProof");
  const syncPlan = planProgram.syncPlans.get("EngentusImuSensorIngest") ?? planPipelineSync(planProgram, "EngentusImuSensorIngest");
  const syncPlanned = evaluatePlannedSync(syncPlan, syncFixture);
  assert.deepEqual(syncPlanned, syncProof.actual);
});

test("plugin-owned transform-composed pipeline forms fail clearly when the plugin is unavailable", () => {
  const rvmFormRegistry = createRvmFormRegistry()
    .registerUnresolved("sync", { pluginId: "plugin.pipeline-runtime" })
    .registerUnresolved("input_transform", { pluginId: "plugin.pipeline-runtime" })
    .registerUnresolved("output_transform", { pluginId: "plugin.pipeline-runtime" })
    .registerUnresolved("pipeline_test", { pluginId: "plugin.pipeline-runtime" });

  assert.throws(
    () => compileRvmToDesirePlus(`
input_transform MissingPluginInput {
  source RawTelemetry
}
`, { file: "C:/demo/missing-plugin-input.rvm", rvmFormRegistry }),
    /RVM form input_transform requires plugin\.pipeline-runtime/
  );

  assert.throws(
    () => compileRvmToDesirePlus(`
output_transform MissingPluginOutput {
  source Sensor
  target CanonicalSensorsTable
  write_mode upsert
}
`, { file: "C:/demo/missing-plugin-output.rvm", rvmFormRegistry }),
    /RVM form output_transform requires plugin\.pipeline-runtime/
  );

  assert.throws(
    () => compileRvmToDesirePlus(`
sync MissingPluginSync {
  input ImuRowsToWorld
  output CanonicalSensors
  progress {
    kind monotonic
    field tx_timestamp_start
  }
  consistency eventual
}
`, { file: "C:/demo/missing-plugin-sync.rvm", rvmFormRegistry }),
    /RVM form sync requires plugin\.pipeline-runtime/
  );

  assert.throws(
    () => compileRvmToDesirePlus(`
pipeline_test MissingPluginProof {
  subject ImuRowsToWorld
  fixture {
  }
  expect {
  }
}
`, { file: "C:/demo/missing-plugin-proof.rvm", rvmFormRegistry }),
    /RVM form pipeline_test requires plugin\.pipeline-runtime/
  );
});

test("checked-in Engentus transform-composed pipeline example compiles through the pipeline plugin with authored proofs", async () => {
  const { rvmFormRegistry } = pluginRegistries();
  const desirePlus = await compileRvmFileToDesirePlus(EXAMPLE_SYNC_FILE, { rvmFormRegistry });
  const desire = normalizeDesirePlusToDesire(desirePlus, { rvmFormRegistry });

  assert.deepEqual(
    desire.nodes.map(nodeSignature),
    [
      { kind: "context", name: "EngentusPipelineWorld" },
      { kind: "entity", name: "Device" },
      { kind: "entity", name: "Sensor" }
    ]
  );
  assert.deepEqual(
    desire.runtimeResiduals.map(residual => residual.body.declarationKind),
    [
      "sql_table",
      "sql_table",
      "sql_table",
      "input_transform",
      "output_transform",
      "output_transform",
      "sync",
      "pipeline_test",
      "pipeline_test",
      "pipeline_test",
      "pipeline_test"
    ]
  );
  assert.equal(desire.runtimeResiduals.some(residual => residual.name === "EngentusImuRowsToWorld"), true);
  assert.equal(desire.runtimeResiduals.some(residual => residual.name === "EngentusImuSensorIngest"), true);
  assert.equal(desire.runtimeResiduals.some(residual => residual.name === "EngentusImuSensorIngestProof"), true);
});
