export async function verify(context) {
  if (context.input?.throwAssertion === true) {
    const error = new Error("fixture assertion failed");
    error.name = "AssertionError";
    throw error;
  }
  return {
    status: context.input?.status || "passed",
    exitCode: context.input?.status === "passed" ? 0 : 1,
    stdout: context.input?.stdout || "fixture verifier ran",
    stderr: context.input?.stderr || "",
    artifacts: [{
      id: `testArtifact:${context.runId}:fixture-log`,
      artifactKind: "log",
      title: "Fixture verifier log",
      fileName: "fixture.log",
      contentType: "text/plain",
      content: `fixture:${context.gate.id}:${context.executionClass}`
    }],
    suites: [{
      id: `testSuite:${context.runId}:fixture-suite`,
      name: "Fixture verifier suite",
      status: "passed",
      total: 1,
      passed: 1,
      failed: 0,
      errors: 0,
      skipped: 0,
      durationMs: 5
    }],
    cases: [{
      id: `testCase:${context.runId}:fixture-case`,
      suiteId: `testSuite:${context.runId}:fixture-suite`,
      name: "runs authored verifier",
      status: "passed",
      classname: "FixtureVerifier",
      durationMs: 5
    }]
  };
}

export async function cleanup(context) {
  if (context.input?.cleanupFailure === true) {
    throw new Error("fixture cleanup failed");
  }
  return {
    summary: "Fixture cleanup completed.",
    artifacts: [{
      id: `testArtifact:${context.runId}:fixture-cleanup`,
      artifactKind: "cleanup",
      title: "Fixture cleanup artifact",
      fileName: "cleanup.log",
      contentType: "text/plain",
      content: "cleanup complete"
    }]
  };
}
