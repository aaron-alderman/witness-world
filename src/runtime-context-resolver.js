export function createRuntimeContextResolver({
  bootstrapRunner,
  bootstrapContext,
  resolveLiveRunner,
  createContextForRunner,
  createUnavailableContext
}) {
  const runtimeContexts = new Map([[bootstrapRunner.id, bootstrapContext]]);
  const bootstrapRuntime = { runner: bootstrapRunner, context: bootstrapContext };

  const resolveActiveRuntime = async () => {
    if (!bootstrapRunner.bootstrapOnly) return bootstrapRuntime;
    const resolvedRunner = resolveLiveRunner();
    if (!resolvedRunner?.ok) return bootstrapRuntime;
    const liveRunner = resolvedRunner.runner;
    if (!liveRunner || liveRunner.id === bootstrapRunner.id) return bootstrapRuntime;
    if (runtimeContexts.has(liveRunner.id)) {
      return { runner: liveRunner, context: runtimeContexts.get(liveRunner.id) };
    }
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
