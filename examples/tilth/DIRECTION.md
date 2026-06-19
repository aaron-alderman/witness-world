# Tilth — direction & open design

This captures the design conversation about where tilth is heading, so the
thinking is durable before it is built. Nothing here is implemented yet; it is
the agreed shape and the open decisions. The companion build-as-it-stands is
[`README.md`](./README.md); the end-to-end architecture (including the daemon's
role) is in
`/home/callan/projects/swell/repos/ai/repos/meta/tilth-claude-code-daemon/ARCHITECTURE.md`;
and the remote/shared layer this feeds — framed as a **private network** — is in
`/home/callan/projects/swell/repos/ai/repos/meta/tilth-net/README.md`.

---

## The reframe: marking is publishing

The "Mark DESIRE" button is not a tag. It is a **signal**. When you mark a
transcript, that is the trigger for it to be promoted from a private preview on
your laptop to a full, shared object in a remote world that others (today:
Aaron) can read.

```
~/.claude (private)
   │  daemon reads
   ▼
LOCAL world (tilth, your laptop)          private intake. you browse, you mark.
   │
   │  a DESIRE mark = a SIGNAL
   ▼  daemon reads the full transcript, sanitizes, pushes it →
═══════════ remote membrane ═══════════
REMOTE world (hosted, shared)             the shared space. others read.
        ▲                                  later: comment, get provenance.
        └── this app AND its infra are authored in DESIRE
```

Three things fall out of "marking = publishing":

1. **Privacy is automatic.** Nothing leaves the laptop until it is blessed. The
   marked set *is* the allowlist.
2. **The daemon stays a dumb courier — now across two membranes.** Local intake
   in, remote publish out. It already sees local marks (it talks to
   `/api/sessions`); a marked-but-not-yet-uploaded session is its work queue.
3. **Provenance becomes real and pays off.** Uploaded into the remote world, a
   transcript is witnessed with *you* as actor and a trail back to the og
   session — exactly "the author is the owner, cloned with provenance to the
   og." Sign-in stops being optional; it is what makes the shared space honest.

---

## Two worlds, one app in two roles

The local and remote worlds are the same tilth app in different roles:

- **Local = private intake.** Reads `~/.claude`, holds previews, hosts the
  marking UI. Only marked content is ever uploaded.
- **Remote = shared space.** Holds the *full* sanitized transcripts of marked
  sessions, reachable by others, with provenance to their author.

This is what keeps the publish-gesture and privacy clean. (Alternative
considered: marking against the remote directly — rejected, because it mixes
authors' data and loses the "only marked leaves the laptop" property.)

---

## What the remote membrane accepts

For someone to actually *read* a transcript, the remote membrane must accept the
**full sanitized transcript content**, not just the local preview. So the upload
on a DESIRE mark is heavier than the local import: the daemon reads the whole
session log, sanitizes it (same root-stripping), and posts it to a remote import
route. The remote world witnesses it as a shared, provenance-bearing object.

---

## Infra in DESIRE (the frontier)

The ambition: author the remote app's **infrastructure** in DESIRE too — not
just the app, but where and how it runs.

This is the genuinely unproven part. Nothing in witness-world specifies infra
today. But it should take the **same membrane shape** as everything else:

- **Above the line:** DESIRE authors the *intent* — a deploy target: host,
  domain, persistence location, the remote membrane's address.
- **Below the line:** an irreducible boundary leaf performs the real cloud calls
  (the host provider's API). Infra-as-witnessed-intent + a thin provisioning
  leaf.

The honest tension — sequencing:

- **Fast path:** deploy the app on a boring host and get a transcript in front
  of Aaron soon.
- **Principled path:** infra-in-DESIRE — the actual project.

They are not exclusive. Deploy boringly first, then retrofit the DESIRE infra
spec over a host that already works, so the DESIRE description and the running
reality can be checked against each other.

### How & where (open)

Hosting options, cheapest → fullest, all still on the table:

- **A document on a static host** — render a transcript to a page, share a link.
  No running server; a dead snapshot; no marks/comments.
- **A tunnel to the laptop** (Tailscale = private to one person; cloudflared =
  public link) — the live app, but the laptop must stay awake.
- **A deployed app** (Fly / Render / small VPS), always-on, persisted witness
  log — the real "product running, dev *at* it." Needs auth.

Leaning, given "as simple as possible" and an audience of one: a private tunnel
first to feel it, a real deploy once it proves out — and that deploy is where
infra-in-DESIRE earns its keep.

---

## Open decisions

1. **Two worlds, or one?** (Leaning two — local intake + remote shared.)
2. **Mark = publish, or mark then a separate share gesture?** (Leaning
   mark = publish.)
3. **Remote membrane payload** — full sanitized transcript (confirmed needed for
   readability); what exactly is included vs omitted (tool output? attachments?).
4. **Identity / provenance on the remote** — sign-in so marks and uploads carry
   the real author, not `backendHost`.
5. **How far to push infra-in-DESIRE** vs a thin deploy leaf — the frontier
   scope, and the fast-vs-principled sequencing.
6. **Privacy / access** — even root-sanitized, transcripts are real
   conversations; private-to-Aaron vs public.
