export function appendQueryParamsToHref(href, params = {}) {
  const base = typeof href === "string" ? href.trim() : "";
  if (!base) return base;
  const nextEntries = Object.entries(params)
    .filter(([, value]) => value != null && String(value).trim());
  if (!nextEntries.length) return base;

  const [pathPart, hashPart = ""] = base.split("#", 2);
  const [pathname, searchPart = ""] = pathPart.split("?", 2);
  const searchParams = new URLSearchParams(searchPart);
  for (const [key, value] of nextEntries) {
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  const nextPath = query ? `${pathname}?${query}` : pathname;
  return hashPart ? `${nextPath}#${hashPart}` : nextPath;
}
