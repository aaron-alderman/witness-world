# Master multi-host example

One platform instance, one witness world, **two hosts** routed by the `Host` header:

| URL | Server runner | Program |
| --- | --- | --- |
| `http://platform.localhost:3000/` | `master_platform_server` (default) | Operator/stewardship console (`plugin.platform`) + OAuth |
| `http://engentus.localhost:3000/` | `engentus_host_server` | Application surface only — **no** operator console |

Run it:

```bash
npm run utility:master    # checked-in worker utility wrapper on an explicit private default port
```

`*.localhost` resolves to `127.0.0.1` on most systems; otherwise add hosts-file entries.

## What this demonstrates

- **Host-header dispatch.** A single process serves multiple URLs. `resolveRunnerForHost` matches the
  request's `Host` against each runner's `hosts = [...]`, falling back to the `default = true` runner.
- **Per-host program isolation.** Only `master_platform_server` installs `plugin.platform`, so
  `/platform` and the `/api/platform-*` endpoints answer there and return **404 on the engentus host**.
  App-authored routes are filtered per runner; plugin-bundle endpoints are gated per runner by the set
  of plugins each runner activates.
- **Default-deny gate.** Both runners set `requireAuth = true`: every endpoint requires an
  authenticated session except the sign-in allowlist — `POST /api/oauth/start`,
  `GET /api/oauth/callback/*`, `/api/session`, and `/mcp/*` (MCP carries its own auth). A route may opt
  out with `params.auth.public = true`. Routes that declare their own `params.auth` policy keep the
  existing per-route flow.
- **Gmail + GitHub sign-in.** The master runner enables both via
  `auth.oauth.providers = "google, github"`. Supply credentials out-of-band (not committed):
  `auth.oauth.google.clientId` / `.clientSecret`, `auth.oauth.github.clientId` / `.clientSecret`
  (endpoints come from built-in vendor presets). `POST /api/oauth/start` with `{ "provider": "google" }`
  or `{ "provider": "github" }` returns an `authorizeUrl` to redirect to.

## Connected accounts (multiple entry points, manual linking)

A user can attach more than one provider to a single identity, so Gmail and GitHub both become entry
points to the same account. This is **manual** — there is no automatic email-based identity collapse.

1. Sign in with one provider (e.g. Google): `POST /api/oauth/start { "provider": "google" }` → follow
   `authorizeUrl` → callback creates/opens the session.
2. While signed in, link the second provider:
   `POST /api/oauth/start { "provider": "github", "action": "link" }` → follow `authorizeUrl`. The
   callback links the GitHub account to the **current** identity (and returns `409` if that GitHub
   account is already linked to a different identity).
3. Inspect connected accounts: `GET /api/oauth/links` lists the identity's provider links.

A front-end "Connected accounts" panel is simply these three calls; no new server endpoints are needed.
