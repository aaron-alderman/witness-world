import http from "node:http";

export async function startRuntimeUtilityListener({
  requestHandler,
  port = 0,
  host = "127.0.0.1",
  httpModule = http
} = {}) {
  const httpServer = httpModule.createServer(requestHandler);
  await new Promise(resolve => httpServer.listen(port, host, resolve));
  const address = httpServer.address();
  const url = `http://${host}:${address.port}`;
  return {
    httpServer,
    url,
    closeAllConnections() {
      httpServer.closeAllConnections?.();
    },
    close() {
      return new Promise(resolve => httpServer.close(resolve));
    }
  };
}
