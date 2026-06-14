export function renderBootstrapClientHttpFactory() {
  return String.raw`
    const createBootstrapClientHttp = ${createBootstrapClientHttp.toString()};
  `;
}

export function createBootstrapClientHttp({
  fetchFn = (...args) => fetch(...args)
} = {}) {
  const request = async (url, options = {}) => {
    const res = await fetchFn(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "request failed");
    return data;
  };
  const postJson = async (url, body, method = "POST") => request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    request,
    postJson
  };
}
