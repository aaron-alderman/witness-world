export function createRuntimeContextResolver({
  bootstrapRunner,
  bootstrapContext,
  resolveLiveRunner,
  createContextForRunner,
  createUnavailableContext
}) {
  const runtimeContexts = new Map([[bootstrapRunner.id, bootstrapContext]]);
  const bootstrapRuntime = { runner: bootstrapRunner, context: bootstrapContext };

  // requestHost (the raw Host header) selects the runner when multiple are defined. Single-app
  // launches resolve back to the bootstrap runner, so behavior there is unchanged.
  const resolveActiveRuntime = async (requestHost = null) => {
    const resolvedRunner = resolveLiveRunner(requestHost);
    if (!resolvedRunner?.ok) return bootstrapRuntime;
    const liveRunner = resolvedRunner.runner;
    if (!liveRunner || liveRunner.id === bootstrapRunner.id) return bootstrapRuntime;
    const liveContext = await createContextForRunner(liveRunner);
    if (!liveContext?.ok) {
      return {
        runner: liveRunner,
        context: createUnavailableContext(liveContext?.reason)
      };
    }
    runtimeContexts.set(liveRunner.id, liveContext);
    return { runner: liveRunner, context: liveContext };
  };

  return {
    runtimeContexts,
    resolveActiveRuntime
  };
}
