// Hearth server — the seam, over the wire.
//
// Three endpoints are the whole protocol:
//   GET  /surface  -> the surface tree (authored vocabulary, no DOM)
//   GET  /data     -> the bound data (a projection over the witness log)
//   POST /intent   -> an intent -> a witness -> the new data
//
// GET / serves a tiny GENERIC shell, split the way chart-runtime splits
// planChart/drawChart:
//   plan()  (render-plan.js)  — pure, platform-neutral: resolve surface + data
//                               into a concrete render tree. SHARED by every shell.
//   draw()  (below, and the RN shell) — the platform leaf: paint the plan in DOM,
//                               or in React Native widgets. The ONLY part that differs.
// GET /render-plan.js serves the shared pure half to the browser, so the exact
// same plan() runs here and in the native shell.
// Run: `node examples/loam/server.js` then open http://<lan-ip>:4500

import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openWorld, hearthData, applyIntent } from "./world.js";
import { HEARTH_SURFACE } from "./surface.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4500);
const world = openWorld({ witnessLogPath: process.env.HEARTH_LOG || path.join(here, ".data", "hearth.jsonl") });
const RENDER_PLAN_JS = readFileSync(path.join(here, "render-plan.js"), "utf8");

const json = (res, code, body) => {
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(body));
};

const readBody = req =>
  new Promise(resolve => {
    let raw = "";
    req.on("data", c => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method === "GET" && url.pathname === "/surface") return json(res, 200, HEARTH_SURFACE);
  if (req.method === "GET" && url.pathname === "/data") return json(res, 200, hearthData(world));
  if (req.method === "POST" && url.pathname === "/intent") {
    const result = applyIntent(world, await readBody(req));
    return json(res, result.ok ? 200 : 400, { ...result, data: hearthData(world) });
  }
  if (req.method === "GET" && url.pathname === "/render-plan.js") {
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    return res.end(RENDER_PLAN_JS);
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(SHELL_HTML);
  }
  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`hearth seam on http://0.0.0.0:${PORT}  (surface | data | intent | render-plan.js)`);
});

// ── the browser shell: draw() over the shared plan(). knows the vocabulary, not chores ─────
const SHELL_HTML = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<title>Hearth</title>
<style>
  body{font:17px/1.4 system-ui,sans-serif;max-width:460px;margin:0 auto;padding:20px;background:#faf7f2;color:#241f1a}
  h1{font-size:1.5rem;margin:.2em 0 .6em}
  .row{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#fff;border:1px solid #ece5da;border-radius:10px;margin-bottom:8px}
  .row span{flex:1}
  button{font:inherit;border:0;border-radius:8px;padding:8px 14px;background:#e7c98a;cursor:pointer}
  .composer{display:flex;gap:8px;margin-top:14px}
  input{flex:1;font:inherit;padding:10px 12px;border:1px solid #ddd3c5;border-radius:8px}
  .empty{color:#9a8f80;padding:8px 2px}
</style>
<div id=app></div>
<script type=module>
import { planSurface } from "/render-plan.js";   // the SAME pure planner the RN shell uses

const WHO = new URL(location).searchParams.get("who") || localStorage.who || "me";
localStorage.who = WHO;
let SURFACE = null, DATA = null;
const draft = {}; // live field state, keyed by bind — the shell's local half

async function load(){
  SURFACE = await (await fetch("/surface")).json();
  DATA = await (await fetch("/data")).json();
  paint();
}
async function fire(intent){
  const r = await (await fetch("/intent",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(intent)})).json();
  if(r.data) DATA = r.data;
  paint();
}

// draw(): the platform leaf — walk the pure plan, build DOM. (RN swaps this for native widgets.)
function draw(node){
  if(node.prim==="screen"||node.prim==="group"){
    const d=document.createElement("div");
    if(node.role) d.className=node.role;
    (node.children||[]).forEach(c=>d.append(draw(c)));
    return d;
  }
  if(node.prim==="text"){
    const e=document.createElement(node.role==="title"?"h1":"span");
    e.textContent = node.value ?? "";
    return e;
  }
  if(node.prim==="list"){
    const wrap=document.createElement("div");
    if(!node.rows.length){ const e=document.createElement("div"); e.className="empty"; e.textContent=node.empty||""; return e; }
    node.rows.forEach(r=>wrap.append(draw(r)));
    return wrap;
  }
  if(node.prim==="field"){
    const i=document.createElement("input");
    i.placeholder=node.placeholder||"";
    i.value=draft[node.bind] ?? node.value ?? "";
    i.oninput=()=>{ draft[node.bind]=i.value; };
    return i;
  }
  if(node.prim==="button"){
    const b=document.createElement("button");
    b.textContent=node.label||"";
    b.onclick=()=>{
      const it={ intent:node.intent.intent, actor:WHO };
      if(node.intent.arg!=null) it.arg=node.intent.arg;
      if(node.intent.fromField){ it.value=draft[node.intent.fromField] ?? ""; draft[node.intent.fromField]=""; }
      fire(it);
    };
    return b;
  }
  const u=document.createElement("div"); u.textContent="?"+node.prim; return u;
}

function paint(){
  const app=document.getElementById("app");
  app.innerHTML="";
  app.append(draw(planSurface(SURFACE.view, DATA)));   // plan (shared) -> draw (platform)
}
load();
</script>`;
