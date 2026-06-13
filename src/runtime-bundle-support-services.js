export function createRuntimeProjectionServices({ world }) {
  const requestVisibleWitnesses = (requestActor, appContext) => {
    const projector = appContext?.visibleWitnesses ?? (() => world.allWitnesses());
    return projector(requestActor);
  };
  const requestActors = appContext => appContext?.actors ?? [];
  const processSelection = requestUrl => ({
    program: requestUrl.searchParams.get("program") || null,
    event: requestUrl.searchParams.get("event") || null,
    runId: requestUrl.searchParams.get("runId") || null,
    nodeId: requestUrl.searchParams.get("node") || null,
    replay: requestUrl.searchParams.get("replay")
  });
  const processViewInputs = (requestActor, appContext) => {
    const witnesses = requestVisibleWitnesses(requestActor, appContext);
    const visibleIds = new Set(witnesses.map(witness => witness.id));
    const observations = world.allObservations()
      .filter(observation =>
        observation.process === "backend.request.finish"
        || observation.process === "backend.process.start"
        || observation.process === "backend.process.done"
        || observation.process === "backend.process.failed"
        || observation.process === "backend.step.start"
        || observation.process === "backend.step.done"
        || observation.process === "backend.step.skipped"
        || observation.process === "backend.step.failed"
      )
      .map(observation => ({
        ...observation,
        body: {
          ...(observation.body ?? {}),
          emittedWitnessIds: (observation.body?.emittedWitnessIds ?? []).filter(id => visibleIds.has(id)),
          failureWitnessIds: (observation.body?.failureWitnessIds ?? []).filter(id => visibleIds.has(id))
        }
      }));
    return { witnesses, observations };
  };

  return {
    requestVisibleWitnesses,
    requestActors,
    processSelection,
    processViewInputs
  };
}
